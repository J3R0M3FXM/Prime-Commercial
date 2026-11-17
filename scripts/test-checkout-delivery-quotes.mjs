import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {calculatePromoDiscount,addFreeProductToCart} from '../tgcloud/lib/promos.js';
import {calculateChargesBreakdown} from '../tgcloud/lib/charges.js';
const sqlite=new DatabaseSync(':memory:');sqlite.exec("CREATE TABLE couriers(id TEXT,is_active INTEGER);INSERT INTO couriers VALUES('rider',1)");
class EndpointError extends Error{constructor(message,options){super(message);this.code=options?.code;}}
const charges=[{id:'packing',type:'fixed',rate:47,description:'',isActive:true}];
const db={run:async(sql,p={})=>sqlite.prepare(sql).run(p),get:async(sql,p={})=>sqlite.prepare(sql).get(p),select(){let table;return {from(value){table=value;return this;},where(){return this;},orderBy(){return this;},limit(){return this;},get:async()=>({value:''}),all:async()=>table==='charges'?charges:[]};}};
function load(file,names,deps){const source=readFileSync(file,'utf8').replace(/^import[\s\S]*?;\n/gm,'').replace(/export default async function\s*\(/,'async function handler(').replace(/export /g,'');return new Function(...Object.keys(deps),source+';return {'+names.join(',')+'};')(...Object.values(deps));}
const quotes=load('tgcloud/lib/delivery-quotes.js',['saveDeliveryQuote','readDeliveryQuote'],{db,EndpointError});
const original={courier:{id:'rider',name:'Rider',calculatedFee:140},couriers:[{id:'rider',name:'Rider',calculatedFee:140,coverageAvailable:true}],fee:140,distanceKm:10,routeTimeMinutes:10};
const quoted=await quotes.saveDeliveryQuote(original,14.5,121,'111');assert.ok(quoted.deliveryQuoteId);assert.equal(quoted.couriers[0].deliveryQuoteId,quoted.deliveryQuoteId);
assert.equal((await quotes.readDeliveryQuote(quoted.deliveryQuoteId,'111',14.5,121,'rider')).fee,140);
for(const args of [[quoted.deliveryQuoteId,'999',14.5,121,'rider'],[quoted.deliveryQuoteId,'111',14.6,121,'rider']])await assert.rejects(quotes.readDeliveryQuote(...args),{code:'DELIVERY_QUOTE_EXPIRED'});
await assert.rejects(quotes.readDeliveryQuote(quoted.deliveryQuoteId,'111',14.5,121,'other'),{code:'COURIER_OUTSIDE_COVERAGE'});
let freshCalls=0,currentPromo=null;
const deps={db,EndpointError,eq:()=>null,asc:x=>x,desc:x=>x,systemSettings:{},orders:'orders',chargeTable:'charges',customers:'customers',...quotes,
quoteDelivery:async()=>{freshCalls++;return {...original,fee:147};},canonicalizeOrderItems:async items=>({subtotal:1000,itemQuantity:1,items:[{id:items[0].productId,productId:items[0].productId,variantId:'default',price:1000,quantity:1}],reservations:[]}),publicMediaReference:async value=>value||'',calculateCustomerTier:()=>({tier:'Silver'}),calculateOrderRewardPoints:()=>5,calculateChargesBreakdown,resolveTrustedFingerprint:()=>({}),addFreeProductToCart,validatePromo:async()=>({valid:true,code:'SAVE',promoId:'promo',...currentPromo,discountAmount:calculatePromoDiscount(currentPromo,1000,140).discount,shippingSubsidy:calculatePromoDiscount(currentPromo,1000,140).shippingSubsidy})};
const {makeCanonicalSnapshot,sanitizedRequest}=load('tgcloud/endpoints/createOrder.js',['makeCanonicalSnapshot','sanitizedRequest'],deps);
const customer={id:'customer',tgUserId:'111',storeCredits:30};
for(const promo of [null,{discountType:'fixed',discountValue:50},{discountType:'percentage',discountValue:12.5,maxDiscountAmount:80},{discountType:'free_shipping'},{discountType:'shipping_discount',discountValue:60},{discountType:'coins_cashback',discountValue:5},{discountType:'free_product',freeProductId:'gift'}])for(const method of ['upon_checkout','upon_delivery']){
 currentPromo=promo;const calculated=promo?calculatePromoDiscount(promo,1000,140):{discount:0,shippingSubsidy:0};const shipping=promo&&['free_shipping','shipping_discount'].includes(promo.discountType),discount=shipping?0:Math.round(calculated.discount*100)/100,netFee=140-(shipping?calculated.shippingSubsidy:0),now=1000-discount+47+(method==='upon_checkout'?netFee:0)-30,cod=method==='upon_delivery'?netFee:0;
 const request=sanitizedRequest({items:[{productId:'item',quantity:1}],receiverName:'Receiver',receiverPhone:'09123456789',courier:{id:'rider'},deliveryAddress:{lat:14.5,lon:121},deliveryQuoteId:quoted.deliveryQuoteId,deliveryFeePaymentMethod:method,storeCreditsUsed:30,promoCode:promo?'SAVE':'',expectedPayableNow:now,expectedPayableOnDelivery:cod,expectedTotalAmount:now+cod});
 const snapshot=await makeCanonicalSnapshot(request,customer,Math.floor(Date.now()/1000));assert.equal(snapshot.payableNow,now);assert.equal(snapshot.payableOnDelivery,cod);assert.equal(snapshot.deliveryFee,140);
 await assert.rejects(makeCanonicalSnapshot({...request,expectedPayableNow:now-1},customer,Math.floor(Date.now()/1000)),{code:'CHECKOUT_TOTAL_CHANGED'},'Real underpayment must still be rejected');
}
assert.equal(freshCalls,0,'Promo submission uses the quoted fee even if live routing would now return 147');
sqlite.prepare('UPDATE couriers SET is_active=0').run();await assert.rejects(quotes.readDeliveryQuote(quoted.deliveryQuoteId,'111',14.5,121,'rider'),{code:'COURIER_OUTSIDE_COVERAGE'});
sqlite.prepare('UPDATE checkout_delivery_quotes SET expires_at=unixepoch()-1').run();await assert.rejects(quotes.readDeliveryQuote(quoted.deliveryQuoteId,'111',14.5,121,'rider'),{code:'DELIVERY_QUOTE_EXPIRED'});
assert.equal(await quotes.readDeliveryQuote('', '111',14.5,121,'rider'),null,'Legacy clients retain server pricing');
sqlite.close();console.log('PASS: stable delivery quote across every promo type and payment channel, customer/destination/courier binding, expiry, disabled courier rejection and underpayment protection.');
