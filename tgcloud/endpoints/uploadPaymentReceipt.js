import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { customers, mediaAssetContents, mediaAssets, orders, paymentMethods } from '../schema.js';
import { notifyPaymentProofSubmitted } from '../lib/order-notifications.js';
import { attachWorkflow, expireReceiptResubmissions,ensureOrderWorkflow } from '../lib/order-workflow.js';

function decodeBase64Url(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  if (!value || value.length % 4 === 1 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const output = new Uint8Array(Math.floor(value.length * 3 / 4));
  let buffer = 0;
  let bits = 0;
  let offset = 0;
  for (const character of value) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) return null;
    buffer = (buffer << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[offset++] = (buffer >> bits) & 0xff;
      buffer &= (1 << bits) - 1;
    }
  }
  if (bits && buffer !== 0) return null;
  return output.subarray(0, offset);
}

function decodeJpeg(data) {
  if (typeof data !== 'string' || !data || data.length > 1_250_000) {
    throw new EndpointError('Choose a smaller receipt image and try again.', { code: 'IMAGE_TOO_LARGE' });
  }
  const bytes = decodeBase64Url(data);
  if (!bytes) {
    throw new EndpointError('The selected receipt could not be read. Choose it again.', { code: 'INVALID_IMAGE' });
  }
  if (!bytes.length || bytes.length > 900_000) {
    throw new EndpointError('Choose a receipt under 900 KB after compression.', { code: 'IMAGE_TOO_LARGE' });
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new EndpointError('The uploaded content is not a valid JPEG image.', { code: 'INVALID_IMAGE' });
  }
  return bytes;
}

async function removeUnlinkedMedia(id) {
  await db.delete(mediaAssetContents).where(eq(mediaAssetContents.id, id)).run();
  await db.delete(mediaAssets).where(eq(mediaAssets.id, id)).run();
}

async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function storedOcrAnalysis(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value === 'string') { try { return JSON.parse(value); } catch {} }
  return {};
}

function getForensicsMessage(flags, scanNote = '', hasScanEvidence = false) {
  const result = flags.length
    ? 'Potential receipt reuse or image change detected. Staff review required.'
    : !hasScanEvidence
      ? 'Automated scan evidence is unavailable; staff review is required.'
      : 'No exact duplicate indicators found. Staff review is still required.';
  return scanNote ? `${result} ${String(scanNote).slice(0, 240)}` : result;
}

