'use client';
import { setMediaOwner } from '@/lib/media-library';

type ServerlessError = Error & { type?: string; parameters?: Record<string, unknown> };
type ServerlessBridge = {
  call: (name: string, input: Record<string, unknown>, callback: (error: ServerlessError | null, result?: any) => void) => void;
};

type TelegramWebApp = { Serverless?: ServerlessBridge; initData?: string };

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const mediaUrlCache = new Map<string, Promise<string>>();
const isVisualPreview = import.meta.env.VITE_UI_PREVIEW === '1';

function visualPreviewResponse(name: string, input: Record<string, unknown>): unknown {
  const action = String(input.action || '');
  const products = [
    { id: 'preview-product-1', name: 'Ergonomic Wireless Mouse', category: 'Electronics', price: 2499, stock: 18, lowStockThreshold: 5, isActive: true, variants: [{ id: 'preview-v1', name: 'Matte Black', price: 2499, stock: 12, tag: 'BEST SELLER' }, { id: 'preview-v2', name: 'Arctic White', price: 2699, stock: 6, tag: 'NEW' }] },
    { id: 'preview-product-2', name: 'Mechanical Keyboard', category: 'Electronics', price: 5999, stock: 8, lowStockThreshold: 3, isActive: true, variants: [] },
  ];
  if (name === 'manageProducts' || name === 'getCatalog') return action === 'list' || !action ? products : { success: true, product: products[0] };
  if (name === 'managePaymentMethods') return action === 'list' ? [{ id: 'preview-gcash', name: 'GCash', isActive: true, type: 'ewallet', instructions: 'Preview payment method' }] : { success: true };
  if (name === 'getPublicPaymentMethods') return [{ id: 'preview-gcash', name: 'GCash', paymentType: 'qr_code', isActive: true, qrCodeImage: '', accountName: 'Preview Account', accountNumber: '0000 0000' }];
  if (name === 'manageCouriers') return action === 'list' ? [{ id: 'preview-courier', name: 'Express Delivery', isActive: true, baseFee: 60, perKmFee: 12 }] : { success: true };
  if (name === 'manageWarehouses') return action === 'list' ? [{ id: 'preview-warehouse', name: 'Prime Main Warehouse', address: 'Preview location', latitude: 14.5995, longitude: 120.9842, isActive: true }] : { success: true };
  if (name === 'manageCustomers') return action === 'list' ? [{ id: 'preview-customer', tgName: 'Preview Customer', tgUsername: 'prime_preview', primeMemberId: 'PM-00001', totalOrders: 3, lifetimeSpent: 9200 }] : { id: 'preview-customer', tgName: 'Preview Customer', orders: [] };
  if (name === 'manageNotifications') return action === 'list' ? { notifications: [{ id: 'preview-notification', orderNumber: 'PRV-1001', eventKey: 'order.created', status: 'sent', createdAt: new Date().toISOString() }] } : { success: true, deletedCount: 0 };
  if (name === 'manageVideos') return action === 'list' ? [] : action === 'getStorageTarget' ? {} : { success: true };
  if (name === 'managePromos') return action === 'list' ? [{ id: 'preview-voucher-1', code: 'PRIME-GIFT-2026', title: 'Member Gift', description: 'A thank-you for your order.', voucherType: 'shop_voucher', discountType: 'free_product', discountValue: 0, freeProductId: 'preview-product-1', freeVariantId: 'preview-v1', minSpend: 1000, customerEligibility: 'specific_customer', eligibleCustomerId: 'preview-admin', activeDaysOfWeek: [0,1,2,3,4,5,6], allowedPaymentMethods: ['all'], allowedCourierIds: ['all'], usageLimitPerCustomer: 1, totalUsageLimit: 1, isActive: true }] : { success: true };
  if (name === 'manageCharges') return action === 'list' ? [] : { success: true };
  if (name === 'manageOrders') return action === 'list' ? [] : { success: true };
  if (name === 'getPublicOrderQueue') return { ordersInQueue: 3, ordersInProcessing: 2, averageReadyMinutes: 12, trafficFlowStatus: 'MODERATE' };
  if (name === 'manageOcrSettings') return action === 'status' ? { googleVisionConfigured: false, ocrSpaceConfigured: false, provider: 'ocr_space' } : { success: true };
  if (name === 'manageIplocateSettings' || name === 'manageTomtomSettings') return action === 'status' ? { configured: false } : { success: true };
  if (name === 'manageAutomation') return action === 'list' ? [] : { success: true };
  if (name === 'geoapifyAddress') return { results: [] };
  return { success: true };
}

