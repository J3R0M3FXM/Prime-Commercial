import { db } from 'sdk';
import { eq } from 'sdk/db';
import { customers, orders } from '../schema.js';

const fail = (error) => ({ valid: false, error });

/** Validate an optional referral code against the verified customer's account. */
export default async function (input, ctx) {
  const telegramId = ctx?.initData?.user?.id == null ? '' : String(ctx.initData.user.id);
  if (!/^[0-9]+$/.test(telegramId)) return fail('Telegram authentication required.');

  const code = String(input?.referralCode || '').trim().toUpperCase();
  if (!code) return fail('Please enter a referral code.');
  const customer = await db.select().from(customers).where(eq(customers.tgUserId, telegramId)).get();
  if (!customer) return fail('Customer account not found. Please reopen the Mini App and try again.');
  if (customer.isBanned === true) return fail('This account cannot use referral codes.');
  if (customer.referredByUserId || customer.referredByMemberId) {
    return fail('A referral is already linked to this account.');
  }

  const referrer = await db.select({ id: customers.id, tgUserId: customers.tgUserId, name: customers.tgName, memberId: customers.primeMemberId })
    .from(customers).where(eq(customers.primeMemberId, code)).get();
  if (!referrer || referrer.id === customer.id) return fail('Referral code is invalid.');
  const successfulOrder = await db.get(
    `SELECT id FROM orders
      WHERE (customer_id = :customer_id OR tg_user_id = :telegram_id)
        AND lower(trim(coalesce(status, ''))) IN ('completed', 'delivered')
      LIMIT 1`,
    { ':customer_id': String(referrer.id), ':telegram_id': String(referrer.tgUserId || '') },
  );
  const hasSuccessfulOrder = Boolean(successfulOrder?.id);
  if (!hasSuccessfulOrder) return fail('This PRIME Member can refer after their first successful completed or delivered order.');

  return {
    valid: true,
    referrerName: referrer.name || 'Valued Member',
    referrerMemberId: referrer.memberId || code,
  };
}
