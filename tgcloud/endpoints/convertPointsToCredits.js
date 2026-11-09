import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { customers, pointTransactions } from '../schema.js';

// A trigger makes the customer balance changes and ledger insert one SQLite
// statement/transaction. Do not split this into separate UPDATE and INSERTs.
const ENSURE_CONVERSION_TRIGGER = `
  CREATE TRIGGER IF NOT EXISTS trg_convert_points_to_credits_v1
  AFTER INSERT ON point_transactions
  WHEN NEW.type IN ('conversion_purchasing', 'conversion_referral')
  BEGIN
    UPDATE point_transactions SET amount = CASE
      WHEN NEW.amount IS NULL OR NEW.amount <= 0 OR NEW.amount != CAST(NEW.amount AS INTEGER)
      THEN RAISE(ABORT, 'Please specify a valid whole number of points') ELSE amount END WHERE id = NEW.id;
    UPDATE customers
    SET points = CASE WHEN NEW.type = 'conversion_purchasing'
          THEN COALESCE(points, 0) - NEW.amount ELSE points END,
        referral_points = CASE WHEN NEW.type = 'conversion_referral'
          THEN COALESCE(referral_points, 0) - NEW.amount ELSE referral_points END,
        store_credits = COALESCE(store_credits, 0) + NEW.amount,
        updated_at = unixepoch()
    WHERE id = NEW.user_id AND (CASE WHEN NEW.type = 'conversion_referral'
      THEN COALESCE(referral_points, 0) ELSE COALESCE(points, 0) END) >= NEW.amount;
    UPDATE point_transactions SET amount = CASE WHEN changes() <> 1
      THEN RAISE(ABORT, 'Insufficient Points') ELSE amount END WHERE id = NEW.id;
  END;
`;

function matchingExisting(existing, customerId, type, amount) {
  return existing && String(existing.userId) === customerId &&
    String(existing.type) === type && Number(existing.amount) === amount;
}

async function currentResult(customerId, pointsType, amount, transactionId) {
  const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
  const transaction = await db.select().from(pointTransactions)
    .where(eq(pointTransactions.id, transactionId)).get();
  if (!customer || !transaction) throw new EndpointError('Conversion result could not be verified.', { code: 'CONVERSION_RESULT_UNAVAILABLE' });
  return {
    success: true,
    pointsType,
    convertedAmount: amount,
    newPointsBalance: Number(pointsType === 'referral' ? customer.referralPoints : customer.points) || 0,
    newCreditsBalance: Number(customer.storeCredits) || 0,
    transaction: {
      id: String(transaction.id),
      type: String(transaction.type),
      amount: Number(transaction.amount),
      orderId: String(transaction.orderId || ''),
      description: String(transaction.description || ''),
      createdAt: transaction.createdAt instanceof Date ? transaction.createdAt.toISOString() : new Date(transaction.createdAt || Date.now()).toISOString(),
    },
  };
}

export default async function (input = {}, ctx) {
  const telegramUserId = ctx?.initData?.user?.id == null ? '' : String(ctx.initData.user.id);
  if (!/^[0-9]{1,24}$/.test(telegramUserId)) {
    throw new EndpointError('A verified Telegram user is required.', { code: 'AUTH_REQUIRED' });
  }

  const pointsType = input?.pointsType;
  if (pointsType !== 'purchasing' && pointsType !== 'referral') {
    throw new EndpointError('Invalid points type. Choose purchasing or referral points.', { code: 'INVALID_POINTS_TYPE' });
  }

  const amount = Number(input?.amount);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new EndpointError('Please specify a valid whole number of points.', { code: 'INVALID_AMOUNT' });
  }

  const operationId = String(input?.operationId || '').toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(operationId)) {
    throw new EndpointError('A valid conversion request ID is required.', { code: 'INVALID_OPERATION_ID' });
  }

  const customer = await db.select().from(customers).where(eq(customers.tgUserId, telegramUserId)).get();
  if (!customer) throw new EndpointError('Customer account not found.', { code: 'CUSTOMER_NOT_FOUND' });

  const customerId = String(customer.id);
  const ledgerType = pointsType === 'referral' ? 'conversion_referral' : 'conversion_purchasing';
  const transactionId = `tx-conv-${customerId}-${operationId}`;

  // Existing installations must not rerun DDL on every conversion. New installs
  // use a write-only body compatible with the runtime SQL mode classifier.
  const installed = await db.get("SELECT name FROM sqlite_master WHERE type='trigger' AND name='trg_convert_points_to_credits_v1'");
  if (!installed) await db.run(ENSURE_CONVERSION_TRIGGER);

  const existing = await db.select().from(pointTransactions)
    .where(eq(pointTransactions.id, transactionId)).get();
  if (existing) {
    if (!matchingExisting(existing, customerId, ledgerType, amount)) {
      throw new EndpointError('This conversion request ID was already used.', { code: 'OPERATION_ID_CONFLICT' });
    }
    return await currentResult(customerId, pointsType, amount, transactionId);
  }

  try {
    await db.insert(pointTransactions).values({
      id: transactionId,
      userId: customerId,
      type: ledgerType,
      amount,
      orderId: null,
      description: `Converted ${amount.toLocaleString('en-US')} ${pointsType} points to ₱${amount.toLocaleString('en-US')} Store Credits`,
    }).run();
  } catch (error) {
    // Concurrent duplicate requests may race after the first lookup. If the
    // first insert committed, return its result rather than applying twice.
    const repeated = await db.select().from(pointTransactions)
      .where(eq(pointTransactions.id, transactionId)).get();
    if (matchingExisting(repeated, customerId, ledgerType, amount)) {
      return await currentResult(customerId, pointsType, amount, transactionId);
    }
    const message = error instanceof Error ? error.message : String(error || '');
    if (/insufficient points/i.test(message)) {
      throw new EndpointError('Insufficient points available for this conversion.', { code: 'INSUFFICIENT_POINTS' });
    }
    if (/valid whole number/i.test(message)) {
      throw new EndpointError(message, { code: 'INVALID_AMOUNT' });
    }
    throw new EndpointError('Point conversion failed. No balances were changed.', { code: 'CONVERSION_FAILED' });
  }

  return await currentResult(customerId, pointsType, amount, transactionId);
}