async function collectSessionFingerprint(): Promise<Record<string, unknown> | undefined> {
  if (typeof window === 'undefined') return undefined;
  try {
    const { getClientFingerprint } = await import('@/app/components/fingerprint-collector');
    return await getClientFingerprint() as unknown as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Best-effort browser-observed public IP. Serverless records it as unverified. */
export async function getClientObservedPublicIp(): Promise<string> {
  if (typeof window === 'undefined') return '';
  try {
    const response = await fetch('https://api.ipify.org?format=json', {
      cache: 'no-store', signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return '';
    const result = await response.json();
    const ip = String(result?.ip || '').trim();
    return ip.length <= 64 ? ip : '';
  } catch {
    return '';
  }
}

export function hasTelegramServerlessBridge(): boolean {
  return typeof window !== 'undefined' && Boolean(window.Telegram?.WebApp?.Serverless?.call);
}

export function callServerless<T>(
  name: string,
  input: Record<string, unknown> = {},
  timeoutMs = 12_000,
): Promise<T> {
  if (isVisualPreview) return Promise.resolve(visualPreviewResponse(name, input) as T);
  if (typeof window === 'undefined') return Promise.reject(new Error('Telegram Mini App is not available.'));
  const bridge = window.Telegram?.WebApp?.Serverless;
  if (!bridge?.call) return Promise.reject(new Error('Open PRIME from Telegram to use this feature.'));

  return new Promise<T>((resolve, reject) => {
    let complete = false;
    const timer = window.setTimeout(() => {
      if (complete) return;
      complete = true;
      reject(new Error('The Telegram service took too long to respond. Please try again.'));
    }, timeoutMs);

    try {
      bridge.call(name, input, (error, result) => {
        if (complete) return;
        complete = true;
        window.clearTimeout(timer);
        if (error) reject(error);
        else resolve(result as T);
      });
    } catch (error) {
      if (!complete) {
        complete = true;
        window.clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('The Telegram request could not be sent.'));
      }
    }
  });
}

/** Resume an uncertain checkout using its key; the Serverless endpoint loads its saved request snapshot. */
export async function resumeServerlessCheckout<T = Record<string, unknown>>(operationKey: string): Promise<T> {
  return await callServerless<T>('createOrder', { operationKey, resume: true }, 60_000);
}

export async function createPaymentSession(request: Record<string, unknown>, paymentMethodId: string, operationKey: string) {
  return await callServerless<{ success: boolean; paymentSessionId: string; operationKey: string; expiresAt: string }>('createPaymentSession', {
    request, paymentMethodId, operationKey,
  }, 60_000);
}

export async function uploadPaymentProofDataUrl(dataUrl: string, paymentSessionId: string, contentType = 'image/jpeg', ocrAnalysis?: Record<string, unknown> | null) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!match) throw new Error('The payment proof image is invalid.');
  const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return await callServerless<{ success: boolean; paymentSessionId: string; status: string }>('uploadPaymentProof', {
    paymentSessionId, contentType: match[1] || contentType, data: encoded, ...(ocrAnalysis ? { ocrAnalysis } : {}),
  }, 60_000);
}

const CHECKOUT_ATTEMPT_STORAGE_PREFIX = 'prime_serverless_checkout_attempt_v1:';
const CHECKOUT_OPERATION_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

function checkoutAttemptStorageKey(telegramUserId: string): string {
  const userId = String(telegramUserId || '').trim();
  if (!/^[0-9]{1,24}$/.test(userId)) throw new Error('A verified Telegram account is required.');
  return CHECKOUT_ATTEMPT_STORAGE_PREFIX + userId;
}

/** Return the saved opaque key for this Telegram account without retaining checkout data. */
export function getPendingServerlessCheckoutKey(telegramUserId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const key = window.localStorage.getItem(checkoutAttemptStorageKey(telegramUserId));
    return key && CHECKOUT_OPERATION_KEY_PATTERN.test(key) ? key : null;
  } catch {
    return null;
  }
}

