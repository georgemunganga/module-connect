import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isRfqCookieDatabase } from './rfq-cookie-database.mjs';

test('accepts the new bounded RFQ normal-cookie cohort only', () => {
  assert.equal(isRfqCookieDatabase('proc_p30_http_rfq_20261024_cookie01'), true);
  for (const value of ['proc_p30_http_po_20261024_cookie01', 'erp', '', null,
    'proc_p30_http_rfq_', 'proc_p30_http_rfq_20261024_cookie01 ',
    'proc_p30_http_rfq_20261024_cookie01;drop', 'proc_p30_http_rfq_' + 'a'.repeat(41)])
    assert.equal(isRfqCookieDatabase(value), false);
});

test('the actual proxy uses RFQ admission and retains exact expected database binding', () => {
  const source = readFileSync(new URL('./p30-rfq-cookie-browser-proxy.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes('isRfqCookieDatabase(fixture.database)'));
  assert.ok(source.includes('fixture.database === process.env.P30_RFQ_COOKIE_EXPECTED_DATABASE'));
  assert.equal(source.includes('proc_p30_http_po_'), false);
});
