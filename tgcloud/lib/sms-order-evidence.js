import { db } from 'sdk';
import { fetch } from 'sdk/fetch';
import { comparePaymentEvidence, moneyCents } from './payment-evidence.js';

function object(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  try { const parsed = JSON.parse(value || '{}'); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
}
async function key() {
  const row = await db.get("SELECT value FROM system_settings WHERE key='sms_bridge_service_key'");
  if (typeof row?.value !== 'string') return String(row?.value?.key || '');
  // Raw SQL returns JSON settings as text, unlike the schema-backed ORM.
  try {
    const parsed = JSON.parse(row.value);
    if (typeof parsed === 'string') return parsed;
    if (parsed && typeof parsed === 'object') return String(parsed.key || '');
  } catch { /* Legacy plain-text keys remain supported. */ }
  return row.value;
}
async function ensureLinks() {
  await db.run(`CREATE TABLE IF NOT EXISTS payment_sms_links (
    event_id TEXT PRIMARY KEY,order_id TEXT NOT NULL UNIQUE,image_sha256 TEXT NOT NULL,
    reference_type TEXT NOT NULL,reference_value TEXT NOT NULL,matched_at INTEGER NOT NULL)`);
}
export async function reconcileOrderSmsEvidence(id) {
  const order = await db.get(`SELECT id,customer_id AS customerId,payable_now AS payableNow,total_amount AS totalAmount,
    payment_proof_image AS proof,ocr_analysis AS analysis FROM orders WHERE id=:id`, { ':id': String(id) });
  if (!order || !order.proof) return null;
  const analysis = object(order.analysis);
  const checkedAt = new Date().toISOString();
  let result = { status: 'receipt_analysis_unavailable', matched: false, requiresManualReview: true, checkedAt, nextCheckAt: Math.floor(Date.now()/1000)+15 };
  let receipt = null;
  const scans = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='payment_receipt_scans'");
  const scan = scans && analysis.receiptScanId && analysis.receiptImageSha256
    ? await db.get(`SELECT analysis FROM payment_receipt_scans WHERE id=:scan AND customer_id=:customer
      AND image_sha256=:hash AND status='complete'`, { ':scan': analysis.receiptScanId, ':customer': String(order.customerId), ':hash': analysis.receiptImageSha256 }) : null;
  // Only server-extracted evidence bound to this customer's saved proof can pass.
  if (scan) {
    const trusted = object(scan.analysis);
    receipt = trusted.paymentEvidence || null;
    await ensureLinks();
    const priorLink = await db.get('SELECT event_id AS eventId,image_sha256 AS imageSha256 FROM payment_sms_links WHERE order_id=:order', { ':order': order.id });
    if (analysis.smsEvidence?.matched === true && priorLink?.eventId === analysis.smsEvidence.eventId
      && priorLink.imageSha256 === analysis.receiptImageSha256
      && comparePaymentEvidence(receipt || {}, analysis.smsEvidence.sms || {}, moneyCents(Number(order.payableNow ?? order.totalAmount).toFixed(2))).matched) {
      return { receipt, result: analysis.smsEvidence };
    }
    const serviceKey = await key();
    if (!receipt?.reference) result.status = receipt?.status || 'receipt_reference_unreadable';
    else if (!serviceKey) result.status = 'bridge_not_configured';
    else {
      try {
        const response = await fetch('https://prime-media-gateway.pages.dev/sms/match', { method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Prime-Sms-Service': serviceKey, 'User-Agent': 'PRIME-Payment-Evidence/1.0' },
          body: JSON.stringify({ type: receipt.referenceType, value: receipt.reference }) });
        if (!response.ok) throw new Error('SMS bridge unavailable');
        const data = await response.json();
        const expected = moneyCents(Number(order.payableNow ?? order.totalAmount).toFixed(2));
        const candidates = (Array.isArray(data.events) ? data.events : []).map(event => ({ event, comparison: comparePaymentEvidence(receipt, event, expected) }));
        const matches = candidates.filter(candidate => candidate.comparison.matched);
        result.status = data.truncated || matches.length > 1 ? 'ambiguous_sms_matches' : candidates[0]?.comparison.status || 'no_sms_match';
        if (!data.truncated && matches.length === 1) {
          const { event, comparison } = matches[0];
          await ensureLinks();
          await db.run(`INSERT OR IGNORE INTO payment_sms_links VALUES (:event,:order,:hash,:type,:ref,unixepoch())`,
            { ':event': event.id, ':order': order.id, ':hash': analysis.receiptImageSha256, ':type': receipt.referenceType, ':ref': receipt.reference });
          const link = await db.get('SELECT order_id AS orderId,image_sha256 AS imageSha256 FROM payment_sms_links WHERE event_id=:event', { ':event': event.id });
          if (link?.orderId === order.id && link.imageSha256 === analysis.receiptImageSha256) result = { ...result, ...comparison, matched: true, eventId: event.id,
            sms: { sender: event.sender, qrPhInvoice: event.qrPhInvoice, mayaTrn: event.mayaTrn, amountCents: event.amountCents, paidAt: event.paidAt, receivedAt: event.receivedAt } };
          else result.status = 'sms_already_linked_or_receipt_changed';
        }
      } catch { result.status = 'sms_bridge_unavailable'; }
    }
  }
  const persisted = { ...analysis, paymentEvidence: receipt, smsEvidence: result, requiresManualReview: true };
  const saved = await db.run(`UPDATE orders SET ocr_analysis=:analysis,updated_at=unixepoch()
    WHERE id=:id AND COALESCE(payment_proof_image,'')=:proof AND COALESCE(ocr_analysis,'')=:previous
    AND COALESCE(payable_now,total_amount)=:expected RETURNING id`,
    { ':analysis': JSON.stringify(persisted), ':id': order.id, ':proof': order.proof || '', ':previous': order.analysis || '', ':expected': Number(order.payableNow ?? order.totalAmount) });
  return Number(saved?.rowsAffected) ? { receipt, result } : null;
}

export async function reconcilePendingSmsEvidence(limit = 1) {
  const rows = await db.all(`SELECT id FROM orders WHERE status='Pending' AND json_valid(ocr_analysis)
    AND json_extract(ocr_analysis,'$.receiptScanId') IS NOT NULL
    AND COALESCE(json_extract(ocr_analysis,'$.smsEvidence.matched'),0)<>1
    AND COALESCE(json_extract(ocr_analysis,'$.smsEvidence.nextCheckAt'),0)<=unixepoch()
    ORDER BY COALESCE(json_extract(ocr_analysis,'$.smsEvidence.checkedAt'),'') ASC,created_at DESC LIMIT :limit`, { ':limit': Math.min(3, Math.max(1, Number(limit)||1)) });
  for (const row of rows) await reconcileOrderSmsEvidence(row.id);
}

export async function orderSmsAnalysisStatuses(ids) {
  if (!ids.length) return {};
  await ensureLinks();
  const params = {}, placeholders = [];
  for (let index = 0; index < ids.length; index++) { const name = ':id' + index; params[name] = ids[index]; placeholders.push(name); }
  const rows = await db.all(`SELECT o.id FROM orders o JOIN payment_sms_links l ON l.order_id=o.id
    WHERE o.id IN (` + placeholders.join(',') + `) AND COALESCE(o.payment_proof_image,'')<>'' AND json_valid(o.ocr_analysis)
    AND json_extract(o.ocr_analysis,'$.smsEvidence.matched')=1
    AND json_extract(o.ocr_analysis,'$.smsEvidence.eventId')=l.event_id
    AND json_extract(o.ocr_analysis,'$.receiptImageSha256')=l.image_sha256
    AND json_extract(o.ocr_analysis,'$.smsEvidence.sms.amountCents')=ROUND(COALESCE(o.payable_now,o.total_amount)*100)`, params);
  const statuses = {};
  for (const row of rows) statuses[row.id] = 'ANALYSIS PASSED';
  return statuses;
}
