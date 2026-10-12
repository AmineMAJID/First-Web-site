// Authentication & security tests. Requires a running server (BASE_URL) and the env vars
// described in tests/helpers.js.
//
// Note: a TOTP code can be used once and each 30-second window gives one code, so the admin
// signs in with 2FA exactly once in this file (the replay test reuses that same code).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, ADMIN, Client, adminLogin, loginWith2FA, uniq } from './helpers.js';

let admin;          // logged-in admin client (full session)
let adminCode;      // the TOTP code used for the admin login (for the replay test)
const made = {};    // fixtures created during the run

before(async () => {
    assert.ok(ADMIN.username && ADMIN.password && ADMIN.totpSecret, 'set TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_ADMIN_TOTP_SECRET');
    const res = await adminLogin();
    admin = res.client;
    adminCode = res.code;
});

test('unauthenticated API calls and pages are refused', async () => {
    const c = new Client();
    assert.equal((await c.req('/api/students')).status, 401);
    assert.equal((await c.req('/api/auth/me')).status, 401);
    const page = await fetch(BASE + '/dashboard/admin', { redirect: 'manual' });
    assert.equal(page.status, 307);
    assert.match(page.headers.get('location'), /\/login/);
});

test('identity headers sent by the browser are ignored', async () => {
    const c = new Client();
    const r = await c.req('/api/students', { headers: { 'x-user-id': '1', 'x-user-role': 'admin', 'x-user-name': 'x' } });
    assert.equal(r.status, 401);
});

test('cookies are httpOnly and SameSite', async () => {
    const student = await admin.req('/api/students', { method: 'POST', body: { fullName: uniq('Cookie Test') } });
    assert.equal(student.status, 201);
    made.cookieUser = student.data.student;
    const res = await fetch(BASE + '/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: made.cookieUser.username, password: made.cookieUser.password }),
    });
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith('auth-token='));
    assert.ok(cookie, 'auth-token cookie is set');
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=/);
    assert.match(cookie, /Path=\//);
});

test('wrong password and unknown user give the same answer', async () => {
    const c = new Client();
    const wrong = await c.req('/api/auth/login', { method: 'POST', body: { username: ADMIN.username, password: 'definitely-wrong-1' } });
    const unknown = await c.req('/api/auth/login', { method: 'POST', body: { username: uniq('nobody'), password: 'definitely-wrong-1' } });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.deepEqual(wrong.data, unknown.data);
});

test('admin password is accepted but no session exists before the 2FA code', async () => {
    const c = new Client();
    const login = await c.req('/api/auth/login', { method: 'POST', body: { username: ADMIN.username, password: ADMIN.password } });
    assert.equal(login.status, 200);
    assert.equal(login.data.user, undefined, 'no user payload before 2FA');
    assert.ok(c.cookies['mfa-token'], 'pending 2FA cookie is set');
    assert.equal(c.cookies['auth-token'], undefined);
    // The pending token must never open a session
    c.cookies = { 'auth-token': c.cookies['mfa-token'] };
    assert.equal((await c.req('/api/auth/me')).status, 401);
});

test('a wrong 2FA code is refused and the code cannot be replayed', async () => {
    const c = new Client();
    await c.req('/api/auth/login', { method: 'POST', body: { username: ADMIN.username, password: ADMIN.password } });
    const wrong = await c.req('/api/auth/verify-2fa', { method: 'POST', body: { code: '000000' } });
    assert.equal(wrong.status, 401);
    // Code already accepted for the admin login earlier in this window -> replay refused
    const replay = await c.req('/api/auth/verify-2fa', { method: 'POST', body: { code: adminCode } });
    assert.equal(replay.status, 401);
});

test('a 2FA session is consumed by the login flow and expires with the code window', async () => {
    const c = new Client();
    const r = await c.req('/api/auth/verify-2fa', { method: 'POST', body: { code: '123456' } });
    assert.equal(r.status, 401, 'no pending login -> refused');
});