/** Create one attempt key, or reuse the account's key after an uncertain response. */
export function getOrCreateServerlessCheckoutKey(telegramUserId: string): string {
  const storageKey = checkoutAttemptStorageKey(telegramUserId);
  const existing = getPendingServerlessCheckoutKey(telegramUserId);
  if (existing) return existing;
  if (typeof window === 'undefined' || !window.crypto?.getRandomValues) {
    throw new Error('Secure checkout retry keys are unavailable in this browser.');
  }
  const bytes = new Uint8Array(24);
  window.crypto.getRandomValues(bytes);
  const key = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  try {
    window.localStorage.setItem(storageKey, key);
  } catch {
    throw new Error('This browser could not save the checkout recovery key.');
  }
  return key;
}

/** Clear only after the Serverless endpoint confirms a terminal result. */
export function clearPendingServerlessCheckoutKey(telegramUserId: string, expectedKey?: string): void {
  if (typeof window === 'undefined') return;
  try {
    const storageKey = checkoutAttemptStorageKey(telegramUserId);
    const current = window.localStorage.getItem(storageKey);
    if (expectedKey && current !== expectedKey) return;
    window.localStorage.removeItem(storageKey);
  } catch {
    // Storage may be disabled; the server-side operation remains recoverable by key.
  }
}

/** Recover this account's pending attempt; retain its key if the result is uncertain. */
export async function resumePendingServerlessCheckout<T = Record<string, unknown>>(
  telegramUserId: string,
): Promise<T | null> {
  const operationKey = getPendingServerlessCheckoutKey(telegramUserId);
  if (!operationKey) return null;
  const result = await resumeServerlessCheckout<T>(operationKey);
  clearPendingServerlessCheckoutKey(telegramUserId, operationKey);
  return result;
}

