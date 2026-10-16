import { db } from 'sdk';
import { asc, eq } from 'sdk/db';
import { paymentMethods } from '../schema.js';

/**
 * Public payment instructions only. Secret keys and webhook URLs are never
 * selected, returned, or accepted from the client.
 */
export default async function () {
  const rows = await db
    .select({
      id: paymentMethods.id,
      name: paymentMethods.name,
      logo: paymentMethods.logo,
      paymentType: paymentMethods.paymentType,
      publicKey: paymentMethods.publicKey,
      qrCodeImage: paymentMethods.qrCodeImage,
      walletAddress: paymentMethods.walletAddress,
      accountName: paymentMethods.accountName,
      accountNumber: paymentMethods.accountNumber,
      sortOrder: paymentMethods.sortOrder,
      isActive: paymentMethods.isActive,
    })
    .from(paymentMethods)
    .where(eq(paymentMethods.isActive, true))
    .orderBy(asc(paymentMethods.sortOrder))
    .all();

  return rows;
}
