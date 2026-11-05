import { db, EndpointError } from 'sdk';
import { and, eq, isNull, sql } from 'sdk/db';
import { customers, mediaAssetContents, mediaAssets, orders, paymentMethods } from '../schema.js';
import { expireUnpaidOrder } from '../lib/order-expiry.js';
import { notifyPaymentProofSubmitted } from '../lib/order-notifications.js';

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

function deadlineMs(value) {
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : null;
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

  const order = await db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order) throw new EndpointError('Order not found.', { code: 'NOT_FOUND' });
  const customer = await db.select({ id: customers.id }).from(customers).where(eq(customers.tgUserId, userId)).get();
  const ownsOrder = String(order.tgUserId || '') === userId || Boolean(customer && String(order.customerId || '') === String(customer.id));
  if (!ownsOrder) throw new EndpointError('Order not found.', { code: 'NOT_FOUND' });

  const expiry = await expireUnpaidOrder(order);
  if (expiry.expired) {
    throw new EndpointError('This order expired because its one-hour receipt window ended.', { code: 'ORDER_EXPIRED' });
  }

  const pendingStatus = String(order.status || '').toLowerCase() === 'pending';
  const paymentStatus = String(order.paymentStatus || '').toLowerCase();
  const replacingUnverifiedProof = paymentStatus === 'pending review' && Boolean(String(order.paymentProofImage || '').trim());
  if (!pendingStatus || !(paymentStatus === 'unpaid' || replacingUnverifiedProof)) {
    throw new EndpointError('This order is no longer awaiting payment proof.', { code: 'ORDER_NOT_AWAITING_PAYMENT' });
  }
  if (Number(order.payableNow ?? order.totalAmount) <= 0) {
    throw new EndpointError('No pre-dispatch payment is due for this order; staff review is required instead of a receipt.', { code: 'NO_PRE_DISPATCH_PAYMENT_DUE' });
  }
  if (order.expiredAt || (String(order.paymentProofImage || '').trim() && !replacingUnverifiedProof)) {
    throw new EndpointError('This order is expired or already has a payment receipt.', { code: 'ORDER_NOT_AWAITING_PAYMENT' });
  }
  const explicitDeadline = deadlineMs(order.paymentDeadlineAt);
  const createdAtMs = order.createdAt instanceof Date ? order.createdAt.getTime() : Number(order.createdAt) * (Number(order.createdAt) > 1e12 ? 1 : 1000);
  const deadline = explicitDeadline ?? (Number.isFinite(createdAtMs) && createdAtMs > 0 ? createdAtMs + 60 * 60 * 1000 : null);
  if (deadline === null || deadline <= Date.now()) {
    throw new EndpointError('This order has expired because its one-hour receipt window ended.', { code: 'ORDER_EXPIRED' });
  }

  const paymentMethodId = String(input?.paymentMethodId || order.paymentMethodId || '').trim();
  const paymentMethod = paymentMethodId
    ? await db.select().from(paymentMethods).where(eq(paymentMethods.id, paymentMethodId)).get()
    : null;
  if (!paymentMethod || paymentMethod.isActive === false || !['qr_code', 'manual_transfer', 'crypto', 'secured_payment_link'].includes(String(paymentMethod.paymentType || '').toLowerCase())) {
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
  const adjustment = input?.adjustment === true;
  if (adjustment) {
    if (String(order.status || '').toLowerCase() !== 'processing' ||
        String(order.paymentStatus || '').toLowerCase() !== 'paid' || Number(order.adjustmentDue || 0) <= 0 ||
        String(order.adjustmentStatus || '').toLowerCase() !== 'awaiting_payment' || String(order.adjustmentProofImage || '').trim()) {
      await removeUnlinkedMedia(mediaId);
      throw new EndpointError('This order is not accepting an adjustment receipt.', { code: 'ADJUSTMENT_NOT_AWAITING_PAYMENT' });
    }
    const updated = await db.run(
      `UPDATE orders SET adjustment_payment_method_id = :method_id,
              adjustment_payment_method_name = :method_name, adjustment_proof_image = :proof,
              adjustment_proof_submitted_at = unixepoch(), adjustment_status = 'pending_review', updated_at = unixepoch()
        WHERE id = :order_id AND lower(coalesce(payment_status, '')) = 'paid'
          AND lower(coalesce(status, '')) = 'processing'
          AND coalesce(adjustment_due, 0) > 0 AND lower(coalesce(adjustment_status, '')) = 'awaiting_payment'
          AND trim(coalesce(adjustment_proof_image, '')) = '' RETURNING id`,
      { ':method_id': paymentMethod.id, ':method_name': paymentMethod.name, ':proof': reference, ':order_id': order.id },
    );
    if (!Number(updated?.rowsAffected)) {
      await removeUnlinkedMedia(mediaId);
      throw new EndpointError('The adjustment changed or already has a receipt. Refresh the order and try again.', { code: 'ADJUSTMENT_NOT_AWAITING_PAYMENT' });
    }
    return { success: true, orderId: order.id, paymentStatus: order.paymentStatus, adjustmentStatus: 'pending_review', reference };
  }

  const updated = await db.update(orders).set({
    paymentMethodId: paymentMethod.id,
    paymentMethodName: paymentMethod.name,
    paymentProofImage: reference,
    paymentProofSubmittedAt: now,
    paymentStatus: 'Pending Review',
    reviewStatus: uniqueForensicsFlags.length ? 'Flagged for Forensics Review' : 'Pending Manual Review',
    requiresManualReview: true,
    ocrAnalysis: persistedOcrAnalysis,
    updatedAt: now,
  }).where(and(
    eq(orders.id, order.id),
    eq(orders.status, 'Pending'),
    isNull(orders.expiredAt),
    sql`coalesce(${orders.paymentDeadlineAt}, ${orders.createdAt} + 3600) > unixepoch()`,
    replacingUnverifiedProof
      ? sql`lower(coalesce(${orders.paymentStatus}, '')) = 'pending review' AND trim(coalesce(${orders.paymentProofImage}, '')) <> ''`
      : and(eq(orders.paymentStatus, 'Unpaid'), sql`trim(coalesce(${orders.paymentProofImage}, '')) = ''`),
  )).returning({ id: orders.id }).run();

  if (!updated.length) {
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
