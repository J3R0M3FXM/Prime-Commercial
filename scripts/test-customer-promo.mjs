import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkPromoItems, calculatePromoDiscount, deserializePromo, generatePromoCode, serializePromoDescription } from '../tgcloud/lib/promos.js';

function load(path, dependencies) {
  const source = readFileSync(path, 'utf8').replace(/^import[\s\S]*?;\n/gm, '').replace(/export default async function\s*\(/, 'async function handler(');
  return new Function(...Object.keys(dependencies), source + '\nreturn handler;')(...Object.values(dependencies));
}
const fields = names => Object.fromEntries(names.map(name => [name, name]));
const customers = fields(['id', 'tgUserId', 'primeMemberId']);
const orders = fields(['customerId', 'primeMemberId', 'status', 'subtotal', 'createdAt', 'deliveredAt']);
const promos = fields(['id', 'code', 'createdAt', 'isActive']);
const promoRedemptions = fields(['promoCode', 'promoId', 'usedAt', 'releasedAt']);
const rows = new Map([[customers, [{ id: 'alice', tgUserId: '111', primeMemberId: 'ABC123' }, { id: 'bob', tgUserId: '222', primeMemberId: 'DEF456' }, { id: 'carol', tgUserId: '333', primeMemberId: 'GHI789' }, { id: 'dave', tgUserId: '444', primeMemberId: 'JKL012' }]], [orders, []], [promos, []], [promoRedemptions, []]]);
const claims = [];
const eq = (field, value) => row => row[field] === value;
const and = (...checks) => row => checks.every(check => check(row));
const or = (...checks) => row => checks.some(check => check(row));
const sql = (_strings, ...values) => ({ values });
const requirementBundles = new Map();
const db = {
  async get(_query, params) { if(String(_query).startsWith('SELECT bundle_config'))return requirementBundles.has(params[':id'])?{bundleConfig:JSON.stringify(requirementBundles.get(params[':id']))}:null; return rows.get(orders).find(order =>
    (order.customerId === params[':customer_id'] || order.tgUserId === params[':telegram_id']) &&
    ['completed', 'delivered'].includes(String(order.status || '').toLowerCase())) || null; },
  async all(query) { const [promoId, code] = query.values; return claims.filter(claim =>
    (!query.values.length || claim.promoId === promoId || claim.promoCode === code) &&
    (claim.status === 'redeemed' || (claim.status === 'held' && claim.expiresAt > Math.floor(Date.now() / 1000)))); },
  select() { return { from(table) {
    let condition = () => true;
    const query = { where(check) { condition = check; return query; }, orderBy() { return query; }, limit() { return query; }, async get() { return rows.get(table).find(condition); }, async all() { return rows.get(table).filter(condition); } };
    return query;
  } }; },
  insert(table) { return { values(value) { return { returning() { return { async run() { rows.get(table).push(value); return [value]; } }; } }; } }; },
  update(table) { return { set(value) { return { where(condition) { return { returning() { return { async run() { const row = rows.get(table).find(condition); if (!row) return []; Object.assign(row, value); return [row]; } }; } }; } }; } }; },
};
class EndpointError extends Error { constructor(message, info) { super(message); this.code = info.code; } }
const requireAdmin = async ctx => { if (ctx?.initData?.user?.id !== 999) throw new EndpointError('Admin required', { code: 'ADMIN_REQUIRED' }); };
const manage = load('tgcloud/endpoints/managePromos.js', { db, EndpointError, desc: field => field, eq, sql, requireAdmin, deserializePromo, generatePromoCode, serializePromoDescription, promoRedemptions, promos });
const validate = load('tgcloud/endpoints/validatePromo.js', { db, and, asc: field => field, eq, isNull: field => row => row[field] == null, or, sql, calculateCustomerTier: () => ({ tier: 'Silver' }), resolveTrustedFingerprint: (_customer, submitted) => submitted, checkPromoItems, calculatePromoDiscount, deserializePromo, customers, orders, promoRedemptions, promos });
const validateReferral = load('tgcloud/endpoints/validateReferral.js', { db, eq, customers, orders });
const publicPromos = load('tgcloud/endpoints/getActivePromos.js', { db, desc: field => field, eq, deserializePromo, promos });
const context = id => ({ initData: { user: { id } } });
const input = { action: 'create', id: 'promo-1', code: 'PRIVATE', title: 'Private Offer', description: 'Private description', voucherType: 'shop_voucher', discountType: 'fixed', discountValue: 50, maxDiscountAmount: null, cappedShippingDiscount: null, cashbackPercentage: null, minSpend: 0, minItemQuantity: null, customerEligibility: 'specific_customer', eligibleCustomerId: ' abc123 ', minPreviousOrders: null, eligibleTiers: [], allowedPaymentMethods: ['all'], allowedCourierIds: ['all'], activeDaysOfWeek: [0,1,2,3,4,5,6], isPaydayOnly: false, flashHourStart: null, flashHourEnd: null, totalUsageLimit: null, usageLimitPerCustomer: 1, isActive: true, startDate: null, endDate: null };
await assert.rejects(manage(input, context(111)), error => error.code === 'ADMIN_REQUIRED');
const created = await manage(input, context(999));
assert.equal(created.eligibleCustomerId, 'abc123');
assert.equal(created.customerEligibility, 'specific_customer');
const publicOffer = (await publicPromos()).find(promo => promo.code === 'PRIVATE');
assert.ok(publicOffer); assert.equal(publicOffer.eligibleCustomerId, undefined, 'Assigned customer identifier is not public');
assert.equal((await validate({ code: 'PRIVATE', itemsSubtotal: 500 }, context(111))).valid, true, 'Assigned PRIME member can redeem');
assert.equal((await validate({ code: 'PRIVATE', itemsSubtotal: 500, eligibleCustomerId: 'ABC123' }, context(222))).valid, false, 'Client input cannot impersonate the assigned customer');
const stored = rows.get(promos)[0];
const originalDescription = stored.description;
stored.description = JSON.stringify({ ...JSON.parse(originalDescription), eligibleCustomerId: '' });
assert.equal((await validate({ code: 'PRIVATE', itemsSubtotal: 500 }, context(111))).valid, false, 'Legacy malformed restrictions fail closed');
stored.description = originalDescription;
let updated = await manage({ action: 'update', id: 'promo-1', eligibleCustomerId: '222', title: 'Updated' }, context(999));
assert.equal(updated.eligibleCustomerId, '222');
assert.equal((await validate({ code: 'PRIVATE', itemsSubtotal: 500 }, context(222))).valid, true, 'Assigned Telegram ID can redeem');
assert.equal((await validate({ code: 'PRIVATE', itemsSubtotal: 500 }, context(111))).valid, false);
updated = await manage({ action: 'update', id: 'promo-1', description: 'Changed' }, context(999));
assert.equal(updated.eligibleCustomerId, '222', 'Unrelated updates preserve the restriction');
await assert.rejects(manage({ action: 'update', id: 'promo-1', eligibleCustomerId: '' }, context(999)), error => error.code === 'INVALID_INPUT');
await manage({ action: 'update', id: 'promo-1', eligibleCustomerId: '', isActive: false }, context(999));
assert.equal((await validate({ code: 'PRIVATE', itemsSubtotal: 500 }, context(111))).valid, false);
await assert.rejects(manage({ ...input, id: 'promo-2', code: 'MISSING', eligibleCustomerId: '' }, context(999)), error => error.code === 'INVALID_INPUT');
const general = await manage({ ...input, id: 'promo-3', code: 'GENERAL', customerEligibility: 'all', eligibleCustomerId: '' }, context(999));
assert.equal(general.eligibleCustomerId, '');
assert.equal((await validate({ code: 'GENERAL', itemsSubtotal: 500 }, context(111))).valid, true);
assert.equal((await validate({ code: 'GENERAL', itemsSubtotal: 500 }, context(222))).valid, true);
const generalRow = rows.get(promos).find(row => row.code === 'GENERAL');
generalRow.isActive = 0;
assert.match((await validate({ code: 'GENERAL', itemsSubtotal: 500 }, context(111))).error, /inactive/i, 'Numeric false must be inactive');
generalRow.isActive = true;
generalRow.endDate = Math.floor(Date.now() / 1000) - 60;
assert.match((await validate({ code: 'GENERAL', itemsSubtotal: 500 }, context(111))).error, /expired/i, 'Expired epoch-second dates must be rejected');
generalRow.endDate = null;
claims.push({ promoId: generalRow.id, promoCode: 'GENERAL', customerId: 'alice', deviceId: 'SHARED-DEVICE', hardwareId: 'SHARED-HARDWARE', deviceFingerprintId: '', status: 'redeemed' });
assert.match((await validate({ code: 'GENERAL', itemsSubtotal: 500, deviceId: 'SHARED-DEVICE' }, context(222))).error, /same device/i, 'A second account on the same device must not redeem');
for (const telegramId of [333, 444]) {
  assert.match((await validate({ code: 'GENERAL', itemsSubtotal: 500, deviceId: 'SHARED-DEVICE' }, context(telegramId))).error, /same device/i, 'Additional accounts on the same device must not redeem');
}
assert.match((await validate({ code: 'GENERAL', itemsSubtotal: 500, hardwareId: 'SHARED-HARDWARE' }, context(222))).error, /same device/i, 'A shared hardware signal must also block another account');
assert.match((await validate({ code: 'GENERAL', itemsSubtotal: 500, deviceId: 'SHARED-DEVICE' }, context(111))).error, /already redeemed/i, 'The same customer must respect the per-customer limit');
claims[0].status = 'held'; claims[0].expiresAt = Math.floor(Date.now() / 1000) + 60;
assert.match((await validate({ code: 'GENERAL', itemsSubtotal: 500, deviceId: 'SHARED-DEVICE' }, context(222))).error, /same device/i, 'An active checkout hold also blocks another account');
claims[0].expiresAt = Math.floor(Date.now() / 1000) - 60;
assert.equal((await validate({ code: 'GENERAL', itemsSubtotal: 500, deviceId: 'SHARED-DEVICE' }, context(222))).valid, true, 'Expired holds do not consume a promo');
claims.length = 0;
claims.push({ promoId: generalRow.id, promoCode: 'GENERAL', customerId: 'alice', deviceId: 'SHARED-DEVICE', hardwareId: 'SHARED-HARDWARE', status: 'redeemed' },
  { promoId: generalRow.id, promoCode: 'GENERAL', customerId: 'bob', deviceId: 'OTHER-DEVICE', hardwareId: 'SHARED-HARDWARE', status: 'redeemed' });
const listedGeneral = (await manage({ action: 'list' }, context(999))).find(row => row.code === 'GENERAL');
assert.equal(listedGeneral.usageCount, 2, 'Admin promo usage includes serverless claims');
assert.equal(listedGeneral.fraudFlagsCount, 2, 'Admin flags accounts sharing a hardware signal');
claims.length = 0;
assert.equal((await validateReferral({ referralCode: 'DEF456' }, context(111))).valid, true, 'A new customer can use an existing member referral');
rows.get(customers)[0].referredByMemberId = 'PREVIOUS';
assert.match((await validateReferral({ referralCode: 'DEF456' }, context(111))).error, /already linked/i, 'A referral linked after initial validation must be rejected');
rows.get(customers)[0].referredByMemberId = '';
rows.get(customers)[0].isBanned = 1;
assert.match((await validateReferral({ referralCode: 'DEF456' }, context(111))).error, /cannot use/i, 'A banned account cannot continue with a referral');
rows.get(customers)[0].isBanned = false;
const orderSource = readFileSync('tgcloud/endpoints/createOrder.js', 'utf8');
assert.match(orderSource, /promo = await validatePromo\([\s\S]*?id: customer\.tgUserId[\s\S]*?if \(!promo\?\.valid\)/, 'Order submission repeats promo validation using the authenticated customer');
assert.match(orderSource, /const referral = await validateReferral\([\s\S]*?if \(!referral\?\.valid\)/, 'Order submission repeats referral validation');
console.log('PASS: promo create/update round-trip, admin authorization, customer-specific enforcement and order revalidation.');

const basketPromo = await manage({...input,id:'basket-promo',code:'BASKET',customerEligibility:'all',eligibleCustomerId:'',requiredItems:[{productId:'coffee',variantId:'large',quantity:2}]},context(999));
assert.deepEqual(basketPromo.requiredItems,[{productId:'coffee',variantId:'large',quantity:2}]);
assert.equal((await validate({code:'BASKET',itemsSubtotal:500},context(111))).valid,false,'Missing basket fails closed');
assert.equal((await validate({code:'BASKET',itemsSubtotal:500,items:[{productId:'coffee',variantId:'small',quantity:5}]},context(111))).valid,false,'Wrong variant fails');
assert.equal((await validate({code:'BASKET',itemsSubtotal:500,items:[{productId:'coffee',variantId:'large',quantity:1},{productId:'coffee',variantId:'large',quantity:1}]},context(111))).valid,true,'Split lines satisfy required quantity');
assert.equal((await validate({code:'BASKET',itemsSubtotal:500,items:[{productId:'coffee',variantId:'large',quantity:2,isFree:true}]},context(111))).valid,false,'Free gifts do not satisfy purchase requirements');
const preserved = await manage({action:'update',id:'basket-promo',title:'Renamed'},context(999));
assert.deepEqual(preserved.requiredItems,basketPromo.requiredItems,'Unrelated edits preserve product rules');
await assert.rejects(manage({action:'update',id:'basket-promo',requiredItems:[{productId:'coffee',quantity:0}]},context(999)),error=>error.code==='INVALID_INPUT');
await assert.rejects(manage({action:'update',id:'basket-promo',requiredItems:[{productId:'coffee',quantity:1},{productId:'coffee',quantity:2}]},context(999)),error=>error.code==='INVALID_INPUT');
await manage({action:'update',id:'basket-promo',requiredItems:[{productId:'coffee',variantId:'',quantity:2}],minItemQuantity:3},context(999));
assert.equal((await validate({code:'BASKET',itemsSubtotal:500,itemQuantity:3,items:[{productId:'coffee',variantId:'small',quantity:1},{productId:'coffee',variantId:'large',quantity:1},{productId:'tea',quantity:1}]},context(111))).valid,true,'Any variant counts across variants');
assert.equal((await validate({code:'BASKET',itemsSubtotal:500,itemQuantity:0,items:[{productId:'coffee',quantity:3}]},context(111))).valid,false,'Zero cannot bypass minimum basket count');
await manage({action:'update',id:'basket-promo',requiredItems:[],minItemQuantity:null},context(999));
assert.equal((await validate({code:'BASKET',itemsSubtotal:500},context(111))).valid,true,'Requirements can be cleared');
assert.equal(checkPromoItems({requiredItems:[{productId:'coffee',variantId:'',quantity:2}]},[{productId:'coffee',quantity:-1}]).length>0,true);
assert.equal(checkPromoItems({requiredItems:{}},[]).length>0,true);
for(const path of ['tgcloud/endpoints/createOrder.js','tgcloud/lib/pos-pricing.js'])assert.match(readFileSync(path,'utf8'),/items: cart.items/,'Final pricing must validate canonical products');
console.log('PASS: product/variant purchase rules, split quantities, gifts, persistence, malformed rules and authoritative checkout/POS wiring.');

// Four variant-specific alternatives: each one alone qualifies in ANY mode.
const alternatives = ['coffee','tea','cocoa','juice'].map(productId=>({productId,variantId:'large',quantity:2}));
await manage({action:'update',id:'basket-promo',requiredItems:alternatives,requiredItemsMatch:'any'},context(999));
for (const rule of alternatives) {
 const result=await validate({code:'BASKET',itemsSubtotal:500,items:[{...rule}]},context(111));
 assert.equal(result.valid,true,rule.productId+' alone qualifies without the other three products');
 assert.equal((await validate({code:'BASKET',itemsSubtotal:500,items:[{...rule,variantId:'small',quantity:10}]},context(111))).valid,false,'Wrong variant does not qualify');
 assert.equal((await validate({code:'BASKET',itemsSubtotal:500,items:[{...rule,quantity:1}]},context(111))).valid,false,'Each alternative keeps its quantity minimum');
}
assert.equal((await validate({code:'BASKET',itemsSubtotal:500,items:alternatives.map(rule=>({...rule,isFree:true}))},context(111))).valid,false,'Free gifts cannot qualify any mode');
assert.equal((await validate({code:'BASKET',itemsSubtotal:500,items:alternatives.map(rule=>({...rule,quantity:1}))},context(111))).valid,false,'Different alternatives do not pool quantities');
const anyPreserved=await manage({action:'update',id:'basket-promo',title:'Alternatives preserved'},context(999));
assert.equal(anyPreserved.requiredItemsMatch,'any','Unrelated edits preserve ANY mode');
await assert.rejects(manage({action:'update',id:'basket-promo',requiredItemsMatch:'either'},context(999)),error=>error.code==='INVALID_INPUT');
await manage({action:'update',id:'basket-promo',requiredItemsMatch:'all'},context(999));
assert.equal((await validate({code:'BASKET',itemsSubtotal:500,items:[alternatives[3]]},context(111))).valid,false,'All mode requires all four');
assert.equal((await validate({code:'BASKET',itemsSubtotal:500,items:alternatives},context(111))).valid,true,'All four correct variants qualify in ALL mode');
assert.match(checkPromoItems({requiredItemsMatch:'any',requiredItems:[alternatives[0],{productId:'tea',variantId:'large',quantity:0}]},[alternatives[0]]),/invalid/,'A matching first rule cannot hide a malformed later rule');
assert.match(checkPromoItems({requiredItemsMatch:'corrupt',requiredItems:alternatives},alternatives),/invalid/);
assert.equal(checkPromoItems({requiredItems:alternatives},[alternatives[0]]).length>0,true,'Legacy rules still require ALL items');
assert.equal(checkPromoItems({requiredItemsMatch:'any',requiredItems:[]},[]),'','Empty list remains unrestricted');
console.log('PASS: four product/variant alternatives independently qualify; ALL, quantities, gifts, invalid modes and legacy behavior remain enforced.');

// Match the saved German Thunder labels, including their approximate-unit suffix.
requirementBundles.set('german',{variants:[
 {id:'half',name:'.50g | ~60u'}, {id:'one',name:'1.0g | ~120u'},
 {id:'small',name:'.40g | ~48u'}, {id:'mg',name:'500mg'},
 {id:'other',name:'Large'}, {id:'flavor',name:'1.0g | Different flavor'}
]});
await manage({action:'update',id:'basket-promo',requiredItemsMatch:'any',requiredItems:[{productId:'german',variantId:'half',quantity:1}]},context(999));
for(const variantId of ['half','one','mg'])assert.equal((await validate({code:'BASKET',itemsSubtotal:6000,items:[{productId:'german',variantId,quantity:1}]},context(111))).valid,true,variantId+' meets the 0.5g minimum');
for(const variantId of ['small','other','missing','flavor'])assert.equal((await validate({code:'BASKET',itemsSubtotal:6000,items:[{productId:'german',variantId,quantity:10,name:'100g',variantName:'100g'}]},context(111))).valid,false,variantId+' cannot bypass the catalog minimum');
assert.equal((await validate({code:'BASKET',itemsSubtotal:6000,items:[{productId:'different-product',variantId:'one',quantity:1}]},context(111))).valid,false,'Another product cannot satisfy German Thunder');
assert.equal((await validate({code:'BASKET',itemsSubtotal:6000,items:[{productId:'german',variantId:'one',quantity:1,isFree:true}]},context(111))).valid,false,'Larger free gifts cannot qualify');
console.log('PASS: German Thunder 0.5g minimum accepts 1.0g and equivalent units; smaller, unrelated, fabricated and free variants fail.');

await manage({action:'update',id:'basket-promo',requiredItemsMatch:'all',requiredItems:[{productId:'german',variantId:'half',quantity:1},{productId:'coffee',variantId:'large',quantity:2}]},context(999));
assert.equal((await validate({code:'BASKET',itemsSubtotal:6000,items:[{productId:'german',variantId:'one',quantity:1}]},context(111))).valid,false,'A larger weight cannot skip another ALL requirement');
assert.equal((await validate({code:'BASKET',itemsSubtotal:6000,items:[{productId:'german',variantId:'one',quantity:1},{productId:'coffee',variantId:'large',quantity:2}]},context(111))).valid,true,'Larger weight works with all product conditions');
await manage({action:'update',id:'basket-promo',requiredItems:[{productId:'german',variantId:'half',quantity:2}]},context(999));
assert.equal((await validate({code:'BASKET',itemsSubtotal:6000,items:[{productId:'german',variantId:'one',quantity:1}]},context(111))).valid,false,'Weight comparison does not bypass a required unit count');
console.log('PASS: weight minimums preserve ALL-product conditions and unit-count requirements.');
