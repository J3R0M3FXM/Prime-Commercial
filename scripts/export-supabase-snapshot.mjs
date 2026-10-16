import { createClient } from '@supabase/supabase-js';
import { createCipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const passphrase = process.env.BACKUP_ENCRYPTION_PASSPHRASE;
if (!url || !serviceKey) throw new Error('Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in the local environment.');
if (!passphrase || passphrase.length < 20) throw new Error('Set BACKUP_ENCRYPTION_PASSPHRASE to a strong passphrase of at least 20 characters.');
if (process.env.SUPABASE_SERVICE_ROLE_KEY === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error('Refusing to run: SUPABASE_SERVICE_ROLE_KEY appears to equal the public anon key.');
}

const tables = [
  'products', 'customers', 'orders', 'payment_methods', 'promos',
  'promo_redemptions', 'warehouses', 'couriers', 'charges', 'point_transactions',
  'system_settings', 'videos', 'telegram_automation_flows',
  'telegram_automation_settings', 'telegram_automation_chats', 'maya_webhook_events',
];
const buckets = ['product-images', 'receipt-proofs', 'media-gallery'];
const pageSize = 500;
const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function exportTable(name) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from(name).select('*').range(offset, offset + pageSize - 1);
    if (error) throw new Error('Table export failed for ' + name + ': ' + error.message);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  const canonical = JSON.stringify([...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
  return { rowCount: rows.length, sha256: sha256(canonical), rows };
}

async function exportBucket(bucket) {
  const objects = [];
  async function walk(prefix) {
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await supabase.storage.from(bucket).list(prefix, {
        limit: 100,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) throw new Error('Storage listing failed for ' + bucket + '/' + prefix + ': ' + error.message);
      for (const item of data || []) {
        const path = prefix ? prefix + '/' + item.name : item.name;
        const isFile = Boolean(item.id || item.metadata);
        if (!isFile) {
          await walk(path);
          continue;
        }
        const { data: blob, error: downloadError } = await supabase.storage.from(bucket).download(path);
        if (downloadError || !blob) throw new Error('Storage download failed for ' + bucket + '/' + path + ': ' + (downloadError?.message || 'empty response'));
        const bytes = Buffer.from(await blob.arrayBuffer());
        objects.push({
          path,
          contentType: item.metadata?.mimetype || item.metadata?.contentType || blob.type || 'application/octet-stream',
          size: bytes.length,
          sha256: sha256(bytes),
          base64: bytes.toString('base64'),
        });
      }
      if (!data || data.length < 100) break;
    }
  }
  await walk('');
  return {
    objectCount: objects.length,
    totalBytes: objects.reduce((sum, object) => sum + object.size, 0),
    objects,
  };
}

const capturedAt = new Date().toISOString();
const snapshot = {
  format: 'prime-commercial-encrypted-backup',
  version: 1,
  projectUrl: url,
  capturedAt,
  consistencyNote: 'Paged export; freeze writes during capture and compare counts/checksums with a second capture before cutover.',
  tables: {},
  storage: {},
};

for (const name of tables) {
  snapshot.tables[name] = await exportTable(name);
  console.log('Exported table ' + name + ': ' + snapshot.tables[name].rowCount + ' rows');
}
for (const bucket of buckets) {
  snapshot.storage[bucket] = await exportBucket(bucket);
  console.log('Exported bucket ' + bucket + ': ' + snapshot.storage[bucket].objectCount + ' objects, ' + snapshot.storage[bucket].totalBytes + ' bytes');
}

const plaintext = Buffer.from(JSON.stringify(snapshot));
const salt = randomBytes(16);
const iv = randomBytes(12);
const key = scryptSync(passphrase, salt, 32);
const cipher = createCipheriv('aes-256-gcm', key, iv);
const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
const tag = cipher.getAuthTag();
const file = Buffer.concat([Buffer.from('PCMBK1'), salt, iv, tag, ciphertext]);
const output = resolve(process.argv[2] || './migration-backups/prime-commercial-' + capturedAt.replace(/[:.]/g, '-') + '.pcmbak');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, file, { mode: 0o600, flag: 'wx' });
console.log('Encrypted backup written: ' + output);
console.log('Encrypted file bytes: ' + file.length + '; encrypted SHA-256: ' + sha256(file));
console.log('Keep the passphrase separately. This file contains customer data, payment secrets, webhook payloads, and private receipt files.');
