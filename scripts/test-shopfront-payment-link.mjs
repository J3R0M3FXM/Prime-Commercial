import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync('app/components/secured-payment-link.tsx', 'utf8');
const parsed = ts.createSourceFile('payment.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = parsed.statements.filter(node => ts.isFunctionDeclaration(node) && ['validatedPaymentLink', 'openSecuredPaymentLink'].includes(node.name?.text)).map(node => node.getText(parsed)).join('\n');
const javascript = ts.transpileModule(functions.replaceAll('export function', 'function'), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const opened = [];
const window = { open: (...args) => opened.push(args), Telegram: { WebApp: { initData: 'verified', openLink: (...args) => opened.push(args) } } };
const { validatedPaymentLink, openSecuredPaymentLink } = new Function('window', `${javascript}\nreturn { validatedPaymentLink, openSecuredPaymentLink };`)(window);
for (const unsafe of ['http://example.com', 'javascript:alert(1)', 'https://user:pass@example.com', '']) {
  assert.equal(validatedPaymentLink(unsafe), '');
  assert.equal(openSecuredPaymentLink(unsafe), false);
}
assert.equal(openSecuredPaymentLink('https://example.com/pay'), true);
assert.equal(opened[0][0], 'https://example.com/pay');
assert.deepEqual(opened[0][1], { try_instant_view: false });
window.Telegram.WebApp.initData = '';
assert.equal(openSecuredPaymentLink('https://example.com/pay'), true);
assert.deepEqual(opened[1], ['https://example.com/pay', '_blank', 'noopener,noreferrer']);
console.log('PASS: HTTPS gateway links, native Telegram and safe new-tab fallback');
