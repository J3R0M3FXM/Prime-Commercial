import { db } from 'sdk';

/** Public aggregate only: no order identifiers, customer data, or payment details. */
export default async function () {
  const counts = await db.get(`
    WITH classified AS (
      SELECT created_at, ready_at,
        CASE WHEN (lower(trim(coalesce(status, ''))) = 'pending'
          AND (lower(trim(coalesce(payment_status, ''))) = 'pending review'
            OR (lower(trim(coalesce(payment_status, ''))) = 'unpaid'
              AND (trim(coalesce(payment_proof_image, '')) <> ''
                OR coalesce(payment_deadline_at, created_at + 3600) > unixepoch()))))
          OR (lower(trim(status)) = 'confirmed' AND lower(trim(payment_status)) = 'paid')
          THEN 1 ELSE 0 END AS queued,
        CASE WHEN lower(trim(coalesce(status, ''))) = 'processing'
          AND lower(trim(coalesce(payment_status, ''))) = 'paid'
          THEN 1 ELSE 0 END AS processing,
        CASE WHEN lower(trim(coalesce(status, ''))) = 'pending'
          AND lower(trim(coalesce(payment_status, ''))) = 'unpaid'
          AND trim(coalesce(payment_proof_image, '')) = ''
          AND coalesce(payment_deadline_at, created_at + 3600) <= unixepoch()
          THEN 1 ELSE 0 END AS expired
      FROM orders
    ), intervals AS (
      SELECT created_at, ready_at, queued + processing AS active,
        CASE WHEN queued + processing > 0 THEN unixepoch() + 1 ELSE ready_at END AS queue_end
      FROM classified
      WHERE created_at IS NOT NULL AND created_at <= unixepoch()
        AND (queued + processing > 0 OR ready_at >= created_at)
    ), previous_work AS (
      SELECT *, MAX(queue_end) OVER (
        ORDER BY created_at, queue_end ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ) AS previous_end
      FROM intervals
    ), batches AS (
      SELECT *, SUM(CASE WHEN previous_end IS NULL OR created_at >= previous_end THEN 1 ELSE 0 END)
        OVER (ORDER BY created_at, queue_end ROWS UNBOUNDED PRECEDING) AS batch
      FROM previous_work
    )
    SELECT
      (SELECT coalesce(SUM(queued), 0) FROM classified) AS ordersInQueue,
      (SELECT coalesce(SUM(processing), 0) FROM classified) AS ordersInProcessing,
      (SELECT coalesce(SUM(expired), 0) FROM classified) AS expiredUnpaidPendingOrders,
      (SELECT AVG((CASE WHEN active > 0 THEN unixepoch() ELSE ready_at END - created_at) / 60.0)
        FROM batches WHERE batch = (SELECT MAX(batch) FROM batches WHERE active > 0)) AS elapsedAverageMinutes
  `);
  const ordersInQueue = Math.max(0, Number(counts?.ordersInQueue) || 0);
  const ordersInProcessing = Math.max(0, Number(counts?.ordersInProcessing) || 0);
  const expiredUnpaidPendingOrders = Math.max(0, Number(counts?.expiredUnpaidPendingOrders) || 0);
  const totalActive = ordersInQueue + ordersInProcessing;
  // Average elapsed placement-to-Ready durations within the current continuous busy period.
  // Active orders keep ticking; Ready orders stop at ready_at. An idle gap resets the sample.
  const averageReadyMinutes = totalActive === 0
    ? 0
    : Math.max(35, Math.round(Number(counts?.elapsedAverageMinutes) || 0));
  return {
    ordersInQueue,
    ordersInProcessing,
    expiredUnpaidPendingOrders,
    averageReadyMinutes,
    trafficFlowStatus: totalActive < 5 ? 'LIGHT' : totalActive < 10 ? 'MODERATE' : 'HEAVY',
    updatedAt: new Date().toISOString(),
  };
}
