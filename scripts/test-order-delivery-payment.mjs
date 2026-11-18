import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {orderDeliveryPaymentMethod} from '../tgcloud/lib/order-delivery-payment.js';
const cases=[
 [{deliveryAddress:{courierPaymentMode:'upon_delivery'},payableOnDelivery:75},'upon_delivery'],
 [{deliveryAddress:{courierPaymentMode:'upon_delivery'},payableOnDelivery:0},'upon_delivery'],
 [{deliveryAddress:{courierPaymentMode:'upon_checkout'},payableOnDelivery:0},'upon_checkout'],
 [{delivery_address:JSON.stringify({courierPaymentMode:'upon_delivery'}),payable_on_delivery:0},'upon_delivery'],
 [{deliveryFeePaymentMethod:'checkout'},'upon_checkout'],
 [{deliveryFeePaymentMethod:'PUD'},'upon_delivery'],
 [{payableOnDelivery:75},'upon_delivery'],
 [{deliveryFeePaymentMethod:'',payableOnDelivery:0},''],
 [{deliveryAddress:{courierPaymentMode:'upon_delivery'},deliveryFeePaymentMethod:'upon_checkout'},'upon_delivery'],
];
const source=readFileSync('app/components/order-history-modal.tsx','utf8'),start=source.indexOf('function normalizeOrder('),end=source.indexOf('\nfunction timestampMs(',start);
const compiled=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const normalize=new Function('orderDeliveryPaymentMethod',compiled+';return normalizeOrder;')(orderDeliveryPaymentMethod);
for(const [order,expected] of cases){assert.equal(orderDeliveryPaymentMethod(order),expected);assert.equal(normalize(order).deliveryFeePaymentMethod,expected);}
assert.match(source,/selectedOrder\.deliveryFeePaymentMethod === "upon_checkout" \?/,'Unknown timing cannot default to checkout');
assert.match(source,/Pay Upon Delivery \(PUD\)/);assert.match(source,/Payment Timing Not Recorded/);
console.log('PASS: shared API/history normalization, stored PUD with positive or waived balance, checkout, old aliases, cached records and unknown timing.');
