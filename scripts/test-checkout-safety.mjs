import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import ts from 'typescript';

// Run the actual credit-toggle handler: enabling credits must not select an amount.
{
  const source = readFileSync('app/components/checkout-modal.tsx', 'utf8');
  const tree = ts.createSourceFile('checkout.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let toggle;
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === 'input') {
      const attributes = node.attributes.properties;
      if (attributes.some(attribute => attribute.name?.getText(tree) === 'checked' && attribute.initializer?.expression?.getText(tree) === 'useStoreCredits')) {
        toggle = attributes.find(attribute => attribute.name?.getText(tree) === 'onChange').initializer.expression;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(toggle, 'Store Credit toggle handler exists');
  let enabled = false, amount = '';
  const handler = new Function('setUseStoreCredits', 'setCreditAmountInput', 'creditAmountInput', 'availableStoreCredits', 'payableBeforeCredits',
    ts.transpileModule('return (' + toggle.getText(tree) + ');', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText)(
    value => { enabled = value; }, value => { amount = value; }, '', 500, 300);
  handler({ target: { checked: true } });
  assert.equal(enabled, true);
  assert.equal(amount, '', 'Enabling credits leaves amount blank, not maximum or zero');
  handler({ target: { checked: false } });
  assert.equal(enabled, false);
  assert.equal(amount, '');
  assert.doesNotMatch(source, /s\.useStoreCredits\s*\?\s*"max"/, 'Legacy drafts must not implicitly select MAX');
  const profile = readFileSync('app/components/account-modal.tsx', 'utf8');
  assert.doesNotMatch(profile, /DeviceSecurityPanel|DeviceSecurityHistory|manageDeviceSecurity/, 'Customer profile excludes staff device diagnostics');
  console.log('PASS: Store Credit toggle leaves amount blank and customer profile excludes device diagnostics.');
}

// Exercise production functions with SQLite, substituting only the hosted SDK.
function load(file, dependencies, names) {
  const source = readFileSync(file, 'utf8').replace(/^import[\s\S]*?;\n/gm, '')
    .replace(/export default async function\s*\(/, 'async function handler(')
    .replace(/export /g, '');
  return new Function(...Object.keys(dependencies), source + '\nreturn {' + names.join(',') + '};')(...Object.values(dependencies));
}

function adapter(database) {
  const query = (q, p) => typeof q === 'string' ? [q, p || {}] : [q.text, q.params];
  return {
    async run(q, p) {
      const [text, params] = query(q, p);
      const statement = database.prepare(text);
      if (/\bRETURNING\b/i.test(text)) {
        const rows = statement.all(params);
        return { rows, rowsAffected: rows.length };
      }
      return { rowsAffected: Number(statement.run(params).changes) };
    },
    async get(q, p) { const [text, params] = query(q, p); return database.prepare(text).get(params); },
    async all(q, p) { const [text, params] = query(q, p); return database.prepare(text).all(params); },
  };
}

let parameterIndex = 0;
function sql(strings, ...values) {
  const params = {};
  let text = strings[0];
  values.forEach((value, index) => {
    if (value && typeof value === 'object' && value.text != null) {
      text += value.text; Object.assign(params, value.params);
    } else {
      const key = ':test' + parameterIndex++;
      text += key; params[key] = value;
    }
    text += strings[index + 1];
  });
  return { text, params };
}

if (!isMainThread) {
  const connection = new DatabaseSync(workerData.file);
  connection.exec('PRAGMA busy_timeout=10000');
  const inventory = load('tgcloud/lib/inventory.js', { db: adapter(connection) }, ['reserveInventoryLine']);
  parentPort.postMessage('ready');
  parentPort.once('message', async () => {
    try {
      const result = await inventory.reserveInventoryLine(workerData.line);
      parentPort.postMessage(result);
    } catch (error) { parentPort.postMessage({ error: error.message }); }
    finally { connection.close(); }
  });
} else {
  const fixtureDir = mkdtempSync(join(tmpdir(), 'prime-checkout-safety-'));
  try {
    const file = join(fixtureDir, 'stock.sqlite');
    const database = new DatabaseSync(file);
    database.exec(`
      CREATE TABLE products (id TEXT PRIMARY KEY, stock INTEGER, is_active INTEGER, bundle_config TEXT);
      CREATE TABLE checkout_operations (id TEXT PRIMARY KEY, status TEXT);
      CREATE TABLE orders (id TEXT PRIMARY KEY, status TEXT, payment_status TEXT, expired_at INTEGER, payment_deadline_at INTEGER);
      CREATE TABLE inventory_reservations (id TEXT PRIMARY KEY, order_id TEXT, product_id TEXT, variant_id TEXT,
        quantity INTEGER, status TEXT, expires_at INTEGER, created_at INTEGER, updated_at INTEGER,
        UNIQUE(order_id,product_id,variant_id));
      INSERT INTO products VALUES ('last',1,1,'{}'),('variants',0,1,'{"variants":[{"id":"red","stock":1},{"id":"blue","stock":1}]}');
      INSERT INTO checkout_operations VALUES ('alice','processing'),('bob','processing');
    `);
    const line = { productId: 'last', variantId: 'default', quantity: 1, expiresAt: Math.floor(Date.now() / 1000) + 120 };
    const workers = ['alice', 'bob'].map(orderId => new Worker(new URL(import.meta.url), { workerData: { file, line: { ...line, orderId } } }));
    await Promise.all(workers.map(worker => new Promise((resolve, reject) => {
      worker.once('message', resolve); worker.once('error', reject);
    })));
    const pending = workers.map(worker => new Promise((resolve, reject) => {
      worker.once('message', resolve); worker.once('error', reject);
    }));
    workers.forEach(worker => worker.postMessage('race'));
    const results = await Promise.all(pending);
    assert.ok(results.every(result => !result.error), JSON.stringify(results));
    assert.equal(results.filter(result => result.reserved).length, 1, 'Only one concurrent customer can reserve the last unit');
    const winner = database.prepare('SELECT order_id AS id FROM inventory_reservations').get().id;
    const inventory = load('tgcloud/lib/inventory.js', { db: adapter(database) }, ['reserveInventoryLine', 'activeReservationTotals', 'withAvailableInventory']);
    assert.equal((await inventory.reserveInventoryLine({ ...line, orderId: winner })).reused, true);
    assert.equal((await inventory.activeReservationTotals()).get('last:default'), 1);
    assert.equal(inventory.withAvailableInventory({ id: 'last', stock: 1 }, await inventory.activeReservationTotals()).stock, 0);
    database.prepare("UPDATE inventory_reservations SET expires_at=unixepoch()-1").run();
    const loser = winner === 'alice' ? 'bob' : 'alice';
    assert.equal((await inventory.reserveInventoryLine({ ...line, orderId: loser })).reserved, true, 'Expired orphan hold is reusable');
    database.prepare("INSERT INTO orders VALUES (?, 'Pending', 'Pending Review', NULL, unixepoch()-1)").run(loser);
    database.prepare("UPDATE inventory_reservations SET expires_at=unixepoch()-1").run();
    assert.equal((await inventory.reserveInventoryLine({ ...line, orderId: winner })).reserved, false, 'Proof-backed pending orders retain stock after the old unpaid deadline');
    assert.equal((await inventory.reserveInventoryLine({ ...line, productId: 'variants', variantId: 'red', orderId: winner })).reserved, true);
    assert.equal((await inventory.reserveInventoryLine({ ...line, productId: 'variants', variantId: 'red', orderId: loser })).reserved, false);
    assert.equal((await inventory.reserveInventoryLine({ ...line, productId: 'variants', variantId: 'blue', orderId: loser })).reserved, true);
    await assert.rejects(() => inventory.reserveInventoryLine({ ...line, orderId: winner, quantity: 0 }));

    // Extract the actual order INSERT guard, then execute it after a hold expires
    // and another customer wins. Saving the original order must fail atomically.
    const orderSource = readFileSync('tgcloud/endpoints/createOrder.js', 'utf8');
    const guard = orderSource.match(/AND NOT EXISTS \(\s*SELECT 1 FROM json_each\(:reservations\) line[\s\S]*?r.quantity <> json_extract\(line.value, '\$\.quantity'\)\)/)[0];
    const guardedWrite = database.prepare(`INSERT INTO orders (id,status,payment_status) SELECT :operation_id,'Pending','Pending Review' WHERE 1=1 ${guard} RETURNING id`);
    assert.equal(guardedWrite.all({ ':operation_id': winner, ':reservations': JSON.stringify([{ ...line }]) }).length, 0);
    assert.equal(guardedWrite.all({ ':operation_id': winner, ':reservations': JSON.stringify([{ productId: 'variants', variantId: 'red', quantity: 1 }]) }).length, 1, 'A valid exact unexpired hold permits order persistence');
    database.close();
    console.log('PASS: real SQLite concurrent last-unit race, variant isolation, retry, expiry, pending-proof retention, atomic save guard.');

    const ledger = new DatabaseSync(':memory:');
    ledger.exec(`
      CREATE TABLE customers (id TEXT PRIMARY KEY, prime_member_id TEXT, points REAL DEFAULT 0, referral_points REAL DEFAULT 0,
        points_operation_id TEXT, points_operation_amount REAL, updated_at INTEGER);
      CREATE TABLE orders (id TEXT PRIMARY KEY, customer_id TEXT, order_number TEXT, status TEXT,payment_status TEXT,delivery_fallback_at INTEGER,dispatched_at INTEGER,
        referred_by_user_id TEXT, referred_by_member_id TEXT, referral_points_amount REAL DEFAULT 0,
        referral_points_status TEXT, referral_points_credit_after INTEGER, referral_points_credited_at INTEGER,
        purchasing_points_amount REAL DEFAULT 0, purchasing_points_credit_after INTEGER, purchasing_points_awarded_at INTEGER, updated_at INTEGER);
      CREATE TABLE point_transactions (id TEXT PRIMARY KEY, user_id TEXT, type TEXT, amount REAL, order_id TEXT, description TEXT, created_at INTEGER);
      INSERT INTO customers (id,prime_member_id) VALUES ('ref','CODE'),('friend','FRIEND');
      INSERT INTO orders (id,customer_id,status,referred_by_user_id,referred_by_member_id,referral_points_amount,referral_points_status,referral_points_credit_after)
        VALUES ('referred','friend','Completed','ref','CODE',50,'pending_30m',unixepoch()-1);
    `);
    const lifecycle = load('tgcloud/lib/order-lifecycle.js', { db: adapter(ledger), sql, expireReceiptResubmissions:async()=>({cancelled:0}),notifyOrderStatusChanged: async () => {} }, ['reconcileOrderMilestones']);
    await lifecycle.reconcileOrderMilestones({ customerId: 'ref', memberId: 'CODE' });
    assert.equal(ledger.prepare("SELECT referral_points FROM customers WHERE id='ref'").get().referral_points, 0);
    assert.equal(ledger.prepare("SELECT referral_points_status FROM orders WHERE id='referred'").get().referral_points_status, 'pending_30m');
    ledger.exec("INSERT INTO orders (id,customer_id,status) VALUES ('own','ref','Dispatched')");
    await lifecycle.reconcileOrderMilestones({ customerId: 'ref', memberId: 'CODE' });
    assert.equal(ledger.prepare('SELECT count(*) AS n FROM point_transactions').get().n, 0);
    ledger.exec("UPDATE orders SET status='Delivered' WHERE id='own'; UPDATE orders SET status='Cancelled' WHERE id='referred'");
    await lifecycle.reconcileOrderMilestones({ customerId: 'ref', memberId: 'CODE' });
    assert.equal(ledger.prepare('SELECT count(*) AS n FROM point_transactions').get().n, 0, 'Cancelled referred order cannot award points');
    ledger.exec("UPDATE orders SET status='Completed' WHERE id='referred'");
    await Promise.all([lifecycle.reconcileOrderMilestones({ customerId: 'ref', memberId: 'CODE' }), lifecycle.reconcileOrderMilestones({ customerId: 'ref', memberId: 'CODE' })]);
    await lifecycle.reconcileOrderMilestones({ customerId: 'ref', memberId: 'CODE' });
    assert.equal(ledger.prepare("SELECT referral_points FROM customers WHERE id='ref'").get().referral_points, 50);
    assert.equal(ledger.prepare('SELECT count(*) AS n FROM point_transactions').get().n, 1, 'Retries and concurrent reconciliation award once');
    ledger.exec(`INSERT INTO orders (id, customer_id, status, purchasing_points_amount, purchasing_points_credit_after)
      VALUES ('fractional-purchase','friend','Completed',5.5,unixepoch()-1)`);
    await lifecycle.reconcileOrderMilestones({ customerId: 'friend' });
    await lifecycle.reconcileOrderMilestones({ customerId: 'friend' });
    assert.equal(ledger.prepare("SELECT points FROM customers WHERE id='friend'").get().points, 5.5, 'Fractional purchasing reward must survive balance credit and retry');
    assert.equal(ledger.prepare("SELECT amount FROM point_transactions WHERE order_id='fractional-purchase'").get().amount, 5.5, 'Ledger must conserve fractional points');
    ledger.close();
    console.log('PASS: referral held before own delivery, no award for cancellation, release when both completed, concurrent exactly-once balance and ledger.');

    class EndpointError extends Error { constructor(message, options) { super(message); this.code = options?.code; } }
    const fakeDb = {
      select() { return { from() { return this; }, where() { return this; }, async get() { return { id: 'customer', tgUserId: '123' }; } }; },
      async get() { return null; },
    };
    const endpoint = load('tgcloud/endpoints/createOrder.js', {
      db: fakeDb, EndpointError, eq: () => null, customers: {}, orders: {},
      findCheckoutOperation: async () => ({ ok: false }),
    }, ['handler']).handler;
    await assert.rejects(() => endpoint({ operationKey: 'a'.repeat(24), paymentProofData: 'forged' }, { initData: { user: { id: 123 } } }), { code: 'PAYMENT_PROOF_REQUIRED' });
    await assert.rejects(() => endpoint({ operationKey: 'a'.repeat(24), paymentSessionId: 'foreign-session' }, { initData: { user: { id: 123 } } }), { code: 'PAYMENT_PROOF_REQUIRED' });
    await assert.rejects(() => endpoint({}, {}), { code: 'AUTH_REQUIRED' });
    console.log('PASS: direct proof bypass, missing/foreign session, unauthenticated submission rejected before order writes.');

    const payments = new DatabaseSync(':memory:');
    payments.exec(`CREATE TABLE orders (id TEXT);
      CREATE TABLE checkout_operations (customer_id TEXT, request_key TEXT, status TEXT);`);
    const paymentDb = adapter(payments);
    paymentDb.select = () => ({ from(table) { this.table = table; return this; }, where() { return this; },
      async get() { return this.table === 'customers' ? { id: 'customer', tgUserId: '123' } : { id: 'qr', isActive: true }; } });
    const dependencies = { bindReceiptAnalysis: async()=>({receiptOcrVerified:false}), db: paymentDb, EndpointError, eq: () => null, customers: 'customers', paymentMethods: 'paymentMethods' };
    const startPayment = load('tgcloud/endpoints/createPaymentSession.js', dependencies, ['handler']).handler;
    const proof = load('tgcloud/endpoints/uploadPaymentProof.js', dependencies, ['handler']).handler;
    const ctx = { initData: { user: { id: 123 } } };
    const request = { items: [{ productId: 'last', quantity: 1 }], receiverName: 'CUSTOMER' };
    const key = 'safe-key-'.repeat(4);
    const session = await startPayment({ request, paymentMethodId: 'qr', operationKey: key }, ctx);
    const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]).toString('base64url');
    await assert.rejects(() => proof({ paymentSessionId: session.paymentSessionId, data: Buffer.from('this is not an image').toString('base64url'), contentType: 'image/png' }, ctx), { code: 'INVALID_PROOF' });
    await assert.rejects(() => proof({ paymentSessionId: session.paymentSessionId, data: image, contentType: 'image/jpeg' }, ctx), { code: 'INVALID_PROOF' });
    await proof({ paymentSessionId: session.paymentSessionId, data: image, contentType: 'image/png' }, ctx);
    assert.equal((await startPayment({ request, paymentMethodId: 'qr', operationKey: key }, ctx)).status, 'proof_uploaded');
    assert.equal((await startPayment({ request: { ...request, receiverName: 'CHANGED' }, paymentMethodId: 'qr', operationKey: key }, ctx)).status, 'awaiting_proof', 'Changing checkout details clears the old proof');
    assert.equal(payments.prepare('SELECT proof_data FROM payment_sessions').get().proof_data, null);
    payments.prepare("UPDATE payment_sessions SET customer_id='another'").run();
    await assert.rejects(() => proof({ paymentSessionId: session.paymentSessionId, data: image, contentType: 'image/png' }, ctx), { code: 'PAYMENT_SESSION_EXPIRED' });
    payments.prepare("UPDATE payment_sessions SET customer_id='customer'").run();
    payments.prepare('INSERT INTO checkout_operations VALUES (?,?,?)').run('customer', key, 'failed');
    const fresh = await startPayment({ request, paymentMethodId: 'qr', operationKey: key }, ctx);
    assert.notEqual(fresh.operationKey, key);
    assert.notEqual(fresh.paymentSessionId, session.paymentSessionId);
    const repeated=await startPayment({request,paymentMethodId:'qr',operationKey:key},ctx);
    assert.equal(repeated.operationKey,fresh.operationKey,'Concurrent retry initialization keeps one effective order key');
    assert.equal(repeated.paymentSessionId,fresh.paymentSessionId);
    const longKey='x'.repeat(120);
    const longFirst=await startPayment({request,paymentMethodId:'qr',operationKey:longKey+'A'},ctx);
    const longSecond=await startPayment({request,paymentMethodId:'qr',operationKey:longKey+'B'},ctx);
    assert.notEqual(longFirst.paymentSessionId,longSecond.paymentSessionId,'Full keys participate in identity without truncation');
    assert.ok(longFirst.paymentSessionId.length<=120);
    payments.close();
    console.log('PASS: proof image/type validation, session ownership, changed-request proof invalidation, effective retry identity.');

    const loyalty = load('tgcloud/lib/loyalty.js', {}, ['calculateCustomerTier', 'calculateOrderRewardPoints']);
    const now = new Date('2026-11-09T00:00:00Z');
    for (const [spending, tier, points] of [[0, 'Silver', 50], [9999.99, 'Silver', 50], [10000, 'Bronze', 55], [14999.99, 'Bronze', 55], [15000, 'Gold', 60], [19999.99, 'Gold', 60], [20000, 'Platinum', 65], [24999.99, 'Platinum', 65], [25000, 'Titanium', 70]]) {
      assert.equal(loyalty.calculateCustomerTier([{ subtotal: spending, status: 'Completed', deliveredAt: now }], now).tier, tier);
      assert.equal(loyalty.calculateOrderRewardPoints(1000, tier), points);
      assert.equal(loyalty.calculateOrderRewardPoints(100, tier), points / 10);
    }
    assert.equal(loyalty.calculateCustomerTier([{ subtotal: 25000, status: 'Completed', deliveredAt: Math.floor(now.getTime() / 1000) }], now).tier, 'Titanium');
    assert.equal(loyalty.calculateCustomerTier([], now).tier, 'Silver');
    assert.equal(loyalty.calculateCustomerTier([{ subtotal: 25000, status: 'Completed', deliveredAt: now }], new Date(now.getTime() + 30 * 86400000)).tier, 'Silver');
    assert.equal(loyalty.calculateCustomerTier([{ subtotal: 25000, status: 'Cancelled', deliveredAt: now }], now).tier, 'Silver');
    const cycleOrders = [{ subtotal: 9900, status: 'Completed', deliveredAt: now }];
    assert.equal(loyalty.calculateOrderRewardPoints(100, loyalty.calculateCustomerTier(cycleOrders, now).tier), 5);
    cycleOrders.push({ subtotal: 100, status: 'Completed', deliveredAt: now });
    assert.equal(loyalty.calculateCustomerTier(cycleOrders, now).tier, 'Bronze');
    assert.equal(loyalty.calculateOrderRewardPoints(100, loyalty.calculateCustomerTier(cycleOrders, now).tier), 5.5, 'Bronze replaces the Silver rate after completed spending reaches 10000 in the same cycle');
    assert.equal(loyalty.calculateOrderRewardPoints(299, 'Silver'), 14.95);
    assert.equal(loyalty.calculateOrderRewardPoints(299, 'Bronze'), 16.45);
    assert.equal(loyalty.calculateOrderRewardPoints(1000, 'Silver', 0, 100, 100), 40);
    assert.equal(loyalty.calculateOrderRewardPoints(1000, 'Bronze', 0, 100, 100), 44);
    assert.equal(loyalty.calculateOrderRewardPoints(1000, 'Silver', 100), 100, 'Voucher and tier reward must not double-count');
    console.log('PASS: all tier boundaries/rates, cycle reset, cancelled exclusion, epoch dates, discounts, credits, voucher conservation.');

    const storage = new Map();
    const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
    const transpiled = ts.transpileModule(readFileSync('lib/checkout-draft.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    function reloadDraftModule() { const exports = {}; new Function('exports', 'localStorage', transpiled)(exports, localStorage); return exports; }
    const drafts = reloadDraftModule();
    const state = { currentStep: 5, receiverName: 'CUSTOMER', selectedPaymentMethod: { id: 'qr' }, uploadedProofImage: 'data:image/png;base64,receipt', submissionKey: 'saved-order-key', submissionSessionId: 'saved-session' };
    assert.equal(drafts.saveCheckoutDraft('123', [{ id: 'last', quantity: 1 }], state), true);
    assert.deepEqual(reloadDraftModule().readCheckoutDraft('123').state, state, 'Payment/receipt/submission identity survives a module reload');
    assert.equal(drafts.readCheckoutDraft('456'), null, 'Another Telegram account cannot restore the draft');
    const draftKey = [...storage.keys()][0];
    const old = JSON.parse(storage.get(draftKey)); old.savedAt -= 25 * 3600000; storage.set(draftKey, JSON.stringify(old));
    assert.equal(drafts.readCheckoutDraft('123'), null);
    assert.equal(drafts.saveCheckoutDraft('not-auth', [{ id: 'x' }], state), false);
    drafts.saveCheckoutDraft('123', [{ id: 'x' }], state); drafts.clearCheckoutDraft('123');
    assert.equal(drafts.readCheckoutDraft('123'), null);
    console.log('PASS: payment draft reload, receipt and retry identity, account isolation, expiry, terminal cleanup.');
  } finally { rmSync(fixtureDir, { recursive: true, force: true }); }
}