export async function resolveTelegramMedia(reference: string): Promise<string> {
  const value = String(reference || '').trim();
  if (!value.startsWith('tgmedia:')) return value;
  const id = value.slice('tgmedia:'.length).trim();
  if (!id) return '';

  const existing = mediaUrlCache.get(id);
  if (existing) return existing;

  const pending = (async () => {
    const media = await callServerless<{ contentType: string; base64: string }>(
      'getMediaContent',
      { id },
      20_000,
    );
    if (!media?.base64 || !/^image\/(jpeg|png|webp)$/.test(media.contentType || '')) {
      throw new Error('The product image could not be loaded.');
    }
    const binary = atob(media.base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return URL.createObjectURL(new Blob([bytes], { type: media.contentType }));
  })();

  mediaUrlCache.set(id, pending);
  try {
    return await pending;
  } catch (error) {
    mediaUrlCache.delete(id);
    throw error;
  }
}

/** Download a public media reference only after resolving Telegram-backed assets. */
export async function downloadTelegramMedia(reference: string, filename: string): Promise<void> {
  const url = await resolveTelegramMedia(reference);
  if (!url) throw new Error('This image is not available to download.');
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** Load a published Telegram-hosted video through the public gallery media gate. */
export async function resolveTelegramVideo(videoId: string, signal?: AbortSignal): Promise<string> {
  const reference = String(videoId || '').trim();
  const isAssetReference = reference.startsWith('tgmedia:');
  const id = isAssetReference ? reference.slice('tgmedia:'.length).trim() : reference;
  if (!id) throw new Error('This video has no playable media attached.');
  signal?.throwIfAborted();
  const pending = (async () => {
    if (isAssetReference) {
      const media = await callServerless<{ contentType: string; base64: string }>('getMediaContent', { id }, 30_000);
      if (!media?.base64 || !/^video\/(mp4|webm|quicktime)$/.test(media.contentType || '')) {
        throw new Error('The video could not be loaded.');
      }
      const binary = atob(media.base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return URL.createObjectURL(new Blob([bytes], { type: media.contentType }));
    }

    type VideoPart = { contentType: string; size: number; chunkIndex: number; chunkCount: number; base64: string };
    const first = await callServerless<VideoPart>('getMediaContent', { videoId: id, chunkIndex: 0 }, 30_000);
    if (!first?.base64 || !/^video\/mp4$/.test(first.contentType || '') ||
      !Number.isSafeInteger(first.size) || first.size < 1 || first.size > 20 * 1024 * 1024 ||
      !Number.isSafeInteger(first.chunkCount) || first.chunkCount < 1 || first.chunkCount > 40) {
      throw new Error('The video could not be loaded.');
    }
    const decodePart = (base64: string) => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return bytes;
    };
    const parts: Uint8Array[] = [decodePart(first.base64)];
    for (let index = 1; index < first.chunkCount; index += 1) {
      signal?.throwIfAborted();
      const part = await callServerless<VideoPart>('getMediaContent', { videoId: id, chunkIndex: index }, 30_000);
      if (!part?.base64 || part.size !== first.size || part.chunkCount !== first.chunkCount || part.chunkIndex !== index) {
        throw new Error('A video stream part could not be loaded. Tap Retry Stream to try again.');
      }
      parts.push(decodePart(part.base64));
    }
    const totalBytes = parts.reduce((total, part) => total + part.length, 0);
    if (totalBytes !== first.size) throw new Error('The video stream was incomplete. Tap Retry Stream to try again.');
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.length; }
    signal?.throwIfAborted();
    return URL.createObjectURL(new Blob([bytes], { type: first.contentType }));
  })();
  // The active player owns/revokes this URL. Never retain every watched video
  // in the global image cache and exhaust the mobile decoder's memory.
  return await pending;
}

export type ServerlessGalleryVideo = {
  id: string; title: string; description?: string; category: string; categories?: string[]; tags?: string[]; storageType?: string;
  mediaId?: string; directUrl?: string; thumbnailUrl?: string; duration?: number;
  views?: number; rating?: number; publishedAt?: string; featured?: boolean; createdAt?: string;
};

export async function getServerlessVideos(): Promise<ServerlessGalleryVideo[]> {
  const rows = await callServerless<ServerlessGalleryVideo[]>('getPublicVideos', {}, 20_000);
  if (!Array.isArray(rows)) throw new Error('The video gallery response was invalid.');
  return rows;
}

export async function uploadServerlessGalleryVideo(file: File, metadata: {
  title: string; description?: string; category?: string; categories?: string[]; duration?: number; width?: number; height?: number; tags?: string[];
  thumbnailUrl?: string; rating?: number; isPublished?: boolean; featured?: boolean;
}, onProgress?: (completed: number, total: number) => void): Promise<{ success: boolean; video?: ServerlessGalleryVideo }> {
  const maxBytes = 20 * 1024 * 1024;
  if (file.type !== 'video/mp4' || !file.name.toLowerCase().endsWith('.mp4')) {
    throw new Error('Choose a compressed MP4 video.');
  }
  if (file.size > maxBytes) throw new Error('Video files must be 20 MiB or smaller.');
  if (file.size < 12) throw new Error('The selected MP4 file is empty or invalid.');

  // Android document providers can revoke the picker URI after selection. Read
  // the File immediately on the user gesture and use FileReader as a fallback
  // for WebViews whose File.arrayBuffer() is not backed by a stable blob URL.
  const bytes = await readPickedFile(file);
  if (String.fromCharCode(...bytes.subarray(4, 8)) !== 'ftyp') throw new Error('The selected file is not a valid MP4 video.');
  if (!window.crypto?.getRandomValues) throw new Error('Secure video upload is unavailable in this browser.');
  const uploadIdBytes = new Uint8Array(16);
  window.crypto.getRandomValues(uploadIdBytes);
  const uploadId = Array.from(uploadIdBytes, value => value.toString(16).padStart(2, '0')).join('');
  const chunkSize = 512 * 1024;
  const chunkCount = Math.ceil(bytes.length / chunkSize);
  let uploadStarted = false;
  try {
    const started = await callServerless<{ success?: boolean }>('manageVideos', {
      action: 'uploadStart', uploadId, ...metadata, fileName: file.name,
      contentType: file.type, fileSize: file.size, chunkCount,
    }, 30_000);
    if (!started?.success) throw new Error('The video upload could not be started.');
    uploadStarted = true;
    for (let index = 0; index < chunkCount; index += 1) {
      const part = bytes.subarray(index * chunkSize, Math.min((index + 1) * chunkSize, bytes.length));
      let binary = '';
      const encodeBlockSize = 0x8000;
      for (let offset = 0; offset < part.length; offset += encodeBlockSize) {
        binary += String.fromCharCode(...part.subarray(offset, Math.min(offset + encodeBlockSize, part.length)));
      }
      const data = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
      const saved = await callServerless<{ success?: boolean }>('manageVideos', {
        action: 'uploadChunk', uploadId, index, data,
      }, 30_000);
      if (!saved?.success) throw new Error(`Video part ${index + 1} of ${chunkCount} was not confirmed.`);
      onProgress?.(index + 1, chunkCount);
    }
    const result = await callServerless<{ success: boolean; video?: ServerlessGalleryVideo }>(
      'manageVideos', { action: 'uploadComplete', uploadId }, 120_000,
    );
    if (!result?.success || !result.video?.id) throw new Error('The video upload was not confirmed.');
    return result;
  } catch (error) {
    if (uploadStarted) {
      try { await callServerless('manageVideos', { action: 'uploadCancel', uploadId }, 15_000); } catch { /* Preserve the original upload error. */ }
    }
    throw error;
  }
}

function readPickedFile(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const fail = () => reject(new Error('Android could no longer read the selected video. Choose the MP4 again and upload it immediately.'));
    try {
      const reader = new FileReader();
      reader.onerror = fail;
      reader.onabort = fail;
      reader.onload = () => {
        if (!(reader.result instanceof ArrayBuffer)) return fail();
        resolve(new Uint8Array(reader.result));
      };
      reader.readAsArrayBuffer(file);
    } catch {
      fail();
    }
  });
}


