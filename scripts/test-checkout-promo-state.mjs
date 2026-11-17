import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync('app/components/checkout-modal.tsx','utf8');
const apply=source.slice(source.indexOf('  const handleApplyPromo ='),source.indexOf('  const handleRemovePromo ='));
const confirmStart=source.indexOf('  const confirmCheckoutCodes ='),confirmEnd=source.indexOf('\n  };',confirmStart)+5;
const compile=text=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const math=source.slice(source.indexOf('      const reviewPromo ='),source.indexOf('      const [fpData, clientObservedIp]'));
for(const promo of [{code:'SAVE',discountType:'fixed',discountAmount:50},{code:'SHIP',discountType:'shipping_discount',discountAmount:60,shippingSubsidy:60}]){
 const confirmedPromo={current:null};let pendingPromo=null;const noop=()=>{};
 const deps={promoCodeInput:promo.code,promoValidationVersion:{current:0},referralValidationVersion:{current:0},checkoutCodeCheckBusy:{current:false},confirmedPromo,setAppliedPromo:value=>{pendingPromo=value;},setIsCheckingPromo:noop,setPromoError:noop,getClientFingerprint:async()=>({deviceId:'device'}),selectedItems:[{quantity:1}],itemsSubtotal:1000,courierDeliveryFee:140,tgCustomer:{id:'111'},deliveryPaymentMethod:'upon_checkout',selectedCourier:{id:'rider',deliveryQuoteId:'quote',deliveryQuoteExpiresAt:Date.now()/1000+3600},selectedCourierId:'rider',getOrCreateSessionToken:()=>'',hasTelegramServerlessBridge:()=>true,callServerless:async()=>({valid:true,...promo}),setTgCustomer:noop,setIsConfirmingCodes:noop,fetchCouriersForLocation:async()=>assert.fail('Valid quote must not be refreshed'),coords:{lat:14,lon:121},setCurrentStep:noop,setSubmitError:message=>{if(message)assert.fail(message);},existingReferrer:null,referralCodeInput:'',handleApplyReferral:async()=>true};
 const handlers=new Function(...Object.keys(deps),compile(apply+source.slice(confirmStart,confirmEnd))+';return {confirmCheckoutCodes};')(...Object.values(deps));
 assert.equal(await handlers.confirmCheckoutCodes(),true);assert.equal(confirmedPromo.current,pendingPromo,'Validated promo is available synchronously before React commits pending state');
 const now=promo.discountType==='fixed'?1107:1097;
 const values={confirmedPromo,itemsSubtotal:1000,courierDeliveryFee:140,freshChargeBreakdown:{totalChargesAmount:47},deliveryPaymentMethod:'upon_checkout',useStoreCredits:true,creditAmountInput:'30',availableStoreCredits:30,payableNow:now,payableOnDelivery:0,setCurrentStep:noop,setSubmitError:message=>{if(message)assert.fail(message);}};
 const totals=new Function(...Object.keys(values),compile(math)+';return {code:reviewPromo?.code,reviewPayableNow,reviewPayableOnDelivery};')(...Object.values(values));assert.deepEqual(totals,{code:promo.code,reviewPayableNow:now,reviewPayableOnDelivery:0});
 const steps=[],messages=[];values.payableNow=now-1;values.setCurrentStep=step=>steps.push(step);values.setSubmitError=message=>messages.push(message);
 const changed=new Function(...Object.keys(values),compile(math)+';return true;')(...Object.values(values));assert.equal(changed,undefined);assert.deepEqual(steps,[4]);assert.match(messages[0],/If you already paid/,'Real changes return to review before a payment session is created');
 deps.selectedCourier.deliveryQuoteExpiresAt=0;deps.fetchCouriersForLocation=async()=>true;deps.setCurrentStep=step=>steps.push(step);deps.setSubmitError=message=>messages.push(message);deps.callServerless=async()=>assert.fail('Expired quote must stop before promo/payment requests');
 const expired=new Function(...Object.keys(deps),compile(apply+source.slice(confirmStart,confirmEnd))+';return {confirmCheckoutCodes};')(...Object.values(deps));assert.equal(await expired.confirmCheckoutCodes(),false);assert.equal(steps.at(-1),4);assert.match(messages.at(-1),/delivery quote was refreshed/);
 deps.selectedCourier.deliveryQuoteExpiresAt=Date.now()/1000+300;deps.callServerless=async()=>({valid:true,...promo});deps.fetchCouriersForLocation=async()=>assert.fail('A still-valid quote must be honored at submission');deps.setSubmitError=message=>{if(message)assert.fail(message);};
 const remaining=new Function(...Object.keys(deps),compile(apply+source.slice(confirmStart,confirmEnd))+';return {confirmCheckoutCodes};')(...Object.values(deps));assert.equal(await remaining.confirmCheckoutCodes(false),true);
}
console.log('PASS: actual promo validation/submission calculations use the fresh result before React renders, for item and shipping discounts.');
