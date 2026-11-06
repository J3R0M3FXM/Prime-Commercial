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