export type TelegramServerlessSession = {
  authenticated: boolean;
  sessionReady?: boolean;
  isAdmin?: boolean;
  tgUserId?: string;
  tgName?: string;
  tgUsername?: string;
  primeMemberId?: string;
  phoneNumber?: string;
  storeCredits?: number;
  referredByMemberId?: string;
  referredByName?: string;
  latestFingerprint?: Record<string, unknown> | null;
  user?: { id?: string; customerId?: string; name?: string; username?: string; primeMemberId?: string; role?: string };
  error?: string;
};

export async function getTelegramServerlessSession(options: { heartbeat?: boolean } = {}): Promise<TelegramServerlessSession> {
  if (isVisualPreview) return { authenticated: true, sessionReady: true, isAdmin: true, tgUserId: '999000001', tgName: 'Preview Admin', tgUsername: 'prime_preview', primeMemberId: 'PM-PREVIEW', user: { id: 'preview-admin', name: 'Preview Admin', role: 'admin' } };
  // Telegram can inject Serverless later than initData after Android resumes.
  for (let attempt = 0; attempt < 50 && !hasTelegramServerlessBridge(); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const fingerprint = await collectSessionFingerprint();
  const session = await callServerless<TelegramServerlessSession>('getTelegramSession', {
    ...(fingerprint ? { fingerprint } : {}),
    ...(options.heartbeat ? { heartbeat: true } : {}),
  }, 20_000);
  if (session.authenticated && session.tgUserId) setMediaOwner(String(session.tgUserId));
  return session;
}

type ServerlessProduct = {
  id?: string;
  imageUrl?: string;
  gallery?: string[];
  variants?: Array<Record<string, unknown>>;
  bundleConfig?: Record<string, unknown>;
  [key: string]: unknown;
};

/** Read the public catalog and turn Telegram media references into browser URLs. */
export async function getServerlessCatalog(options: { resolveMedia?: boolean } = {}): Promise<ServerlessProduct[]> {
  const rows = await callServerless<ServerlessProduct[]>('getCatalog', {}, 20_000);
  if (!Array.isArray(rows)) throw new Error('The product catalog response was invalid.');
  const resolveMedia = options.resolveMedia !== false;
  const safeMedia = async (reference: unknown) => {
    const raw = String(reference || '').trim();
    if (!raw) return '';
    try { return await resolveTelegramMedia(raw); }
    catch (error) {
      console.warn('[PRIME media] Catalog image could not be resolved', {
        reference: raw,
        reason: error instanceof Error ? error.message : 'Media request failed',
      });
      return '';
    }
  };

  return await Promise.all(rows.map(async (product) => {
    const sourceVariants = Array.isArray(product.variants)
      ? product.variants
      : product.bundleConfig && typeof product.bundleConfig === 'object' && Array.isArray((product.bundleConfig as any).variants)
        ? (product.bundleConfig as any).variants
        : [];
    const variants = await Promise.all(sourceVariants.map(async (variant: Record<string, any>) => ({
      ...variant,
      imageUrl: resolveMedia
        ? await safeMedia(variant.imageUrl || variant.image_url)
        : String(variant.imageUrl || variant.image_url || ''),
    })));
    const bundleConfig = product.bundleConfig && typeof product.bundleConfig === 'object'
      ? { ...product.bundleConfig, variants }
      : { variants };

    return {
      ...product,
      imageUrl: resolveMedia ? await safeMedia(product.imageUrl) : String(product.imageUrl || ''),
      gallery: resolveMedia
        ? await Promise.all((Array.isArray(product.gallery) ? product.gallery : []).map((image) => safeMedia(image)))
        : (Array.isArray(product.gallery) ? product.gallery : []),
      variants,
      bundleConfig,
      active: product.active !== false,
    };
  }));
}


export async function uploadPaymentReceiptDataUrl(dataUrl: string, orderId: string, paymentMethodId: string, adjustment = false, ocrAnalysis?: Record<string, unknown> | null): Promise<string> {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(String(dataUrl || ''));
  if (!match) throw new Error('Choose a valid receipt image and try again.');
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const file = new File([bytes], 'payment-receipt', { type: match[1].toLowerCase() });
  return await uploadPaymentReceipt(file, orderId, paymentMethodId, adjustment, ocrAnalysis);
}

function loadImage(file: File): Promise<{ image: CanvasImageSource; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file)
      .then(bitmap => ({ image: bitmap, release: () => bitmap.close() }))
      .catch(() => loadImageElement(file));
  }
  return loadImageElement(file);
}

