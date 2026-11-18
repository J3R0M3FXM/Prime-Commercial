import { db } from 'sdk';

/** Public aggregate only: no order identifiers, customer data, or payment details. */
export default async function () {
  const counts = await db.get(`
    SELECT
      COALESCE(SUM(CASE WHEN (lower(trim(coalesce(status, ''))) = 'pending'
        AND (lower(trim(coalesce(payment_status, ''))) = 'pending review'
          OR (lower(trim(coalesce(payment_status, ''))) = 'unpaid'
            AND (trim(coalesce(payment_proof_image, '')) <> ''
              OR coalesce(payment_deadline_at, created_at + 3600) > unixepoch()))))
        OR (lower(status)='confirmed' AND lower(payment_status)='paid') THEN 1 ELSE 0 END), 0) AS ordersInQueue,
      COALESCE(SUM(CASE WHEN lower(trim(coalesce(status, ''))) = 'pending'
        AND lower(trim(coalesce(payment_status, ''))) = 'unpaid'
        AND trim(coalesce(payment_proof_image, '')) = ''
        AND coalesce(payment_deadline_at, created_at + 3600) <= unixepoch()
        THEN 1 ELSE 0 END), 0) AS expiredUnpaidPendingOrders,
      COALESCE(SUM(CASE WHEN lower(trim(coalesce(status, ''))) = 'processing'
        AND lower(trim(coalesce(payment_status, ''))) = 'paid' THEN 1 ELSE 0 END), 0) AS ordersInProcessing
    FROM orders
  `);
  const ordersInQueue = Math.max(0, Number(counts?.ordersInQueue) || 0);
  const ordersInProcessing = Math.max(0, Number(counts?.ordersInProcessing) || 0);
  const expiredUnpaidPendingOrders = Math.max(0, Number(counts?.expiredUnpaidPendingOrders) || 0);
  const totalActive = ordersInQueue + ordersInProcessing;
  // Only current work contributes: an empty queue resets the next order to 35 minutes.
  // Keep the idle response at zero so the client can display --.
  const minimumPreparationMinutes = 35;
  const averageReadyMinutes = totalActive === 0
    ? 0
    : Math.min(240, minimumPreparationMinutes * totalActive);
  return {
    ordersInQueue,
    ordersInProcessing,
    expiredUnpaidPendingOrders,
    averageReadyMinutes,
    trafficFlowStatus: totalActive < 5 ? 'LIGHT' : totalActive < 10 ? 'MODERATE' : 'HEAVY',
    updatedAt: new Date().toISOString(),
  };
}
