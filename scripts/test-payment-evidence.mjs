import assert from 'node:assert/strict';
import {moneyCents,parseMayaSms,extractReceiptEvidence,comparePaymentEvidence} from '../tgcloud/lib/payment-evidence.js';
const smsBody=`2026-11-19 23:40:44
Payment received: PHP 946.00 via QRPH.
Total QR sales since 12:00 am is PHP 946.00.
QR Ph Invoice No: 435346
TRN: oTxbv7Zvyd18`;
const sms=parseMayaSms('MayaBiz',smsBody);assert.equal(sms.qrPhInvoice,'435346');assert.equal(sms.mayaTrn,'oTxbv7Zvyd18');assert.equal(sms.amountCents,94600);
const bpi=extractReceiptEvidence(`Payment was successful!
Thursday, Nov 19 2026; 11:40:41 PM (GMT+8)
Confirmation No. R1795102841603679349
Transaction Ref. No. 004632323435346
Sent via BPI
Pay merchant
JEROME BALANCAR
Payment amount
PHP 946.00
Fee
PHP 0.00`);
assert.equal(bpi.fullReference,'004632323435346');assert.equal(bpi.reference,'435346');assert.equal(bpi.amountCents,94600);assert.equal(bpi.paidAt,'2026-11-19T15:40:41.000Z');
assert.deepEqual(comparePaymentEvidence(bpi,sms,94600),{status:'sms_corroborated',matched:true,secondsApart:3,requiresManualReview:true});
for(const [text,type,reference] of [
 ['GCash\nQRPH Invoice No. 001234','qrph_invoice','001234'],
 ['Maya\nReference ID: oTxbv7Zvyd18','maya_trn','oTxbv7Zvyd18'],
 ['MariBank\nReference Number: 001234','qrph_invoice','001234'],
 ['SeaBank\nReference Number: 001234','qrph_invoice','001234'],
 ['UnionBank\nInstapay Reference Number: 001234','qrph_invoice','001234'],
 ['Maya Transaction No. PREFIX-20261119-oTxbv7Zvyd18','maya_trn','oTxbv7Zvyd18'],
 ['Card Payment\nMaya Transaction No. 1234567890oTxbv7Zvyd18','maya_trn','oTxbv7Zvyd18'],
]){const parsed=extractReceiptEvidence(text);assert.equal(parsed.referenceType,type,text);assert.equal(parsed.reference,reference,text)}
for(const text of ['GCash\nQRPH Invoice No. 0012345','GCash\nQRPH Invoice No. 43 53 46','Maya\nReference ID: oTxbv7Zvyd1O','BPI\nTransaction Ref. No. 004632323453346']){
 const evidence=extractReceiptEvidence(text);assert.notEqual(evidence.reference,'435346','Never reorder or substitute characters');
}
assert.equal(extractReceiptEvidence('UnknownBank\nReference Number: 435346').reference,'','Do not invent rules for other banks');
assert.equal(extractReceiptEvidence('QRPH Invoice No. 435346\nQRPH Invoice No. 435347').reference,'','Conflicting labelled values fail closed');
assert.equal(parseMayaSms('OtherSender',smsBody),null);assert.equal(parseMayaSms('MayaBiz',smsBody+'\nOTP: 123456'),null);
assert.equal(parseMayaSms('MayaBiz',smsBody.replace('PHP 946.00 via','PHP 1,946.00 via')).amountCents,194600,'Never use daily sales as payment amount');
assert.equal(comparePaymentEvidence(bpi,{...sms,qrPhInvoice:'435364'},94600).matched,false);
assert.equal(comparePaymentEvidence(bpi,sms,94500).matched,false);
assert.equal(comparePaymentEvidence({...bpi,paidAt:null},sms,94600).matched,false);
assert.equal(comparePaymentEvidence({...bpi,paidAt:'2026-11-19T14:40:41.000Z'},sms,94600).matched,false);
assert.equal(moneyCents('PHP 1,234.50'),123450);assert.equal(moneyCents('1,23.50'),null);
console.log('PASS: exact BPI/SMS case, all seven provider mappings, leading zeroes, case preservation, conflicts, sender/OTP filtering, daily-sales exclusion, amounts and times.');

const iconReceipt='Paid via GCash\nAmount 1,019.00\nDate Nov 20, 2026 5:10 AM\nQRPH Invoice No. 123456 0';
const iconEvidence=extractReceiptEvidence(iconReceipt);
assert.equal(iconEvidence.reference,'123456','Copy-icon OCR does not hide the intact six-digit token');
assert.equal(iconEvidence.amountCents,101900);
assert.equal(iconEvidence.paidAtPrecision,'minute');
for(const invalid of ['1234560','123 456','12345O 0','123456-0','X123456','123456X','123456 654321','123456 123456'])assert.equal(extractReceiptEvidence(iconReceipt.replace('123456 0',invalid)).reference,'','No joining, correction, truncation or ambiguous token choice: '+invalid);
const minuteMatch=comparePaymentEvidence(iconEvidence,{qrPhInvoice:'123456',amountCents:101900,paidAt:'2026-11-19T21:10:45.000Z'},101900);
assert.equal(minuteMatch.matched,true);assert.equal(minuteMatch.secondsApart,undefined,'Minute receipts cannot claim an exact second difference');
assert.equal(minuteMatch.secondsApartMin,0);assert.equal(minuteMatch.secondsApartMax,45);
assert.equal(comparePaymentEvidence(iconEvidence,{qrPhInvoice:'123456',amountCents:101900,paidAt:'2026-11-19T20:55:00.000Z'},101900).matched,false,'The entire receipt minute must fit the allowed time window');
console.log('PASS: labelled intact identifiers survive separate copy-icon OCR tokens; ambiguous/joined/altered digits fail; minute-only receipt timing remains explicit.');