function loadImageElement(file: File): Promise<{ image: CanvasImageSource; release: () => void }> {
  return new Promise((resolve, reject) => {
    const source = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, release: () => URL.revokeObjectURL(source) });
    image.onerror = () => {
      URL.revokeObjectURL(source);
      reject(new Error('This image could not be opened. Choose a JPG, PNG, or WEBP image.'));
    };
    image.src = source;
  });
}

function canvasJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('This image could not be prepared. Please choose it again.')), 'image/jpeg', quality);
  });
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function prepareJpegUpload(
  file: File,
  options: { maxDimension?: number; maxBytes?: number; preserveTransparency?: boolean } = {},
): Promise<{ id: string; data: string; contentType: string }> {
  if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Choose a JPG, PNG, or WEBP image.');
  const loaded = await loadImage(file);
  let blob: Blob | null = null;
  try {
    const source = loaded.image as CanvasImageSource & { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number };
    const width = Number(source.width || source.naturalWidth || 0);
    const height = Number(source.height || source.naturalHeight || 0);
    if (!width || !height) throw new Error('Image dimensions could not be read. Choose it again.');
    // Keep logo JSON payloads small enough for the Telegram Serverless bridge.
    const maxDimension = Math.max(256, Number(options.maxDimension) || 1024);
    const maxBytes = Math.max(32_000, Number(options.maxBytes) || 600_000);
    let scale = Math.min(1, maxDimension / Math.max(width, height));
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This image could not be prepared. Please choose it again.');
    for (;;) {
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      if (!options.preserveTransparency) { context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); }
      context.drawImage(loaded.image, 0, 0, canvas.width, canvas.height);
      blob = options.preserveTransparency
        ? await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('This image could not be prepared.')), 'image/png'))
        : await canvasJpeg(canvas, 0.82);
      if (!options.preserveTransparency) {
        for (const quality of [0.72, 0.62, 0.52]) {
          if (blob.size <= maxBytes) break;
          blob = await canvasJpeg(canvas, quality);
        }
      }
      if (blob.size <= maxBytes || Math.max(canvas.width, canvas.height) <= 256) break;
      scale *= 0.8;
    }
  } finally { loaded.release(); }
  if (!blob || blob.size > Math.max(32_000, Number(options.maxBytes) || 600_000)) throw new Error('This image is too large to upload. Choose a smaller image.');
  const data = toBase64Url(new Uint8Array(await blob.arrayBuffer()));
  const id = 'img-' + (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);
  return { id, data, contentType: options.preserveTransparency ? 'image/png' : 'image/jpeg' };
}