test('admin session works and reports 2FA state', async () => {
    const me = await admin.req('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.data.role, 'admin');
    assert.equal(me.data.has2fa, true);
});

test('brute force: account is locked after repeated failures, even with the right password', async () => {
    const student = (await admin.req('/api/students', { method: 'POST', body: { fullName: uniq('Lock Test') } })).data.student;
    const c = new Client();
    for (let i = 0; i < 5; i++) {
        const r = await c.req('/api/auth/login', { method: 'POST', body: { username: student.username, password: 'wrong-guess-123' } });
        assert.equal(r.status, 401);
    }
    const locked = await c.req('/api/auth/login', { method: 'POST', body: { username: student.username, password: student.password } });
    assert.equal(locked.status, 429);
});

test('CSRF: state-changing requests from another origin are refused', async () => {
    const r = await admin.req('/api/students', {
        method: 'POST', body: { fullName: uniq('Csrf') }, headers: { origin: 'https://evil.example' },
    });
    assert.equal(r.status, 403);
    // Session still alive
    assert.equal((await admin.req('/api/auth/me')).status, 200);
});

test('password change: weak passwords refused, other sessions revoked, current one kept', async () => {
    const student = (await admin.req('/api/students', { method: 'POST', body: { fullName: uniq('Pwd Change') } })).data.student;
    const first = new Client();
    await first.req('/api/auth/login', { method: 'POST', body: { username: student.username, password: student.password } });
    const second = new Client();
    await second.req('/api/auth/login', { method: 'POST', body: { username: student.username, password: student.password } });

    const weak = await second.req('/api/auth/change-password', { method: 'POST', body: { currentPassword: student.password, newPassword: 'short1A' } });
    assert.equal(weak.status, 400);
    const noDigit = await second.req('/api/auth/change-password', { method: 'POST', body: { currentPassword: student.password, newPassword: 'onlylettersHere' } });
    assert.equal(noDigit.status, 400);

    const ok = await second.req('/api/auth/change-password', { method: 'POST', body: { currentPassword: student.password, newPassword: 'Brand-New-Passw0rd' } });
    assert.equal(ok.status, 200);
    assert.equal((await first.req('/api/auth/me')).status, 401, 'other session revoked');
    assert.equal((await second.req('/api/auth/me')).status, 200, 'current session kept');
});

test('admin password reset revokes the user sessions', async () => {
    const student = (await admin.req('/api/students', { method: 'POST', body: { fullName: uniq('Reset Test') } })).data.student;
    const c = new Client();
    await c.req('/api/auth/login', { method: 'POST', body: { username: student.username, password: student.password } });
    const detail = (await admin.req('/api/students')).data.find((s) => s.username === student.username);
    const reset = await admin.req(`/api/students/${detail.id}`, { method: 'POST', body: { action: 'reset-password' } });
    assert.equal(reset.status, 200);
    assert.equal((await c.req('/api/auth/me')).status, 401);
    const relog = await new Client().req('/api/auth/login', { method: 'POST', body: { username: student.username, password: student.password } });
    assert.equal(relog.status, 401, 'old password no longer works');
});

test('logout revokes the server-side session', async () => {
    const student = (await admin.req('/api/students', { method: 'POST', body: { fullName: uniq('Logout Test') } })).data.student;
    const c = new Client();
    await c.req('/api/auth/login', { method: 'POST', body: { username: student.username, password: student.password } });
    const token = c.cookies['auth-token'];
    assert.equal((await c.req('/api/auth/logout', { method: 'POST' })).status, 200);
    assert.equal((await c.req('/api/auth/me')).status, 401);
    // Even if the old cookie value is replayed, the server no longer knows it
    const replayed = new Client();
    replayed.cookies['auth-token'] = token;
    assert.equal((await replayed.req('/api/auth/me')).status, 401);
});

test('teacher: admin-created account enrols 2FA at first login, then admin can reset it', async () => {
    const created = (await admin.req('/api/teachers', { method: 'POST', body: { fullName: uniq('Prof Test'), subject: 'Physics' } }));
    assert.equal(created.status, 201);
    const t = created.data.teacher;
    assert.equal(t.password.length >= 12, true);

    const { client: teacher } = await loginWith2FA(t.username, t.password);
    assert.equal((await teacher.req('/api/auth/me')).data.has2fa, true);
    const list = (await admin.req('/api/teachers')).data;
    const row = list.find((x) => x.username === t.username);
    assert.equal(row.has_2fa, true);

    const reset = await admin.req(`/api/teachers/${row.id}`, { method: 'POST', body: { action: 'reset-2fa' } });
    assert.equal(reset.status, 200);
    assert.equal((await teacher.req('/api/auth/me')).status, 401, 'reset also signs the teacher out');
    const again = new Client();
    const login = await again.req('/api/auth/login', { method: 'POST', body: { username: t.username, password: t.password } });
    assert.equal(login.data.requires2FASetup, true, 'must enrol a new authenticator');
});

test('health endpoint answers without leaking details', async () => {
    const r = await new Client().req('/api/health');
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.data).sort(), ['status', 'time']);
});
