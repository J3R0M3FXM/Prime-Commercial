import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { useRouter } from '../lib/browser-router.ts';

const dom = new JSDOM('', { url: 'https://local.example/' });
globalThis.window = dom.window;
globalThis.PopStateEvent = dom.window.PopStateEvent;
const router = useRouter();
assert.equal(useRouter(), router, 'Render updates must not restart authentication through router identity');
let events = 0;
window.addEventListener('popstate', () => events++);
router.push('/admin');
assert.equal(window.location.pathname, '/admin');
router.replace('/');
assert.equal(window.location.pathname, '/');
assert.equal(events, 2);
dom.window.close();

const source = readFileSync('tgcloud/endpoints/manageCustomers.js', 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export default async function', 'async function handler');
const customerFields = Object.fromEntries(['id','tgUserId','tgName','tgUsername','phoneNumber','primeMemberId','isBanned','storeCredits','createdAt'].map(key => [key, key]));
let authorized = false, selected;
const db = { select(fields) {
  assert.equal(authorized, true, 'Customer access requires verified admin authorization');
  selected = fields;
  return { from(table) {
    assert.equal(table, customerFields, 'POS must never query orders');
    return { orderBy() { return { limit(limit) {
      assert.equal(limit, 500);
      return { all: async () => [{id:'c', storeCredits:50}] };
    } }; } };
  } };
} };
const handler = new Function('db','requireAdmin','customers','desc',source+'\nreturn handler;')(db, async()=>{authorized=true;}, customerFields, value=>value);
assert.deepEqual(await handler({action:'posList'},{}), [{id:'c', storeCredits:50}]);
assert.deepEqual(Object.keys(selected).sort(), ['id','tgUserId','tgName','tgUsername','phoneNumber','primeMemberId','isBanned','storeCredits'].sort());
console.log('PASS: stable startup router, navigation events and bounded admin-only POS customer projection.');