async function prepareQrUpload(file: File): Promise<{ id: string; data: string; contentType: string }> {
  if (!file || !['image/png', 'image/jpeg'].includes(file.type)) throw new Error('Choose a PNG or JPG QR image.');
  if (file.size > 850_000) throw new Error('This QR image is too large. Choose a smaller PNG or JPG file.');
  const data = toBase64Url(new Uint8Array(await file.arrayBuffer()));
  const id = 'img-' + (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);
  return { id, data, contentType: file.type };
}

/** Fit a phone receipt within both the proof endpoint and local draft limits. */
export async function preparePaymentProofImage(file: File): Promise<string> {
  if (file.size > 10 * 1024 * 1024) throw new Error('Payment proof must be 10 MB or smaller.');
  const prepared = await prepareJpegUpload(file, { maxDimension: 1800, maxBytes: 600_000 });
  const base64 = prepared.data.replace(/-/g, '+').replace(/_/g, '/');
  return 'data:' + prepared.contentType + ';base64,' + base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
}

export type PublicImageBucket = 'product-images' | 'courier-logos' | 'payment-method-logos' | 'payment-qr-codes' | 'media-gallery';

export async function uploadStaffImage(file: File, bucket: PublicImageBucket): Promise<string> {
  if ((bucket === 'courier-logos' || bucket === 'payment-method-logos') && file.size > 3 * 1024 * 1024) {
    throw new Error('Logo files must be 3 MB or smaller.');
  }
  const upload = bucket === 'payment-qr-codes'
    ? await prepareQrUpload(file)
    : await prepareJpegUpload(file, bucket === 'courier-logos' || bucket === 'payment-method-logos'
      ? { maxDimension: 1024, maxBytes: 550_000, preserveTransparency: true }
      : {});
  const result = await callServerless<{ success: boolean; reference: string }>('manageMediaAssets', {
    action: 'uploadPublicImage', id: upload.id, bucket, contentType: upload.contentType, data: upload.data,
  }, 60_000);
  if (!result?.success || !result.reference) throw new Error('The image upload was not confirmed. Try again.');
  return result.reference;
}

export async function uploadProductImage(file: File): Promise<string> {
  if (file.size > 3 * 1024 * 1024) throw new Error('Product image files must be 3 MB or smaller.');
  const upload = await prepareJpegUpload(file);
  const result = await callServerless<{ success: boolean; reference: string }>('manageMediaAssets', {
    action: 'uploadProductImage', id: upload.id,
    contentType: upload.contentType,
    data: upload.data,
  }, 60_000);
  if (!result?.success || !result.reference) throw new Error('The product image upload was not confirmed. Try again.');
  return result.reference;
}

export async function uploadPaymentImage(file: File, bucket: 'payment-method-logos' | 'payment-qr-codes'): Promise<string> {
  if (bucket === 'payment-method-logos' && file.size > 3 * 1024 * 1024) {
    throw new Error('Logo files must be 3 MB or smaller.');
  }
  const upload = await prepareJpegUpload(file, bucket === 'payment-method-logos'
    ? { maxDimension: 1024, maxBytes: 550_000, preserveTransparency: true }
    : {});
  const result = await callServerless<{ success: boolean; reference: string }>('uploadPaymentImage', {
    id: upload.id, bucket, contentType: upload.contentType, data: upload.data,
  }, 60_000);
  if (!result?.success || !result.reference) throw new Error('The payment image upload was not confirmed. Try again.');
  return result.reference;
}

export async function uploadPaymentReceipt(file: File, orderId: string, paymentMethodId: string, adjustment = false, ocrAnalysis?: Record<string, unknown> | null): Promise<string> {
  if (!String(orderId || '').trim()) throw new Error('Order ID is required to attach a receipt.');
  const upload = await prepareJpegUpload(file);
  const result = await callServerless<{ success: boolean; reference: string }>('uploadPaymentReceipt', {
    id: upload.id, orderId, paymentMethodId, adjustment, contentType: 'image/jpeg', data: upload.data,
    ...(ocrAnalysis && !adjustment ? { ocrAnalysis } : {}),
  }, 60_000);
  if (!result?.success || !result.reference) throw new Error('The receipt upload was not confirmed. Try again.');
  return result.reference;
}
