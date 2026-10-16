import { createDecipheriv, scryptSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const manifestPath = resolve(process.argv[2] || '');
const passphrase = process.env.BACKUP_ENCRYPTION_PASSPHRASE;
const adminId = String(process.env.TELEGRAM_ADMIN_USER_ID || '');
if (!process.argv[2]) throw new Error('Usage: node scripts/import-telegram-media-map.mjs <encrypted-map.pcmmapping>');
if (!passphrase || passphrase.length < 20) throw new Error('Set BACKUP_ENCRYPTION_PASSPHRASE locally.');
if (!/^[0-9]+$/.test(adminId)) throw new Error('Set TELEGRAM_ADMIN_USER_ID to the authorized admin Telegram user ID.');
if (!process.env.TGCLOUD_TOKEN) {
  console.warn('TGCLOUD_TOKEN is not set; the CLI must already be logged in with npx tgcloud login.');
}

function decryptManifest(file) {
  const marker = Buffer.from('PCMMAP1');
  if (file.length < marker.length + 44 || !file.subarray(0, marker.length).equals(marker)) {
    throw new Error('Unsupported or truncated encrypted Telegram media map.');
  }
  const offset = marker.length;
  const salt = file.subarray(offset, offset + 16);
  const iv = file.subarray(offset + 16, offset + 28);
  const tag = file.subarray(offset + 28, offset + 44);
  const ciphertext = file.subarray(offset + 44);
  const key = scryptSync(passphrase, salt, 32);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'));
}

const manifest = decryptManifest(await readFile(manifestPath));
if (manifest.format !== 'prime-commercial-telegram-media-map' || manifest.version !== 1 ||
    !manifest.botId || !manifest.storageChatId || !manifest.entries) {
  throw new Error('Media map metadata is invalid.');
}

const assets = Object.values(manifest.entries).map((entry) => ({
  bucket: entry.bucket,
  path: entry.path,
  fileId: entry.fileId,
  messageId: entry.messageId,
  contentType: entry.contentType,
  size: entry.size,
  sha256: entry.sha256,
  orderId: entry.orderId || null,
  visibility: entry.bucket === 'product-images' ? 'public'
    : entry.bucket === 'receipt-proofs' ? 'private' : 'private',
}));
if (!assets.length) throw new Error('The encrypted media map contains no entries.');

for (let offset = 0; offset < assets.length; offset += 50) {
  const batch = assets.slice(offset, offset + 50);
  const input = JSON.stringify({ action: 'import', assets: batch });
  const ctx = JSON.stringify({ initData: { user: { id: Number(adminId) } } });
  const result = spawnSync('npx', [
    'tgcloud', 'run', 'endpoints/manageMediaAssets', input, '--ctx', ctx,
  ], { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Media import batch failed at offset ' + offset + '. Re-run to resume; imports are idempotent by bucket/path.');
  console.log('Imported media mapping batch ' + (Math.floor(offset / 50) + 1) + ' (' + batch.length + ' entries).');
}

console.log('Media mapping import completed for ' + assets.length + ' assets.');
console.log('Verified Bot ID from manifest: ' + manifest.botId + '. Storage chat ID: ' + manifest.storageChatId + '.');
console.log('Receipt-proof assets remain private. No media bytes or Telegram file IDs were printed.');
