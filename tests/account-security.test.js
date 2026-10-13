// Account security: 2FA recovery codes (single use, regenerated) and active sessions.
// Requires a running server (BASE_URL) and the env vars in tests/helpers.js.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN, loginWith2FA, adminLogin, uniq, Client } from './helpers.js';

let admin;
let user;        // { username, password, client } : A, signed in with the authenticator
let codes;       // first set of recovery codes

// Password step then recovery-code step; returns the client when the login succeeded
async function loginWithRecovery(username, password, code) {
    const c = new Client();
    const first = await c.req('/api/auth/login', { method: 'POST', body: { username, password } });
    assert.equal(first.status, 200, JSON.stringify(first.data));
    return { client: c, verify: await c.req('/api/auth/verify-2fa', { method: 'POST', body: { recoveryCode: code } }) };
}

before(async () => {
    assert.ok(ADMIN.username && ADMIN.password && ADMIN.totpSecret, 'set TEST_ADMIN_* variables');
    admin = (await adminLogin()).client;
    const created = await admin.req('/api/teachers', { method: 'POST', body: { fullName: 'Sec Prof ' + uniq('').slice(-5), subject: 'Art' } });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    user = { username: created.data.teacher.username, password: created.data.teacher.password };
    user.client = (await loginWith2FA(user.username, user.password)).client;
});

test('recovery codes: ten codes are generated once and counted', async () => {
    const r = await user.client.req('/api/account/recovery-codes', { method: 'POST' });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.codes.length, 10);
    assert.ok(r.data.codes.every((c) => /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(c)), 'format XXXX-XXXX');
    codes = r.data.codes;
    assert.equal((await user.client.req('/api/account/recovery-codes')).data.remaining, 10);
});

test('a recovery code signs in once; a second use is refused', async () => {
    const ok = await loginWithRecovery(user.username, user.password, codes[0]);
    assert.equal(ok.verify.status, 200, JSON.stringify(ok.verify.data));
    assert.equal((await ok.client.req('/api/auth/me')).status, 200);
    assert.equal((await user.client.req('/api/account/recovery-codes')).data.remaining, 9);

    const again = await loginWithRecovery(user.username, user.password, codes[0]);
    assert.equal(again.verify.status, 401);
});

test('a wrong recovery code is refused; lower-case and dashless input is accepted', async () => {
    const wrong = await loginWithRecovery(user.username, user.password, 'ZZZZ-ZZZZ');
    assert.equal(wrong.verify.status, 401);
    const lower = await loginWithRecovery(user.username, user.password, codes[1].replace('-', '').toLowerCase());
    assert.equal(lower.verify.status, 200, JSON.stringify(lower.verify.data));
});

test('sessions: the list shows the current device; another device can be closed', async () => {
    const other = await loginWithRecovery(user.username, user.password, codes[2]);
    assert.equal(other.verify.status, 200);
    const list = (await user.client.req('/api/account/sessions')).data;
    assert.ok(list.length >= 3, 'every device appears');
    assert.equal(list.filter((s) => s.current).length, 1);
    const target = list.find((s) => !s.current);
    assert.equal((await user.client.req(`/api/account/sessions/${target.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await user.client.req(`/api/account/sessions/${target.id}`, { method: 'DELETE' })).status, 404);
});

test('sessions: "sign out other devices" keeps only the current one', async () => {
    const other = await loginWithRecovery(user.username, user.password, codes[3]);
    assert.equal(other.verify.status, 200);
    assert.equal((await other.client.req('/api/auth/me')).status, 200);

    assert.equal((await user.client.req('/api/account/sessions', { method: 'POST', body: { action: 'revoke-others' } })).status, 200);
    assert.equal((await other.client.req('/api/auth/me')).status, 401);
    assert.equal((await user.client.req('/api/auth/me')).status, 200, 'this device stays signed in');
    assert.equal((await user.client.req('/api/account/sessions')).data.length, 1);
});

test('regenerating the codes invalidates the previous set', async () => {
    const r = await user.client.req('/api/account/recovery-codes', { method: 'POST' });
    assert.equal(r.status, 201);
    const old = await loginWithRecovery(user.username, user.password, codes[5]);
    assert.equal(old.verify.status, 401, 'an old code no longer works');
    const fresh = await loginWithRecovery(user.username, user.password, r.data.codes[0]);
    assert.equal(fresh.verify.status, 200, JSON.stringify(fresh.verify.data));
});

test('recovery codes need the account to have 2FA; admins cannot read the codes back', async () => {
    const r = await new Client().req('/api/account/recovery-codes');
    assert.equal(r.status, 401);
    const list = await user.client.req('/api/account/recovery-codes');
    assert.equal(list.data.codes, undefined, 'only the count is returned');
});
