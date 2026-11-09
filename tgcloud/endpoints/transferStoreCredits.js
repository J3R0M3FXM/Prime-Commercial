import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { customers, storeCreditTransfers } from '../schema.js';

// One INSERT owns both balance changes and both ledger entries. A failed check
// aborts the complete SQLite statement, so credits cannot leave only one side.
const ENSURE_TRANSFER_TRIGGER = `
  CREATE TRIGGER IF NOT EXISTS trg_store_credit_transfer_v1
  AFTER INSERT ON store_credit_transfers
  BEGIN
    UPDATE store_credit_transfers SET amount_cents = CASE
      WHEN NEW.amount_cents < 1 OR NEW.amount_cents <> CAST(NEW.amount_cents AS INTEGER) OR NEW.sender_id = NEW.recipient_id
      THEN RAISE(ABORT, 'Invalid Store Credits transfer') ELSE amount_cents END WHERE id = NEW.id;
    UPDATE customers SET store_credits = round((coalesce(store_credits, 0) * 100 - NEW.amount_cents)) / 100.0,
      updated_at = unixepoch() WHERE id = NEW.sender_id AND store_credits_operation_id IS NULL
      AND round((coalesce(store_credits, 0) - coalesce(received_transfer_balance, 0)) * 100) >= NEW.amount_cents;
    UPDATE store_credit_transfers SET amount_cents = CASE WHEN changes() <> 1
      THEN RAISE(ABORT, 'Insufficient transferable Store Credits') ELSE amount_cents END WHERE id = NEW.id;
    UPDATE customers SET store_credits = round((coalesce(store_credits, 0) * 100 + NEW.amount_cents)) / 100.0,
      received_transfer_balance = round((coalesce(received_transfer_balance, 0) * 100 + NEW.amount_cents)) / 100.0,
      updated_at = unixepoch() WHERE id = NEW.recipient_id;
    UPDATE store_credit_transfers SET amount_cents = CASE WHEN changes() <> 1
      THEN RAISE(ABORT, 'Recipient PRIME Member ID was not found') ELSE amount_cents END WHERE id = NEW.id;
    INSERT INTO point_transactions (id, user_id, type, amount, description, created_at)
      VALUES ('transfer-out-' || NEW.id, NEW.sender_id, 'store_credit_transfer_out', -NEW.amount_cents / 100.0,
        'Store Credits transferred to another PRIME member', unixepoch());
    INSERT INTO point_transactions (id, user_id, type, amount, description, created_at)
      VALUES ('transfer-in-' || NEW.id, NEW.recipient_id, 'store_credit_transfer_in', NEW.amount_cents / 100.0,
        'Store Credits received from another PRIME member', unixepoch());
  END;
`;

export default async function (input = {}, ctx) {
  const telegramId = ctx?.initData?.user?.id == null ? '' : String(ctx.initData.user.id);
  if (!/^[0-9]{1,24}$/.test(telegramId)) throw new EndpointError('A verified Telegram user is required.', { code: 'AUTH_REQUIRED' });
  const recipientMemberId = String(input.recipientMemberId || '').trim().toUpperCase();
  const operationId = String(input.operationId || '').trim().toLowerCase();
  const amount = Number(input.amount);
  const amountCents = Math.round(amount * 100);
  if (!/^[A-Z0-9]{6,24}$/.test(recipientMemberId)) throw new EndpointError('Enter a valid PRIME Member ID.', { code: 'INVALID_MEMBER_ID' });
  if (!/^[a-f0-9]{32}$/.test(operationId)) throw new EndpointError('A valid transfer request ID is required.', { code: 'INVALID_OPERATION_ID' });
  if (!Number.isSafeInteger(amountCents) || amountCents < 1 || Math.abs(amount * 100 - amountCents) > 0.000001) {
    throw new EndpointError('Enter an amount in pesos and centavos.', { code: 'INVALID_AMOUNT' });
  }
  const sender = await db.select().from(customers).where(eq(customers.tgUserId, telegramId)).get();
  if (!sender) throw new EndpointError('Your PRIME account could not be found.', { code: 'ACCOUNT_NOT_FOUND' });
  const recipient = await db.select().from(customers).where(eq(customers.primeMemberId, recipientMemberId)).get();
  if (!recipient) throw new EndpointError('Recipient PRIME Member ID was not found.', { code: 'RECIPIENT_NOT_FOUND' });
  if (String(sender.id) === String(recipient.id)) throw new EndpointError('Choose another PRIME member.', { code: 'SELF_TRANSFER' });
  const transferId = `sc-transfer-${sender.id}-${operationId}`;
  const installed = await db.get("SELECT name FROM sqlite_master WHERE type='trigger' AND name='trg_store_credit_transfer_v1'");
  if (!installed) await db.run(ENSURE_TRANSFER_TRIGGER);
  let existing = await db.select().from(storeCreditTransfers).where(eq(storeCreditTransfers.id, transferId)).get();
  if (!existing) {
    try {
      await db.run(
        `INSERT INTO store_credit_transfers (id, sender_id, recipient_id, amount_cents, created_at)
         VALUES (:id, :sender_id, :recipient_id, :amount_cents, unixepoch())`,
        { ':id': transferId, ':sender_id': String(sender.id), ':recipient_id': String(recipient.id), ':amount_cents': amountCents },
      );
    } catch (error) {
      existing = await db.select().from(storeCreditTransfers).where(eq(storeCreditTransfers.id, transferId)).get();
      if (!existing) {
        const message = String(error?.message || '');
        if (message.includes('Insufficient transferable')) throw new EndpointError('You can transfer only credits you earned or converted. Received credits cannot be transferred again.', { code: 'INSUFFICIENT_TRANSFERABLE_CREDITS' });
        throw new EndpointError('Transfer could not be completed. Please try again.', { code: 'TRANSFER_FAILED' });
      }
    }
  }
  existing = existing || await db.select().from(storeCreditTransfers).where(eq(storeCreditTransfers.id, transferId)).get();
  if (!existing || String(existing.senderId) !== String(sender.id) || String(existing.recipientId) !== String(recipient.id) || Number(existing.amountCents) !== amountCents) {
    throw new EndpointError('This transfer request ID was already used for a different transfer.', { code: 'TRANSFER_CONFLICT' });
  }
  const current = await db.select().from(customers).where(eq(customers.id, sender.id)).get();
  return { success: true, transferId, amount: amountCents / 100, recipientMemberId,
    newCreditsBalance: Number(current?.storeCredits) || 0,
    transferableCredits: Math.max(0, (Number(current?.storeCredits) || 0) - (Number(current?.receivedTransferBalance) || 0)) };
}
