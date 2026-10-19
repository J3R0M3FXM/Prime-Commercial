import { spawn } from 'node:child_process';

const port = 3197;
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    ALLOW_PREVIEW_AUTH: '',
    SESSION_SECRET: '',
    TELEGRAM_BOT_TOKEN: '',
    SUPABASE_URL: '',
    NEXT_PUBLIC_SUPABASE_URL: '',
    SUPABASE_SECRET_KEY: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
    SUPABASE_PUBLISHABLE_KEY: '',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
    SUPABASE_ANON_KEY: '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
  },
  stdio: 'ignore',
});

const checks = [
  ['GET', '/api/auth/telegram/validate', undefined, 401],
  ['POST', '/api/auth/telegram/validate', { initData: 'preview' }, null],
  ['GET', '/api/account', undefined, 401],
  ['GET', '/api/orders', undefined, 401],
  ['POST', '/api/orders', {}, 401],
  ['GET', '/api/admin/warehouses', undefined, 401],
  ['POST', '/api/admin/warehouses', {}, 401],
  ['GET', '/api/admin/couriers', undefined, 401],
  ['POST', '/api/admin/couriers', {}, 401],
  ['GET', '/api/admin/payments', undefined, 401],
  ['POST', '/api/account/points/convert', {}, 401],
  ['POST', '/api/account/points/transfer', {}, 401],
  ['GET', '/api/products', undefined, 401],
  ['GET', '/api/payment-methods', undefined, 401],
  ['GET', '/api/charges', undefined, 401],
];

async function waitForServer() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Next server exited early with code ${server.exitCode}`);
    try {
      await fetch(`${base}/api/auth/telegram/validate`);
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  throw new Error('Next server did not become ready within 30 seconds');
}

try {
  await waitForServer();
  const failures = [];
  for (const [method, path, body, expected] of checks) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
    if (expected !== null && response.status !== expected) {
      failures.push(`${method} ${path}: expected ${expected}, received ${response.status}`);
    }
    if (expected === null && (response.status < 400 || response.headers.has('set-cookie'))) {
      failures.push(`${method} ${path}: preview auth must fail closed; status=${response.status}, set-cookie=${response.headers.has('set-cookie')}`);
    }
  }
  if (failures.length) {
    console.error('Unauthenticated API security smoke tests failed:\\n' + failures.join('\\n'));
    process.exitCode = 1;
  } else {
    console.log(`Passed ${checks.length} production-mode unauthenticated API security checks.`);
  }
} finally {
  server.kill('SIGTERM');
}
