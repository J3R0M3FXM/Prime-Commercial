import { db } from 'sdk';
import { eq } from 'sdk/db';
import { customers } from '../schema.js';
import { isAdminUser } from '../lib/auth.js';
import { saveCustomerFingerprint } from '../lib/fingerprints.js';

function memberId() {
  if (!globalThis.crypto?.getRandomValues) throw new Error('Secure random generation is unavailable.');
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export default async function (input = {}, ctx) {
  // Telegram Serverless validates Mini App initData before exposing its user here.
  const user = ctx?.initData?.user;
  const telegramId = user?.id == null ? '' : String(user.id);
  if (!/^[0-9]+$/.test(telegramId)) {
    return { authenticated: false, error: 'A verified Telegram user is required.' };
  }

  const existing = await db.select().from(customers)
    .where(eq(customers.tgUserId, telegramId)).get();
  if (existing?.isBanned === true) {
    return { authenticated: false, error: 'This account is not permitted to use the shop.' };
  }

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
    || String(user.username || '').trim()
    || 'Telegram user';
  const now = new Date();
  const values = {
    tgUserId: telegramId,
    tgName: fullName,
    tgUsername: String(user.username || ''),
    primeMemberId: existing?.primeMemberId || memberId(),
    updatedAt: now,
  };

  const [customer] = await db.insert(customers).values(values).onConflictDoUpdate({
    target: customers.tgUserId,
    set: { tgName: values.tgName, tgUsername: values.tgUsername, updatedAt: now },
  }).returning().run();

  if (!customer || customer.isBanned === true) {
    return { authenticated: false, error: 'Unable to initialize this customer account.' };
  }

  let latestFingerprint = null;
  if (input?.fingerprint && typeof input.fingerprint === 'object') {
    try {
      // CAS protects simultaneous session/heartbeat writes to the JSON history.
      for (let attempt = 0; attempt < 3; attempt++) {
        const [current, stored] = await Promise.all([
          db.select().from(customers).where(eq(customers.id, customer.id)).get(),
          db.get("SELECT COALESCE(CAST(fingerprints AS TEXT), '[]') AS fingerprintsJson FROM customers WHERE id = :id", { ':id': customer.id }),
        ]);
        const saved = await saveCustomerFingerprint(current, input.fingerprint, new Date());
        const result = await db.run(
          `UPDATE customers SET fingerprints = json(:next), updated_at = unixepoch()
            WHERE id = :id AND COALESCE(fingerprints, '[]') = COALESCE(:current, '[]')`,
          { ':next': JSON.stringify(saved.fingerprints), ':id': customer.id,
            ':current': String(stored?.fingerprintsJson || '[]') },
        );
        if (Number(result?.rowsAffected) > 0) { latestFingerprint = saved.latestFingerprint; break; }
      }
    } catch (error) {
      // Fingerprint telemetry must never prevent an otherwise verified login.
      console.warn('[getTelegramSession] fingerprint persistence failed:', error?.message || error);
    }
  }

  const isAdmin = await isAdminUser(ctx);
  const referrer = customer.referredByMemberId
    ? await db.select({ name: customers.tgName }).from(customers)
      .where(eq(customers.primeMemberId, customer.referredByMemberId)).get()
    : null;
  return {
    authenticated: true,
    sessionReady: true,
    isAdmin,
    tgUserId: telegramId,
    tgName: customer.tgName || fullName,
    tgUsername: String(user.username || customer.tgUsername || ''),
    phoneNumber: customer.phoneNumber || '',
    primeMemberId: customer.primeMemberId || '',
    storeCredits: Number(customer.storeCredits) || 0,
    referredByMemberId: customer.referredByMemberId || '',
    referredByName: referrer?.name || '',
    latestFingerprint,
    user: {
      id: telegramId,
      customerId: customer.id,
      name: customer.tgName || fullName,
      username: String(user.username || customer.tgUsername || ''),
      primeMemberId: customer.primeMemberId || '',
      role: isAdmin ? 'admin' : 'customer',
      latestFingerprint,
    },
  };
}
