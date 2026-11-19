export const RECEIPT_RULE_VERSION = 2;
// Provider-labelled identifiers are never rearranged, fuzzy-matched or OCR-corrected.
const clean = value => String(value || '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\r\n?/g, '\n');
export function moneyCents(value) {
  const text = String(value ?? '').trim().replace(/^(?:PHP|₱)\s*/i, '');
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.replace(/,/g, '').split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}
function values(text, label) {
  const regex = new RegExp('(?:^|\\n)[ \\t]*' + label + '[ \\t]*:?[ \\t]*([^\\n]*)(?=\\n|$)', 'gi');
  const found = [];
  let match;
  while ((match = regex.exec(text))) {
    let value = match[1].trim();
    if (!value) value = text.slice(regex.lastIndex).replace(/^\n/, '').split('\n')[0].trim();
    found.push(value);
  }
  return [...new Set(found)];
}
function uniqueValue(text, label, pattern) {
  const candidates = values(text, label);
  const valid = candidates.filter(value => pattern.test(value));
  return candidates.length === 1 && valid.length === 1 ? valid[0] : '';
}
// A receipt copy icon can OCR as a separate token after the real identifier.
// Accept one complete labelled token; never join digits or cut a longer token.
function uniqueReceiptValue(text, label, pattern) {
  const candidates = values(text, label);
  if (candidates.length !== 1) return '';
  if (pattern.test(candidates[0])) return candidates[0];
  const tokens = candidates[0].split(/\s+/).filter(token => pattern.test(token));
  return tokens.length === 1 ? tokens[0] : '';
}
export function phtTimestamp(value) {
  const text = String(value || '').trim();
  let match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(text);
  if (match) {
    const stamp = Date.parse(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}+08:00`);
    const check = new Date(stamp + 8 * 3600000);
    return Number.isFinite(stamp) && check.getUTCFullYear() === Number(match[1]) && check.getUTCMonth() + 1 === Number(match[2]) && check.getUTCDate() === Number(match[3]) && Number(match[4]) < 24 && Number(match[5]) < 60 && Number(match[6]) < 60 ? new Date(stamp).toISOString() : null;
  }
  // The provided BPI receipt: Thursday, Nov 19 2026; 11:40:41 PM (GMT+8).
  match = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})[;, ]+\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)\b/i.exec(text);
  if (!match) return null;
  const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const hour = Number(match[4]);
  if (hour < 1 || hour > 12) return null;
  const h = hour % 12 + (match[7].toUpperCase() === 'PM' ? 12 : 0);
  return phtTimestamp(`${match[3]}-${String(months.indexOf(match[1].toLowerCase()) + 1).padStart(2,'0')}-${match[2].padStart(2,'0')} ${String(h).padStart(2,'0')}:${match[5]}:${match[6] || '00'}`);
}
export function parseMayaSms(sender, body) {
  const text = clean(body).trim();
  if (String(sender || '').trim().toUpperCase() !== 'MAYABIZ' || text.length > 2000 || /\b(?:OTP|one[- ]time|password|security code|verification code)\b/i.test(text)) return null;
  const payment = /(?:^|\n)Payment received:[ \t]*PHP[ \t]+([^\n]+?)[ \t]+via[ \t]+QRPH\.[ \t]*(?:\n|$)/i.exec(text);
  const amountCents = payment ? moneyCents(payment[1]) : null;
  const invoice = uniqueValue(text, 'QR[ \\t]*Ph[ \\t]+Invoice[ \\t]+No\\.?', /^\d{6}$/);
  const trn = uniqueValue(text, 'TRN', /^[A-Za-z0-9]{12}$/);
  const firstLine = text.split('\n')[0].trim();
  const paidAt = phtTimestamp(firstLine);
  if (!paidAt || amountCents == null || amountCents <= 0 || !invoice || !trn) return null;
  return { provider: 'MayaBiz', amountCents, qrPhInvoice: invoice, mayaTrn: trn, paidAt };
}
export function extractReceiptEvidence(raw) {
  const text = clean(raw).slice(0, 40000);
  let provider = 'unknown', referenceType = '', reference = '', fullReference = '', sourceLabel = '';
  const candidates = [];
  const add = (name, label, pattern, type, transform = value => value) => {
    const value = uniqueReceiptValue(text, label, pattern);
    if (value) candidates.push({provider:name,sourceLabel:({gcash:'QRPH Invoice No.',maya_email:'Maya Transaction No.',bpi:'Transaction Ref. No.',unionbank:'Instapay Reference Number',maribank_seabank:'Reference Number',maya_wallet:'Reference ID'})[name],fullReference:value,referenceType:type,reference:transform(value)});
  };
  add('gcash', 'QRPH[ \\t]+Invoice[ \\t]+No\\.?', /^\d{6}$/, 'qrph_invoice');
  add('maya_email', 'Maya[ \\t]+Transaction[ \\t]+No\\.?', /^[A-Za-z0-9_-]{12,160}$/, 'maya_trn', value => /[A-Za-z0-9]{12}$/.exec(value)?.[0] || '');
  add('bpi', 'Transaction[ \\t]+Ref\\.[ \\t]*No\\.?', /^\d{6,160}$/, 'qrph_invoice', value => value.slice(-6));
  add('unionbank', 'Instapay[ \\t]+Reference[ \\t]+Number', /^\d{6}$/, 'qrph_invoice');
  // Generic labels require the corresponding source brand on the receipt.
  if (/\b(?:MariBank|SeaBank)\b/i.test(text)) add('maribank_seabank', 'Reference[ \\t]+Number', /^\d{6}$/, 'qrph_invoice');
  if (/\bMaya\b/i.test(text)) add('maya_wallet', 'Reference[ \\t]+ID', /^[A-Za-z0-9]{12}$/, 'maya_trn');
  const valid = candidates.filter(item => item.reference);
  const distinct = new Set(valid.map(item => item.referenceType + ':' + item.reference));
  if (distinct.size === 1) ({provider,referenceType,reference,fullReference,sourceLabel} = valid[0]);
  let amountCents = null;
  for (const label of ['Payment[ \\t]+amount','Amount[ \\t]+Paid','Amount[ \\t]+Sent','Total[ \\t]+Amount','Amount']) {
    const found = values(text,label).map(value => moneyCents(value)).filter(value => value != null && value > 0);
    if (found.length === 1) { amountCents = found[0]; break; }
    if (found.length > 1) break;
  }
  const dateLine = text.split('\n').find(line => phtTimestamp(line.trim())) || '';
  const paidAt = dateLine ? phtTimestamp(dateLine.trim()) : null;
  const paidAtPrecision = !paidAt ? null : /\b\d{1,2}:\d{2}:\d{2}\b/.test(dateLine) ? 'second' : 'minute';
  return { ruleVersion: RECEIPT_RULE_VERSION, provider, referenceType, reference, fullReference, sourceLabel,
    amountCents, paidAt, paidAtPrecision, status: distinct.size > 1 ? 'conflicting_references' : reference ? 'reference_extracted' : 'reference_unreadable',
    requiresManualReview: true };
}
export function comparePaymentEvidence(receipt, sms, expectedCents) {
  if (!receipt?.reference || !['qrph_invoice','maya_trn'].includes(receipt.referenceType)) return { status:'receipt_reference_unreadable', matched:false };
  const key = receipt.referenceType === 'qrph_invoice' ? 'qrPhInvoice' : 'mayaTrn';
  if (receipt.reference !== sms?.[key]) return {status:'reference_mismatch',matched:false};
  if (!Number.isSafeInteger(receipt.amountCents) || receipt.amountCents !== sms.amountCents || !Number.isSafeInteger(expectedCents) || receipt.amountCents !== expectedCents) return {status:'amount_mismatch',matched:false};
  const receiptTime = Date.parse(receipt.paidAt || ''), smsTime = Date.parse(sms.paidAt || '');
  if (!Number.isFinite(receiptTime) || !Number.isFinite(smsTime)) return {status:'time_unreadable',matched:false};
  const secondsApart = Math.abs(smsTime - receiptTime) / 1000;
  // Minute-only receipts represent an interval, not an invented exact second.
  const minute = receipt.paidAtPrecision === 'minute';
  const end = receiptTime + (minute ? 59999 : 0);
  const farthest = Math.max(secondsApart, Math.abs(smsTime - end) / 1000);
  const timeDetails = minute ? {receiptTimePrecision:'minute',secondsApartMin:smsTime>=receiptTime&&smsTime<=end?0:Math.min(secondsApart,Math.abs(smsTime-end)/1000),secondsApartMax:farthest} : {secondsApart};
  if (farthest > 15 * 60) return {status:'time_mismatch',matched:false,...timeDetails};
  return {status:'sms_corroborated',matched:true,...timeDetails,requiresManualReview:true};
}
