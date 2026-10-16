import { saveBusinessConnection } from '../lib/telegram-automation.js';

/** Telegram Serverless validates and routes this Bot API update type. */
export default async function (connection) {
  if (!connection?.id || !connection?.user?.id) return;
  await saveBusinessConnection(connection);
}
