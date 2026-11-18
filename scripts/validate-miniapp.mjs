import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

function run(command, args, label, summarize = false) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
    if (result.error) console.error(result.error);
    throw new Error(label + ' failed');
  }
  if (summarize) {
    for (const line of (result.stdout || '').split('\n').filter(line => /modules transformed|built in|dist\/index.html/.test(line))) console.log(line);
    if (result.stderr) console.log('Vite emitted non-fatal dependency/configuration/chunk warnings.');
  } else if (result.stdout) process.stdout.write(result.stdout);
  console.log('PASS: ' + label);
}

run('git', ['diff', '--check'], 'diff whitespace');
for (const directory of ['tgcloud/lib', 'tgcloud/endpoints', 'tgcloud/handlers','automation']) {
  for (const file of readdirSync(directory).filter(file => file.endsWith('.js'))) {
    const path = join(directory, file);
    const result = spawnSync('node', ['--check', path], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(path + ': ' + result.stderr);
  }
}
console.log('PASS: all backend module syntax');
run('npm', ['run', 'typecheck:miniapp'], 'production Mini App type-check');
run('node', ['scripts/check-telegram-serverless-contracts.mjs'], 'Serverless contracts');
run('node', ['scripts/test-receipt-deadlines.mjs'], 'staff-requested receipt expiry');
run('node', ['scripts/test-order-workflow.mjs'], 'order controller, refunds and scheduled completion');
run('node', ['scripts/test-orders-register-ui.mjs'], 'Orders register and bounded detail loading');
run('node', ['scripts/test-order-controller-ui.mjs'], 'rendered order controller and action locks');
run('node', ['scripts/test-customer-notifications.mjs'], 'customer status messages and Telegram delivery');
run('node', ['scripts/test-customer-order-actions.mjs'], 'customer action locks and notification destinations');
run('node', ['scripts/test-order-scheduler.mjs'], 'GitHub order scheduler activation and bounds');
run('node', ['scripts/test-support-tabs.mjs'], 'customer and staff Support sub-tabs');
run('node', ['scripts/test-support-backend.mjs'], 'Support ownership, replies and FAQ capacity');
run('node', ['scripts/test-promo-codec.mjs'], 'promo regressions');
run('node', ['scripts/test-customer-promo.mjs'], 'customer-specific promo enforcement');
run('node', ['scripts/test-voucher-generator.mjs'], 'voucher generation and PNG export');
run('node', ['scripts/test-voucher-delivery.mjs'], 'voucher delivery authorization and retries');
run('node', ['scripts/test-order-location-pipeline.mjs'], 'IP and GPS snapshot provider pipeline');
run('node', ['scripts/test-mapbox-ui.mjs'], 'Mapbox views and pin lifecycle');
run('node', ['scripts/test-receipt-transfer.mjs'], 'receipt image transfer and stable cache');
run('node', ['scripts/test-delivery-fee.mjs'], 'delivery fee regressions');
run('node', ['scripts/test-checkout-promo-state.mjs'], 'fresh promo result before React render');
run('node', ['scripts/test-checkout-delivery-quotes.mjs'], 'stable checkout quote and promo totals');
run('node', ['scripts/test-checkout-safety.mjs'], 'checkout/inventory/loyalty/recovery safety');
run('node', ['scripts/test-pos-invoice-ui.mjs'], 'rendered unpaid POS invoice flow');
run('node', ['scripts/test-pos-invoice-image.mjs'], 'POS invoice image and configured QR');
run('node', ['scripts/test-pos-invoice-delivery.mjs'], 'POS invoice delivery and payment confirmation');
run('node', ['scripts/test-pos-launcher.mjs'], 'installed POS launcher and staff gate');
run('node', ['scripts/test-pos-startup.mjs'], 'stable authentication startup and lightweight POS customers');
run('node', ['scripts/test-pos-ui.mjs'], 'rendered POS register controls');
run('node', ['scripts/test-checkout-idempotency.mjs'], 'checkout and POS collision/retry hardening');
run('node', ['scripts/test-credit-operations.mjs'], 'points conversion and Store Credit transfer safety');
run('node', ['scripts/test-account-staff-view.mjs'], 'staff account view authorization and customer parity');
run('node', ['scripts/test-shopfront-queue.mjs'], 'shopfront queue ownership and ordering');
run('node', ['scripts/test-shopfront-payment-link.mjs'], 'shopfront secure payment link');
run('node', ['scripts/test-payment-method-links.mjs'], 'Admin payment link runtime and persistence');
run('node', ['scripts/test-order-delivery-payment.mjs'], 'saved delivery-payment timing in history');
run('node', ['scripts/test-order-history-dates.mjs'], 'customer order history dates and ordering');
run('node', ['scripts/test-order-confirmation.mjs'], 'order confirmation display and payment states');
run('node', ['scripts/test-device-security.mjs'], 'device recognition ownership, privacy and persistence');
run('node', ['scripts/test-device-collection.mjs'], 'launch GPS and fingerprint recovery');
run('node', ['scripts/test-asset-library.mjs'], 'Assets picker and storage integration');
run('node', ['scripts/test-device-security-ui.mjs'], 'device security customer and staff controls');
run('node', ['scripts/test-media.mjs'], 'media upload/gallery/offline/playlist safety');
run('node', ['scripts/test-secretary-ui.mjs'], 'Secretary configurator layout/navigation/save regressions');
run('node', ['scripts/test-secretary-broadcast.mjs'], 'Secretary broadcast authorization and duplicate-send safety');
run('node', ['scripts/test-admin-portrait.mjs'], 'Admin portrait and configuration preservation');
run('node', ['--check', 'public/media-offline-worker.js'], 'offline media worker syntax');
run('node_modules/.bin/rolldown', ['cloudflare/prime-media/src/index.mjs', '--platform', 'browser', '--format', 'esm', '--file', 'cloudflare/prime-media/dist/worker.mjs'], 'R2 Worker bundle');
run('node', ['cloudflare/prime-media/test-worker.mjs'], 'R2 Worker auth/metadata/range/unpublish safety');
run('python', ['-B', '-c', `import runpy
m = runpy.run_path('cloudflare/prime-media/update-worker.py')['metadata']
names = ['R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','TELEGRAM_BOT_TOKEN','ADMIN_TELEGRAM_IDS','STREAM_SIGNING_KEY']
s = {'compatibility_date':'2026-11-04','bindings':[{'name':'MEDIA_BUCKET','type':'r2_bucket','bucket_name':'prime-media-preview'}] + [{'name':n,'type':'secret_text'} for n in names]}
r=m(s)
assert r['keep_bindings']==['secret_text'] and len(r['bindings'])==1
s['bindings'][0]['bucket_name']='other'
try: m(s)
except RuntimeError: pass
else: raise AssertionError('Unexpected bucket accepted')
`], 'Worker release binding preservation');
if (process.env.VITE_UI_PREVIEW === '1') throw new Error('Production validation must not enable VITE_UI_PREVIEW');
run('npm', ['run', 'build:miniapp'], 'production build', true);
