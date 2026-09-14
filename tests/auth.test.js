import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizationURL, pastedToken } from '../extension/auth.js';

test('token entry rejects URLs and malformed input; authorization uses our client', () => {
  assert.equal(pastedToken('  fixture.token.value  '), 'fixture.token.value');
  for (const input of ['', 'https://anilist.co/api/v2/oauth/pin#access_token=fixture', 'Bearer fixture', 'a\nb', 'a'.repeat(16385)]) {
    assert.throws(() => pastedToken(input), /Paste only/);
  }
  const url = new URL(authorizationURL(' 51034 '));
  assert.equal(url.origin, 'https://anilist.co');
  assert.equal(url.searchParams.get('client_id'), '51034');
  assert.equal(url.searchParams.get('response_type'), 'token');
  assert.equal(url.searchParams.has('redirect_uri'), false, 'PIN flow uses the registered redirect');
  assert.equal(authorizationURL('999'), authorizationURL(), 'client ID cannot be changed by users');
});

test('trusted settings authorization validates before saving, preserves credentials on failure, and cancels stale login', async () => {
  let listener, fetchMode = 'valid', release;
  const saved = { token: 'old-token', clientId: '51034', user: { id: 1, name: 'old' } };
  const noop = { addListener() {} };
  globalThis.chrome = {
    storage: { local: {
      async setAccessLevel(v) { assert.equal(v.accessLevel, 'TRUSTED_CONTEXTS'); },
      async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(k => [k, saved[k]])); },
      async set(v) { Object.assign(saved, v); },
      async remove(keys) { keys.forEach(k => delete saved[k]); }
    } },
    runtime: { id: 'extension', getURL: p => `chrome-extension://extension/${p}`, onConnect: noop, onMessage: { addListener(fn) { listener = fn; } } },
    action: { onClicked: noop }, alarms: { create() {}, onAlarm: noop }
  };
  let fetches = 0;
  globalThis.fetch = async (url, init) => {
    fetches++;
    assert.equal(url, 'https://graphql.anilist.co');
    assert.equal(init.headers.Authorization, 'Bearer new-token');
    assert.match(JSON.parse(init.body).query, /Viewer/);
    if (fetchMode === 'expired') return { status: 401 };
    if (fetchMode === 'offline') throw new Error('Failed to fetch');
    if (fetchMode === 'pending') await new Promise(resolve => { release = resolve; });
    return { status: 200, ok: true, json: async () => ({ data: { Viewer: fetchMode === 'invalid-user' ? null : { id: 2, name: 'new' } } }) };
  };
  await import('../extension/background.js');
  const sender = { id: 'extension', url: 'chrome-extension://extension/options.html' };
  const send = (type, extra = {}) => new Promise(resolve => listener({ type, clientId: '51034', ...extra }, sender, resolve));
  let answered = false;
  assert.equal(listener({ type: 'token', token: 'new-token' }, { id: 'extension', url: 'https://anilist.co/' }, () => { answered = true; }), undefined);
  assert.equal(answered, false); assert.equal(fetches, 0);
  assert.match((await send('authorize')).error, /Unknown settings request/);
  for (fetchMode of ['expired', 'offline', 'invalid-user']) {
    assert.ok((await send('token', { token: 'new-token' })).error);
    assert.equal(saved.token, 'old-token'); assert.equal(saved.user.id, 1);
  }
  fetchMode = 'valid';
  assert.equal((await send('token', { token: '  new-token  ' })).data.user.id, 2);
  assert.equal(saved.token, 'new-token'); assert.equal(saved.user.name, 'new');
  fetchMode = 'pending';
  const pending = send('token', { token: 'new-token' });
  while (!release) await new Promise(resolve => setImmediate(resolve));
  await send('disconnect'); release();
  assert.match((await pending).error, /cancelled/);
  assert.equal(saved.token, undefined); assert.equal(saved.user, undefined);
});
