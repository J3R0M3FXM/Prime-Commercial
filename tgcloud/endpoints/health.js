/**
 * Non-sensitive Telegram Serverless smoke-test endpoint.
 * It intentionally returns no customer, order, payment, or configuration data.
 */
export default async function () {
  return {
    ok: true,
    service: 'prime-commercial',
    target: 'telegram-serverless',
    timestamp: new Date().toISOString(),
  };
}
