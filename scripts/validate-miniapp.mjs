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
for (const directory of ['tgcloud/lib', 'tgcloud/endpoints', 'tgcloud/handlers']) {
  for (const file of readdirSync(directory).filter(file => file.endsWith('.js'))) {
    const path = join(directory, file);
    const result = spawnSync('node', ['--check', path], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(path + ': ' + result.stderr);
  }
}
console.log('PASS: all backend module syntax');
run('npm', ['run', 'typecheck:miniapp'], 'production Mini App type-check');
run('node', ['scripts/check-telegram-serverless-contracts.mjs'], 'Serverless contracts');
run('node', ['scripts/test-promo-codec.mjs'], 'promo regressions');
run('node', ['scripts/test-delivery-fee.mjs'], 'delivery fee regressions');
run('node', ['scripts/test-checkout-safety.mjs'], 'checkout/inventory/loyalty/recovery safety');
run('node', ['scripts/test-media.mjs'], 'media upload/gallery/offline/playlist safety');
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
