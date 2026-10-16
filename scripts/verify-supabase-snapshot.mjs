import { createDecipheriv, createHash, scryptSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const filePath = resolve(process.argv[2] || '');
const passphrase = process.env.BACKUP_ENCRYPTION_PASSPHRASE;
if (!process.argv[2]) throw new Error('Usage: node scripts/verify-supabase-snapshot.mjs <backup.pcmbak>');
if (!passphrase || passphrase.length < 20) throw new Error('Set BACKUP_ENCRYPTION_PASSPHRASE to the same passphrase used for export.');

const file = await readFile(filePath);
if (file.length < 50 || file.subarray(0, 6).toString() !== 'PCMBK1') throw new Error('Unsupported or truncated backup format.');
const salt = file.subarray(6, 22);
const iv = file.subarray(22, 34);
const tag = file.subarray(34, 50);
const ciphertext = file.subarray(50);
const key = scryptSync(passphrase, salt, 32);
const decipher = createDecipheriv('aes-256-gcm', key, iv);
decipher.setAuthTag(tag);
const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
const snapshot = JSON.parse(plaintext.toString('utf8'));
if (snapshot.format !== 'prime-commercial-encrypted-backup' || snapshot.version !== 1) throw new Error('Unexpected backup manifest.');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
let totalRows = 0;
for (const [name, table] of Object.entries(snapshot.tables || {})) {
  if (!Array.isArray(table.rows) || table.rows.length !== table.rowCount) throw new Error('Row count mismatch: ' + name);
  const canonical = JSON.stringify([...table.rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
  if (sha256(canonical) !== table.sha256) throw new Error('Table checksum mismatch: ' + name);
  totalRows += table.rows.length;
}
let totalObjects = 0;
let totalBytes = 0;
for (const [bucket, data] of Object.entries(snapshot.storage || {})) {
  if (!Array.isArray(data.objects) || data.objects.length !== data.objectCount) throw new Error('Storage object count mismatch: ' + bucket);
  for (const object of data.objects) {
    const bytes = Buffer.from(object.base64, 'base64');
    if (bytes.length !== object.size || sha256(bytes) !== object.sha256) throw new Error('Storage checksum mismatch: ' + bucket + '/' + object.path);
    totalObjects++;
    totalBytes += bytes.length;
  }
}
console.log('Backup authenticated and verified.');
console.log('Captured at: ' + snapshot.capturedAt);
console.log('Tables: ' + Object.keys(snapshot.tables).length + '; rows: ' + totalRows);
console.log('Buckets: ' + Object.keys(snapshot.storage).length + '; objects: ' + totalObjects + '; media bytes: ' + totalBytes);
console.log('Encrypted file SHA-256: ' + sha256(file));
