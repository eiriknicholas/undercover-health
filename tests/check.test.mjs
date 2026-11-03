import { test } from 'node:test';
import assert from 'node:assert/strict';
import { probe, publicStatus, publishStatus } from '../scripts/check.mjs';

const url = 'https://qftmsqgerppchwyyszkg.supabase.co';
const key = 'synthetic-test-value';
const repository = 'eiriknicholas/undercover-health';
test('probe rejects a different origin before transmitting a credential', async () => {
  let called = false;
  assert.equal((await probe({ url: 'https://example.com', key, fetcher: async () => { called = true; } })).code, 'CONFIG_INVALID');
  assert.equal(called, false);
});
test('probe makes only the constant read-only RPC and accepts exactly true', async () => {
  const result = await probe({ url, key, fetcher: async (target, options) => {
    assert.equal(target, `${url}/rest/v1/rpc/uc_pilot_health`);
    assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error');
    assert.equal(options.headers.apikey, key); assert.equal(options.body, '{}');
    return new Response('true', { status: 200 });
  } });
  assert.deepEqual(result, { ok: true, code: 'OK', attempts: 1, http_status: 200 });
  const wrong = await probe({ url, key, fetcher: async () => new Response('{"ok":true}') });
  assert.equal(wrong.code, 'UNEXPECTED_RESPONSE');
});
test('temporary outages retry at most three times and never expose error payloads', async () => {
  let attempts = 0;
  const result = await probe({ url, key, wait: async () => {}, fetcher: async () => { attempts++; throw new Error(`private payload ${key}`); } });
  assert.equal(attempts, 3); assert.equal(result.ok, false);
  assert.ok(!JSON.stringify(result).includes(key));
});
test('access failures do not loop and status output is explicitly whitelisted', async () => {
  let calls = 0;
  const result = await probe({ url, key, fetcher: async () => { calls++; return new Response(`private ${key}`, { status: 403 }); } });
  assert.equal(calls, 1); assert.equal(result.code, 'ACCESS_DENIED');
  const status = publicStatus({ ...result, headers: { key }, token: key }, new Date('2026-11-03T10:00:00Z'));
  assert.deepEqual(Object.keys(status).sort(), ['attempts', 'checked_at', 'code', 'healthy', 'http_status', 'service']);
  assert.ok(!JSON.stringify(status).includes(key));
});
test('status publication is restricted to the monitor repository and safe fields', async () => {
  let called = false;
  assert.equal(await publishStatus({}, { token: key, repository: 'someone/else', fetcher: async () => { called = true; } }), false);
  assert.equal(called, false);
  const status = publicStatus({ ok: true, code: 'OK', attempts: 1 });
  const requests = [];
  const ok = await publishStatus(status, { token: key, repository, fetcher: async (target, options) => {
    requests.push({ target, options });
    return requests.length === 1 ? new Response('{"sha":"' + 'a'.repeat(40) + '"}') : new Response('{}', { status: 200 });
  } });
  assert.equal(ok, true); assert.equal(requests.length, 2);
  const payload = JSON.parse(requests[1].options.body);
  assert.deepEqual(JSON.parse(Buffer.from(payload.content, 'base64').toString()), status);
  assert.ok(!requests[1].options.body.includes(key));
});
