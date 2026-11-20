export const RECEIPT_SCAN_PRESENTATION_MS = 23_000;

export async function waitForReceiptScanPresentation(startedAt: number) {
  const remaining = RECEIPT_SCAN_PRESENTATION_MS - (Date.now() - startedAt);
  if (remaining > 0) await new Promise<void>(resolve => globalThis.setTimeout(resolve, remaining));
}
