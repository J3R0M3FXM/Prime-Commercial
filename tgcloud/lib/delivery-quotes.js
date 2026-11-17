import { db, EndpointError } from 'sdk';

const LIFETIME_SECONDS = 60 * 60;
async function ensureQuotes() {
  await db.run(`CREATE TABLE IF NOT EXISTS checkout_delivery_quotes (
    id TEXT PRIMARY KEY, tg_user_id TEXT NOT NULL, destination_lat REAL NOT NULL,
    destination_lon REAL NOT NULL, quote_json TEXT NOT NULL, expires_at INTEGER NOT NULL)`);
}

export async function saveDeliveryQuote(quote, lat, lon, telegramId) {
  if (!/^[0-9]+$/.test(String(telegramId || ''))) return quote;
  await ensureQuotes();
  const id = globalThis.crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + LIFETIME_SECONDS;
  await db.run('DELETE FROM checkout_delivery_quotes WHERE expires_at<=unixepoch()');
  await db.run(`INSERT INTO checkout_delivery_quotes VALUES (:id,:user,:lat,:lon,:quote,:expires)`, {
    ':id': id, ':user': String(telegramId), ':lat': Number(lat), ':lon': Number(lon),
    ':quote': JSON.stringify(quote), ':expires': expiresAt,
  });
  const tag = row => row ? { ...row, deliveryQuoteId: id, deliveryQuoteExpiresAt: expiresAt } : row;
  return { ...quote, deliveryQuoteId: id, deliveryQuoteExpiresAt: expiresAt,
    courier: tag(quote.courier), couriers: quote.couriers.map(tag) };
}

export async function readDeliveryQuote(id, telegramId, lat, lon, courierId) {
  if (!id) return null; // Old clients retain the original authoritative quote path.
  await ensureQuotes();
  const row = await db.get(`SELECT destination_lat AS lat,destination_lon AS lon,quote_json AS quoteJson
    FROM checkout_delivery_quotes WHERE id=:id AND tg_user_id=:user AND expires_at>unixepoch()`,
  { ':id': String(id), ':user': String(telegramId) });
  if (!row || Math.abs(Number(row.lat) - Number(lat)) > 0.0000001 || Math.abs(Number(row.lon) - Number(lon)) > 0.0000001) {
    throw new EndpointError('Your delivery quote expired or the destination changed. Return to Review to refresh it before paying. If you already paid, contact the shop before paying again.', { code: 'DELIVERY_QUOTE_EXPIRED' });
  }
  const quote = JSON.parse(row.quoteJson);
  const courier = quote.couriers.find(item => String(item.id) === String(courierId));
  const active = courier && await db.get('SELECT id FROM couriers WHERE id=:id AND is_active=1', { ':id': String(courierId) });
  if (!active || courier.coverageAvailable === false || !Number.isFinite(Number(courier.calculatedFee))) {
    throw new EndpointError('This courier is no longer available. Return to Delivery to choose another courier.', { code: 'COURIER_OUTSIDE_COVERAGE' });
  }
  return { ...quote, courier, fee: Number(courier.calculatedFee) };
}
