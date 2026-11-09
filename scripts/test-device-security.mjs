import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
import { sanitizeFingerprint, saveCustomerFingerprint } from '../tgcloud/lib/fingerprints.js';

function load(file, dependencies, names) {
  const source = readFileSync(file, 'utf8').replace(/^import[\s\S]*?;\n/gm, '')
    .replace(/export default async function\s*\(/, 'async function handler(').replace(/export /g, '');
  return new Function(...Object.keys(dependencies), source + '\nreturn {' + names.join(',') + '};')(...Object.values(dependencies));
}
const database = new DatabaseSync(':memory:');
const people = [ { id: 'alice', tgUserId: '11', isBanned: false }, { id: 'bob', tgUserId: '22', isBanned: false }, { id: 'banned', tgUserId: '33', isBanned: true } ];
const db = {
  async run(sql, params = {}) { return { rowsAffected: Number(database.prepare(sql).run(params).changes) }; },
  async get(sql, params = {}) { return database.prepare(sql).get(params); },
  async all(sql, params = {}) { return database.prepare(sql).all(params); },
  select() { return { from() { return { where(condition) { return { async get() { return people.find(person => person[condition.key] === condition.value); } }; } }; } }; },
};
database.exec("CREATE TABLE customers (id TEXT PRIMARY KEY,tg_user_id TEXT,fingerprints TEXT DEFAULT '[]',updated_at INTEGER,tg_name TEXT,tg_username TEXT,prime_member_id TEXT); INSERT INTO customers(id,tg_user_id) VALUES('alice','11'),('bob','22');");
const names = ['ensureDeviceSecurityTables', 'recordDeviceSession', 'persistFingerprintHistory', 'readDeviceSecurity', 'sharedDeviceAccounts', 'normalizeReportedIp', 'runtimeCapabilities', 'pruneDeviceSecurity'];
const security = load('tgcloud/lib/device-security.js', { db, sanitizeFingerprint, saveCustomerFingerprint }, names);
class EndpointError extends Error { constructor(message, details) { super(message); this.code = details?.code; } }
const context = id => ({ initData: { user: { id }, hash: 'private-auth-value' } });
const requireAdmin = async ctx => { if (String(ctx?.initData?.user?.id) !== '99') throw new EndpointError('Admin access required.', { code: 'ADMIN_REQUIRED' }); };
const { handler } = load('tgcloud/endpoints/manageDeviceSecurity.js', { db, customers: { id: 'id', tgUserId: 'tgUserId' }, eq: (key, value) => ({ key, value }), EndpointError, requireAdmin, ...security }, ['handler']);
const installationId = crypto.randomUUID();
const fingerprint = { installationId, deviceId: 'DEV_LEGACY', sessionToken: `SESS_${crypto.randomUUID()}`, fingerprintId: 'a'.repeat(32), fingerprintProvider: 'FingerprintJS', fingerprintStatus: 'Available', telegramUserId: '22', firstSeenAt: 1, riskScore: 100, trustStatus: 'trusted', latitude: 14.5995, browser: 'test' };
const sanitized = await sanitizeFingerprint(fingerprint);
assert.equal(sanitized.installationId, installationId);
assert.equal(sanitized.telegramUserId, undefined);
assert.equal(sanitized.trustStatus, undefined);
assert.equal(sanitized.latitude, undefined);
assert.equal((await sanitizeFingerprint({ installationId: 'forged', fingerprintId: 'bad' })).installationId, '');
await assert.rejects(handler({ action: 'record', fingerprint }, {}), e => e.code === 'AUTH_REQUIRED');
await assert.rejects(handler({ action: 'record', fingerprint }, context(33)), e => e.code === 'ACCOUNT_UNAVAILABLE');
await assert.rejects(handler({ action: 'staffDetail', customerId: 'bob' }, context(11)), e => e.code === 'ADMIN_REQUIRED');
await assert.rejects(handler({ action: 'capabilities' }, context(11)), e => e.code === 'ADMIN_REQUIRED');
const first = await handler({ action: 'record', fingerprint, telegramUserId: '22' }, context(11));
assert.equal(first.newInstallation, true);
assert.ok(first.reasons.includes('New Installation'));
const repeat = await handler({ action: 'record', fingerprint }, context(11));
assert.equal(first.sessionId, repeat.sessionId);
let owned = await handler({ action: 'list', customerId: 'bob' }, context(11));
assert.equal(owned.devices.length, 1); assert.equal(owned.sessions.length, 1);
assert.equal(owned.events.filter(event => event.eventType === 'Session Started').length, 1);
assert.ok(owned.devices[0].firstSeenAt > 1);
assert.equal(owned.devices[0].trustStatus, 'observed');
assert.equal(owned.devices[0].metadata.sessionToken, undefined);
const bob = await handler({ action: 'record', fingerprint }, context(22));
assert.notEqual(first.deviceId, bob.deviceId); assert.notEqual(first.sessionId, bob.sessionId);
assert.ok(bob.reasons.includes('Signals Shared With Another Account'));
assert.equal((await handler({ action: 'list' }, context(11))).devices.length, 1);
assert.equal((await handler({ action: 'staffDetail', customerId: 'bob' }, context(99))).devices.length, 1);
assert.equal((await handler({ action: 'staffDetail', customerId: 'bob' }, context(99))).sharedAccounts[0].customerId, 'alice');
assert.equal((await handler({ action: 'list' }, context(22))).sharedAccounts, undefined);
const changed = await handler({ action: 'record', fingerprint: { ...fingerprint, fingerprintId: 'b'.repeat(32) } }, context(11));
assert.ok(changed.reasons.includes('Browser Fingerprint Changed'));
const row = database.prepare('SELECT fingerprints FROM customers WHERE id=?').get('alice');
const basic = await saveCustomerFingerprint({ tgUserId: '11', fingerprints: row.fingerprints }, { ...fingerprint, fingerprintId: '', fingerprintStatus: 'Pending' });
assert.equal(basic.latestFingerprint.fingerprintId, 'b'.repeat(32));
for (const invalid of ['999.1.1.1', '01.1.1.1', 'example.com', 'https://1.1.1.1', '1.1.1.1:80', ':::1', '1:2:3', 'fe80::1%en0', '::ffff:999.1.1.1']) assert.equal(security.normalizeReportedIp(invalid), '', invalid);
for (const valid of ['1.1.1.1', '2001:db8::1', '::1', '::ffff:192.0.2.1', '1:2:3:4:5:6:7:8']) assert.equal(security.normalizeReportedIp(valid), valid);
await assert.rejects(handler({ action: 'network', sessionId: first.sessionId, reportedIp: '1.1.1.1' }, context(11)), e => e.code === 'CONSENT_REQUIRED');
await assert.rejects(handler({ action: 'network', sessionId: first.sessionId, consent: true, reportedIp: '1.1.1.1' }, context(22)), e => e.code === 'NOT_FOUND');
const network = await handler({ action: 'network', sessionId: first.sessionId, consent: true, reportedIp: '1.1.1.1', trustedServerIp: true }, context(11));
assert.equal(network.trustedServerIp, false);
for (const coords of [{ latitude: null, longitude: 120 }, { latitude: '14', longitude: 120 }, { latitude: 91, longitude: 120 }, { latitude: 14, longitude: 181 }, { latitude: 14, longitude: 120, accuracy: -1 }]) await assert.rejects(handler({ action: 'location', sessionId: first.sessionId, consent: true, ...coords }, context(11)), e => e.code === 'INVALID_LOCATION');
const location = await handler({ action: 'location', sessionId: first.sessionId, consent: true, latitude: 14.5995, longitude: 120.9842, accuracy: 12 }, context(11));
assert.equal(location.preciseCoordinatesStored, false);
owned = await handler({ action: 'list' }, context(11));
assert.equal(owned.sessions[0].locationAccuracy, 12);
assert.equal(owned.sessions[0].reportedIp, '1.1.1.1');
assert.equal(owned.sessions[0].ipSource, 'Browser-Reported');
assert.doesNotMatch(JSON.stringify(owned), /14\.5995|120\.9842|private-auth-value/);
const diagnostics = await handler({ action: 'capabilities' }, { ...context(99), request: { headers: { authorization: 'secret' }, clientIp: '192.0.2.5' }, metadata: { token: 'secret-value' } });
assert.equal(diagnostics.serverIpAvailable, false);
assert.deepEqual(diagnostics.requestKeys, ['headers', 'clientIp']);
assert.doesNotMatch(JSON.stringify(diagnostics), /secret-value|private-auth-value|192\.0\.2\.5/);
database.prepare('UPDATE device_security_sessions SET last_seen_at=1 WHERE telegram_user_id=?').run('11');
await security.pruneDeviceSecurity('11');
assert.equal((await handler({ action: 'list' }, context(11))).sessions.length, 0);
assert.equal((await handler({ action: 'list' }, context(22))).sessions.length, 1);
database.close();
console.log('PASS: real SQLite enrollment/idempotency, account isolation, review-only risk, consent, IP provenance, coordinate non-retention, diagnostic privacy and scoped retention');

// Run the production browser collector against native-storage and privacy restrictions.
function storage() { const values = new Map(); return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; }
const localStorage = storage(), sessionStorage = storage();
const nativeValues = new Map(); let advancedLoads = 0; let releasedContexts = 0;
const webApp = { platform: 'android', version: '9.0', initDataUnsafe: { user: { id: 11 } }, isVersionAtLeast: () => true, DeviceStorage: {
  getItem: (key, callback) => callback(null, nativeValues.get(key) || null),
  setItem: (key, value, callback) => { nativeValues.set(key, value); callback(null, true); },
} };
const fakeWindow = { localStorage, sessionStorage, Telegram: { WebApp: webApp }, devicePixelRatio: 2, indexedDB: {}, matchMedia: () => ({ matches: false }) };
const nav = { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/120.0 Mobile', platform: 'Linux', language: 'en', languages: ['en'], hardwareConcurrency: 8, maxTouchPoints: 5, onLine: true };
const document = { createElement: () => ({ getContext: () => ({ getExtension: name => name === 'WEBGL_lose_context' ? { loseContext: () => releasedContexts++ } : null }) }) };
const compiled = ts.transpileModule(readFileSync('lib/device-recognition.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function browserModule(window = fakeWindow) {
  const exports = {};
  new Function('exports', 'require', 'window', 'navigator', 'screen', 'document', compiled)(exports, name => {
    assert.equal(name, '@fingerprintjs/fingerprintjs');
    return { load: async options => { advancedLoads++; assert.equal(options.monitoring, false); return { get: async () => ({ visitorId: 'f'.repeat(32), version: '5.3.0' }) }; } };
  }, window, nav, { width: 390, height: 844, availWidth: 390, availHeight: 844, colorDepth: 24 }, document);
  return exports;
}
const browserOne = browserModule();
const identity = await browserOne.getInstallationIdentity();
assert.equal(identity.storageSource, 'Telegram DeviceStorage');
assert.match(identity.installationId, /^[0-9a-f-]{36}$/);
assert.equal((await browserModule().getInstallationIdentity()).installationId, identity.installationId);
assert.equal((await browserOne.collectRecognitionSignals(false)).fingerprintStatus, 'Pending'); assert.equal(advancedLoads, 0);
const sessionOne = browserOne.getRecognitionSessionToken(identity.deviceId, '11');
assert.equal(browserModule().getRecognitionSessionToken(identity.deviceId, '11'), sessionOne);
assert.notEqual(browserOne.getRecognitionSessionToken(identity.deviceId, '22'), sessionOne);
assert.equal((await browserOne.collectRecognitionSignals()).fingerprintId, 'f'.repeat(32));
assert.equal((await browserOne.collectRecognitionSignals()).fingerprintId, 'f'.repeat(32)); assert.equal(advancedLoads, 1);
assert.ok(releasedContexts >= 3);
const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); }, removeItem() { throw Error('blocked'); } };
const privateBrowser = browserModule({ ...fakeWindow, localStorage: blocked, sessionStorage: blocked, Telegram: undefined });
const ephemeral = await privateBrowser.getInstallationIdentity();
assert.equal(ephemeral.storageSource, 'Memory');
assert.equal((await privateBrowser.getInstallationIdentity()).installationId, ephemeral.installationId);
assert.equal(privateBrowser.getRecognitionSessionToken(ephemeral.deviceId, '11'), privateBrowser.getRecognitionSessionToken(ephemeral.deviceId, '11'));
console.log('PASS: native installation persistence, account-scoped reload-stable random sessions, storage-denied fallback, deferred/cached SDK with monitoring disabled and GPU cleanup');