export default async function (input, ctx) {
  const userId = ctx?.initData?.user?.id == null ? '' : String(ctx.initData.user.id);
  if (!/^[0-9]+$/.test(userId)) throw new EndpointError('A verified Telegram customer is required.', { code: 'AUTH_REQUIRED' });

  const orderId = String(input?.orderId || '').trim();
  const mediaId = String(input?.id || '').trim();
  if (!orderId) throw new EndpointError('Order ID is required.', { code: 'INVALID_INPUT' });
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(mediaId)) throw new EndpointError('Invalid receipt upload ID.', { code: 'INVALID_INPUT' });
  if (input?.contentType !== 'image/jpeg') throw new EndpointError('Upload the receipt as a JPEG image.', { code: 'INVALID_IMAGE_TYPE' });

  await ensureOrderWorkflow();
  const order = await db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order) throw new EndpointError('Order not found.', { code: 'NOT_FOUND' });
  const customer = await db.select({ id: customers.id }).from(customers).where(eq(customers.tgUserId, userId)).get();
  const ownsOrder = String(order.tgUserId || '') === userId || Boolean(customer && String(order.customerId || '') === String(customer.id));
  if (!ownsOrder) throw new EndpointError('Order not found.', { code: 'NOT_FOUND' });
  if(input?.adjustment)throw new EndpointError('Bill increases require a new order.',{code:'NEW_ORDER_REQUIRED'});
  const workflow=await attachWorkflow(order);
  const alreadyStored=String(order.paymentProofImage||'')==='tgmedia:'+mediaId;
  if(alreadyStored)return {success:true,orderId:order.id,paymentStatus:order.paymentStatus,reference:order.paymentProofImage};

  const pendingStatus = String(order.status || '').toLowerCase() === 'pending';
  const paymentStatus = String(order.paymentStatus || '').toLowerCase();
  const replacingUnverifiedProof = paymentStatus === 'failed' && workflow.canResubmit;
  if (!pendingStatus || !replacingUnverifiedProof) {
    await expireReceiptResubmissions({customerId:order.customerId});
    throw new EndpointError('This order is no longer awaiting payment proof.', { code: 'ORDER_NOT_AWAITING_PAYMENT' });
  }
  if (order.expiredAt || (String(order.paymentProofImage || '').trim() && !replacingUnverifiedProof)) {
    throw new EndpointError('This order is expired or already has a payment receipt.', { code: 'ORDER_NOT_AWAITING_PAYMENT' });
  }
  const paymentMethodId = String(input?.paymentMethodId || order.paymentMethodId || '').trim();
  const originalMethod=paymentMethodId===String(order.paymentMethodId||'');
  const loadedMethod = paymentMethodId
    ? await db.select().from(paymentMethods).where(eq(paymentMethods.id, paymentMethodId)).get()
    : null;
  const paymentMethod=loadedMethod||(originalMethod&&paymentMethodId?{id:paymentMethodId,name:order.paymentMethodName,paymentType:'manual_transfer'}:null);
  if (!paymentMethod || (paymentMethod.isActive === false&&!originalMethod) || !['qr_code', 'manual_transfer', 'crypto', 'secured_payment_link'].includes(String(paymentMethod.paymentType || '').toLowerCase())) {
    throw new EndpointError('Choose an active manual payment method for this receipt.', { code: 'INVALID_PAYMENT_METHOD' });
  }

  const bytes = decodeJpeg(input.data);
  const uploadedImageSha256 = await sha256Hex(bytes);
  const existingMedia = await db.select({ id: mediaAssets.id }).from(mediaAssets).where(eq(mediaAssets.id, mediaId)).get();
  const existingContent = await db.select({ id: mediaAssetContents.id }).from(mediaAssetContents).where(eq(mediaAssetContents.id, mediaId)).get();
  if (existingMedia || existingContent) throw new EndpointError('This receipt upload ID already exists. Choose the image again.', { code: 'MEDIA_CONFLICT' });

  const duplicateImages = await db.all(
    `SELECT m.order_id AS orderId, o.order_number AS orderNumber
       FROM media_assets m LEFT JOIN orders o ON o.id = m.order_id
      WHERE m.bucket = 'receipt-proofs' AND m.sha256 = :sha256
        AND coalesce(m.order_id, '') <> :order_id
      LIMIT 10`,
    { ':sha256': uploadedImageSha256, ':order_id': String(order.id) },
  );
  const savedAnalysis = {
    ...storedOcrAnalysis(order.ocrAnalysis),
    ...storedOcrAnalysis(input?.ocrAnalysis),
  };
  const forensicsFlags = Array.isArray(savedAnalysis.forensicsFlags) ? [...savedAnalysis.forensicsFlags] : [];
  const priorProofId = String(order.paymentProofImage || '').startsWith('tgmedia:')
    ? String(order.paymentProofImage).slice('tgmedia:'.length) : '';
  if (replacingUnverifiedProof && priorProofId) {
    const priorProof = await db.select({ sha256: mediaAssets.sha256 }).from(mediaAssets).where(eq(mediaAssets.id, priorProofId)).get();
    if (priorProof?.sha256 && priorProof.sha256 !== uploadedImageSha256) {
      forensicsFlags.push({ kind: 'RECEIPT_IMAGE_CHANGED_ON_ORDER', orderId: String(order.id), orderNumber: String(order.orderNumber || order.id) });
    }
  }
  for (const duplicate of duplicateImages || []) {
    forensicsFlags.push({
      kind: 'EXACT_UPLOADED_IMAGE_REUSE',
      orderId: String(duplicate.orderId || ''),
      orderNumber: String(duplicate.orderNumber || duplicate.orderId || ''),
    });
  }
  const pixelFingerprint = String(savedAnalysis.pixelFingerprintSha256 || '');
  if (pixelFingerprint) {
    const pixelMatches = await db.all(
      `SELECT id, order_number AS orderNumber FROM orders
        WHERE id <> :order_id
          AND json_extract(ocr_analysis, '$.pixelFingerprintSha256') = :fingerprint
        LIMIT 10`,
      { ':order_id': String(order.id), ':fingerprint': pixelFingerprint },
    );
    for (const match of pixelMatches || []) forensicsFlags.push({
      kind: 'PIXEL_SAMPLE_REUSE',
      orderId: String(match.id || ''),
      orderNumber: String(match.orderNumber || match.id || ''),
    });
  }
  const uniqueForensicsFlags = forensicsFlags.filter((flag, index, all) =>
    all.findIndex((candidate) => candidate.kind === flag.kind && candidate.orderId === flag.orderId) === index);
  const forensicsResult = getForensicsMessage(
    uniqueForensicsFlags,
    savedAnalysis.forensicsResult,
    Boolean(savedAnalysis.scanImageSha256 || savedAnalysis.rawImageSha256 || savedAnalysis.pixelFingerprintSha256),
  );
  const extractedFields = (Array.isArray(savedAnalysis.extractedFields) ? savedAnalysis.extractedFields : [])
    .filter((field) => String(field?.label || '').toLowerCase() !== 'forensics result')
    .concat([{ label: 'Forensics Result', value: forensicsResult }]);
  const persistedOcrAnalysis = {
    ...savedAnalysis,
    rawSummary: String(savedAnalysis.rawSummary || '').slice(0, 12_000),
    providerResponse: String(savedAnalysis.providerResponse || '').slice(0, 40_000),
    uploadedImageSha256,
    uploadedImageByteLength: bytes.length,
    scanEvidenceAvailable: Boolean(savedAnalysis.scanImageSha256),
    forensicsFlags: uniqueForensicsFlags,
    forensicsResult,
    extractedFields,
    requiresManualReview: true,
  };

  const now = new Date();
  await db.insert(mediaAssetContents).values({ id: mediaId, bytes, createdAt: now }).run();
  try {
    await db.insert(mediaAssets).values({
      id: mediaId, bucket: 'receipt-proofs', path: order.id + '/' + mediaId + '.jpg',
      fileId: 'inline:' + mediaId, contentType: 'image/jpeg', size: bytes.length,
      sha256: uploadedImageSha256, visibility: 'private', orderId: order.id, createdAt: now, updatedAt: now,
    }).run();
  } catch (error) {
    await db.delete(mediaAssetContents).where(eq(mediaAssetContents.id, mediaId)).run();
    throw error;
  }

  const reference = 'tgmedia:' + mediaId;
  let updated;
  try {updated=await db.run(`UPDATE orders SET payment_method_id=:method,payment_method_name=:name,payment_proof_image=:proof,
    payment_proof_submitted_at=unixepoch(),payment_status='Pending Review',requires_manual_review=1,ocr_analysis=:analysis,updated_at=unixepoch()
    WHERE id=:id AND lower(status)='pending' AND lower(payment_status)='failed' AND control_state='held'
      AND payment_proof_image=:old AND EXISTS(SELECT 1 FROM order_receipt_deadlines WHERE order_id=:id AND expires_at>unixepoch()) RETURNING id`,
    {':id':order.id,':method':paymentMethod.id,':name':paymentMethod.name,':proof':reference,':analysis':JSON.stringify(persistedOcrAnalysis),':old':order.paymentProofImage});}
  catch(error){await removeUnlinkedMedia(mediaId);throw error;}
  if (!Number(updated?.rowsAffected)) {
    await removeUnlinkedMedia(mediaId);
    throw new EndpointError('This order has expired or is no longer awaiting payment proof.', { code: 'ORDER_NOT_AWAITING_PAYMENT' });
  }

  await notifyPaymentProofSubmitted({
    chatId: order.tgUserId,
    orderNumber: order.orderNumber || order.id,
    status: order.status,
    totalAmount: order.totalAmount,
  });
  return { success: true, orderId: order.id, paymentStatus: 'Pending Review', reference };
}
