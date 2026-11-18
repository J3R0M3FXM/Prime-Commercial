import { db } from 'sdk';

/** Restore only internally funded money when an unpaid POS invoice is cancelled. */
export async function ensurePosInvoiceRefunds() {
  const params={':type':'trigger',':name':'trg_pos_unpaid_invoice_refund_v1'};
  const exists=()=>db.get('SELECT name FROM sqlite_master WHERE type=:type AND name=:name',params);
  if(await exists())return;
  try { await db.run(`CREATE TRIGGER IF NOT EXISTS trg_pos_unpaid_invoice_refund_v1
    AFTER UPDATE OF status ON orders
    WHEN lower(NEW.status)='cancelled' AND lower(OLD.status)<>'cancelled'
      AND lower(OLD.payment_status)='unpaid' AND NEW.notes LIKE 'POS ·%'
      AND coalesce(NEW.store_credits_used,0)>0
    BEGIN
      SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id
        AND store_credits_operation_id IS NULL) THEN RAISE(ABORT,'Customer credits are busy. Retry cancellation shortly.') END;
      INSERT INTO point_transactions(id,user_id,type,amount,order_id,description,created_at)
        VALUES('pos-unpaid-credit-refund:'||NEW.id,NEW.customer_id,'store_credit_refund',NEW.store_credits_used,NEW.id,
          'Store Credits returned for unpaid POS invoice #'||NEW.order_number,unixepoch()) ON CONFLICT(id) DO NOTHING;
      UPDATE customers SET store_credits=coalesce(store_credits,0)+NEW.store_credits_used,
        received_transfer_balance=coalesce(received_transfer_balance,0)+coalesce(NEW.received_transfer_used,0),updated_at=unixepoch()
        WHERE id=NEW.customer_id AND changes()=1;
      UPDATE orders SET store_credits_released_at=coalesce(store_credits_released_at,unixepoch()) WHERE id=NEW.id;
    END`);
  } catch(error) {
    // A concurrent initializer may already have installed the trigger.
    if(!await exists())throw error;
  }
}
