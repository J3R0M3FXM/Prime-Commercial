import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

const backupPath = resolve(process.argv[2] || '');
const manifestPath = resolve(process.argv[3] || './migration-backups/telegram-media-map.pcmmapping');
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const storageChatId = process.env.TELEGRAM_STORAGE_CHAT_ID;
const expectedBotId = String(process.env.EXPECTED_TELEGRAM_BOT_ID || '');
const expectedBotUsername = String(process.env.EXPECTED_TELEGRAM_BOT_USERNAME || '').replace(/^@/, '').toLowerCase();
const passphrase = process.env.BACKUP_ENCRYPTION_PASSPHRASE;
if (!process.argv[2]) throw new Error('Usage: node scripts/migrate-media-to-telegram.mjs <encrypted-backup.pcmbak> [encrypted-map.pcmmapping]');
if (!botToken || !storageChatId || (!expectedBotId && !expectedBotUsername)) {
  throw new Error('Set TELEGRAM_BOT_TOKEN, TELEGRAM_STORAGE_CHAT_ID, and EXPECTED_TELEGRAM_BOT_ID or EXPECTED_TELEGRAM_BOT_USERNAME locally.');
}
if (!passphrase || passphrase.length < 20) throw new Error('Set the same BACKUP_ENCRYPTION_PASSPHRASE used for the snapshot.');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function decryptArtifact(file, header) {
  const marker = Buffer.from(header);
  if (file.length < marker.length + 44 || !file.subarray(0, marker.length).equals(marker)) {
    throw new Error('Unsupported or truncated encrypted artifact: ' + header);
  }
  const offset = marker.length;
  const salt = file.subarray(offset, offset + 16);
  const iv = file.subarray(offset + 16, offset + 28);
  const tag = file.subarray(offset + 28, offset + 44);
  const ciphertext = file.subarray(offset + 44);
  const key = scryptSync(passphrase, salt, 32);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function encryptArtifact(value, header) {
  const marker = Buffer.from(header);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(value));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([marker, salt, iv, cipher.getAuthTag(), ciphertext]);
}

async function saveManifest(manifest) {
  const bytes = encryptArtifact(manifest, 'PCMMAP1');
  await mkdir(dirname(manifestPath), { recursive: true });
  const tempPath = manifestPath + '.' + randomBytes(4).toString('hex') + '.tmp';
  await writeFile(tempPath, bytes, { mode: 0o600, flag: 'wx' });
  await rename(tempPath, manifestPath);
}

async function telegram(method, body) {
  const response = await fetch('https://api.telegram.org/bot' + botToken + '/' + method, body ? {
    method: 'POST',
    body,
  } : { method: 'GET' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    const error = new Error('Telegram API ' + method + ' failed: ' + (payload.description || response.statusText));
    error.retryAfter = Number(payload.parameters?.retry_after) || 0;
    throw error;
  }
  return payload.result;
}

const backupBytes = await readFile(backupPath);
const snapshot = JSON.parse(decryptArtifact(backupBytes, 'PCMBK1').toString('utf8'));
if (snapshot.format !== 'prime-commercial-encrypted-backup' || snapshot.version !== 1) {
  throw new Error('Input file is not a supported Prime Commercial snapshot.');
}

const me = await telegram('getMe');
if ((expectedBotId && String(me.id) !== expectedBotId) ||
    (expectedBotUsername && String(me.username || '').toLowerCase() !== expectedBotUsername)) {
  throw new Error('Bot identity mismatch. No files were uploaded. Actual bot: @' + (me.username || '(no username)') + ', ID ' + me.id + '.');
}
const chat = await telegram('getChat', new URLSearchParams({ chat_id: storageChatId }));
if (chat.type !== 'private' || String(chat.id) !== String(storageChatId)) {
  throw new Error('Storage chat must be a verified private chat with this bot. No files were uploaded.');
}

let manifest = {
  format: 'prime-commercial-telegram-media-map',
  version: 1,
  botId: String(me.id),
  botUsername: me.username || '',
  storageChatId: String(chat.id),
  createdAt: new Date().toISOString(),
  entries: {},
};
try {
  const existing = await readFile(manifestPath);
  const previous = JSON.parse(decryptArtifact(existing, 'PCMMAP1').toString('utf8'));
  if (previous.format !== manifest.format || String(previous.botId) !== String(me.id) ||
      String(previous.storageChatId) !== String(chat.id)) {
    throw new Error('Existing manifest belongs to a different bot or storage chat.');
  }
  manifest = previous;
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

let uploaded = 0;
let skipped = 0;
for (const [bucket, bucketData] of Object.entries(snapshot.storage || {})) {
  for (const object of bucketData.objects || []) {
    const key = bucket + '/' + object.path;
    const existing = manifest.entries[key];
    if (existing && existing.sha256 === object.sha256 && existing.fileId) {
      skipped++;
      continue;
    }

    const bytes = Buffer.from(object.base64, 'base64');
    if (bytes.length !== object.size || sha256(bytes) !== object.sha256) {
      throw new Error('Source object checksum failed: ' + key);
    }
    if (bytes.length > 50 * 1024 * 1024) throw new Error('Telegram Bot API upload limit exceeded for ' + key);

    const form = new FormData();
    form.append('chat_id', String(chat.id));
    form.append('caption', ('Prime Commercial media archive: ' + key).slice(0, 900));
    form.append('document', new Blob([bytes], { type: object.contentType || 'application/octet-stream' }), basename(object.path) || 'media.bin');

    let message;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        message = await telegram('sendDocument', form);
        break;
      } catch (error) {
        if (!error.retryAfter || attempt === 3) throw error;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, error.retryAfter * 1000));
      }
    }
    const document = message?.document;
    if (!document?.file_id) throw new Error('Telegram did not return a document file ID for ' + key);

    manifest.entries[key] = {
      bucket,
      path: object.path,
      fileId: document.file_id,
      messageId: message.message_id,
      contentType: object.contentType || 'application/octet-stream',
      size: bytes.length,
      sha256: object.sha256,
      uploadedAt: new Date().toISOString(),
    };
    manifest.updatedAt = new Date().toISOString();
    await saveManifest(manifest);
    uploaded++;
    console.log('Uploaded ' + key + ' (' + bytes.length + ' bytes)');
  }
}

console.log('Media transfer finished. Uploaded: ' + uploaded + '; already mapped: ' + skipped + '.');
console.log('Encrypted mapping saved at: ' + manifestPath);
console.log('Bot identity verified: @' + (me.username || '(no username)') + ' (' + me.id + '); storage chat type verified as private.');
console.log('This script only creates a mapping; target DB import and media endpoint wiring are separate steps.');
