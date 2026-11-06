import { db } from 'sdk';

let migration;

export async function ensureCourierTimeRateColumn() {
  if (!migration) {
    migration = db.run('ALTER TABLE couriers ADD COLUMN time_based_fee_per_minute REAL NOT NULL DEFAULT 0')
      .catch((error) => {
        if (!/duplicate column|already exists/i.test(String(error?.message || error))) throw error;
      });
  }
  return await migration;
}

export async function getCourierTimeRates() {
  await ensureCourierTimeRateColumn();
  const rows = await db.all('SELECT id, time_based_fee_per_minute AS timeBasedFeePerMinute FROM couriers');
  return new Map(rows.map((row) => [String(row.id), Number(row.timeBasedFeePerMinute) || 0]));
}

export async function saveCourierTimeRate(courierId, value) {
  await ensureCourierTimeRateColumn();
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0) throw new Error('Courier time-based fee must be a non-negative number.');
  await db.run('UPDATE couriers SET time_based_fee_per_minute=:rate WHERE id=:id', {
    ':rate': rate, ':id': String(courierId),
  });
  const saved = await db.get('SELECT time_based_fee_per_minute AS timeBasedFeePerMinute FROM couriers WHERE id=:id', {
    ':id': String(courierId),
  });
  if (!saved || Number(saved.timeBasedFeePerMinute) !== rate) throw new Error('Courier time-based fee could not be saved.');
  return rate;
}
