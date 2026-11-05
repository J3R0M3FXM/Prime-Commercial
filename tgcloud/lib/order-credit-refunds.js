import { db } from 'sdk';

const amountOf = (value) => Math.max(0, Math.round((Number(value) || 0) * 100) / 100);

export async function queueOrderCreditRefund({ orderId, customerId, amount, reason }) {
  await db.run(`CREATE TABLE IF NOT EXISTS order_credit_refunds (
    id TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE, customer_id TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending', reason TEXT NOT NULL DEFAULT '',
    error TEXT, created_at INTEGER NOT NULL, completed_at INTEGER, updated_at INTEGER NOT NULL
  )`);
  const id = 'order-credit-refund:' + String(orderId);
  const refundAmount = amountOf(amount);
  if (!orderId || !customerId || refundAmount <= 0) return { queued: false, completed: true, reason: 'nothing_to_refund' };
  await db.run(`INSERT INTO order_credit_refunds (id, order_id, customer_id, amount, status, reason, created_at, updated_at)
    VALUES (:id, :order_id, :customer_id, :amount, 'pending', :reason, unixepoch(), unixepoch())
    ON CONFLICT(order_id) DO NOTHING`, { ':id': id, ':order_id': String(orderId), ':customer_id': String(customerId), ':amount': refundAmount, ':reason': String(reason || 'Order refund') });
  return settleOrderCreditRefund(id);
}

export async function settleOrderCreditRefund(id) {
  const refund = await db.get(`SELECT * FROM order_credit_refunds WHERE id=:id`, { ':id': String(id) });
  if (!refund) return { completed: false, reason: 'refund_missing' };
  if (String(refund.status).toLowerCase() === 'completed') return { completed: true, alreadyCompleted: true };
  const operation = 'order-credit-refund:' + String(refund.orderId);
  const claimed = await db.run(`UPDATE customers SET store_credits=coalesce(store_credits,0)+:amount,
      store_credits_operation_id=:operation, store_credits_operation_amount=:amount,
      updated_at=unixepoch()
    WHERE id=:customer_id AND store_credits_operation_id IS NULL
    RETURNING id`, { ':amount': Number(refund.amount) || 0, ':operation': operation, ':customer_id': String(refund.customerId) });
  if (!Number(claimed?.rowsAffected)) {
    await db.run(`UPDATE order_credit_refunds SET error='customer credit ledger busy', updated_at=unixepoch() WHERE id=:id AND status='pending'`, { ':id': String(id) });
    return { completed: false, reason: 'customer_credits_busy' };
  }
  await db.run(`INSERT INTO point_transactions (id,user_id,type,amount,order_id,description,created_at)
    VALUES (:tx,:user_id,'store_credit_refund',:amount,:order_id,:description,unixepoch()) ON CONFLICT(id) DO NOTHING`, {
    ':tx': 'refund-ledger:' + String(refund.orderId), ':user_id': String(refund.customerId), ':amount': Number(refund.amount) || 0,
    ':order_id': String(refund.orderId), ':description': String(refund.reason || 'Store Credit refund'),
  });
  await db.run(`UPDATE order_credit_refunds SET status='completed', error=NULL, completed_at=unixepoch(), updated_at=unixepoch() WHERE id=:id AND status='pending'`, { ':id': String(id) });
  await db.run(`UPDATE customers SET store_credits_operation_id=NULL, store_credits_operation_amount=0, store_credits_operation_received_amount=0, updated_at=unixepoch() WHERE id=:customer_id AND store_credits_operation_id=:operation`, { ':customer_id': String(refund.customerId), ':operation': operation });
  await db.run(`UPDATE orders SET store_credits_released_at=coalesce(store_credits_released_at,unixepoch()), updated_at=unixepoch() WHERE id=:order_id`, { ':order_id': String(refund.orderId) });
  return { completed: true, amount: Number(refund.amount) || 0 };
}
