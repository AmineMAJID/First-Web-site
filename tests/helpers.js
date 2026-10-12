// Shared helpers for the end-to-end tests. They talk to a running server (BASE_URL).
//
// Required environment for tests (create the first admin with `npm run admin:create`
// and sign in once to enrol 2FA, then provide its credentials):
//   TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_ADMIN_TOTP_SECRET
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { hotp, base32Decode, stepAt } from '../lib/totp.js';

export const BASE = process.env.BASE_URL || 'http://localhost:3000';

export const ADMIN = {
    username: process.env.TEST_ADMIN_USERNAME,
    password: process.env.TEST_ADMIN_PASSWORD,
    totpSecret: process.env.TEST_ADMIN_TOTP_SECRET,
};

// Current 6-digit code for a base32 secret. `offset` lets tests pick past/future steps.
export const totp = (secret, offset = 0) => hotp(base32Decode(secret), stepAt() + offset);

// Minimal cookie-aware HTTP client
export class Client {
    constructor(origin) {
        this.cookies = {};
        this.origin = origin;
    }

    get cookieHeader() {
        return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    }

    async req(path, { method = 'GET', body, headers = {} } = {}) {
        const res = await fetch(BASE + path, {
            method,
            redirect: 'manual',
            headers: { 'content-type': 'application/json', cookie: this.cookieHeader, ...headers },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        for (const sc of res.headers.getSetCookie()) {
            const [pair] = sc.split(';');
            const idx = pair.indexOf('=');
            const name = pair.slice(0, idx);
            const value = pair.slice(idx + 1);
            if (!value) delete this.cookies[name];
            else this.cookies[name] = value;
        }
        let data = null;
        try { data = await res.json(); } catch { /* no JSON body */ }
        return { status: res.status, data, location: res.headers.get('location') };
    }
}

// Full login including 2FA. `secret` is required for accounts already enrolled.
// Returns { client, secret } where secret is the TOTP secret (new or existing).
export async function loginWith2FA(username, password, knownSecret = null) {
    const c = new Client();
    const login = await c.req('/api/auth/login', { method: 'POST', body: { username, password } });
    assert.equal(login.status, 200, JSON.stringify(login.data));
    let secret = knownSecret;
    if (login.data.requires2FASetup) {
        const setup = await c.req('/api/auth/setup-2fa');
        assert.equal(setup.status, 200);
        secret = setup.data.secret;
    }
    assert.ok(secret, 'a TOTP secret is required for accounts with 2FA enrolled');
    const verify = await c.req('/api/auth/verify-2fa', { method: 'POST', body: { code: totp(secret) } });
    assert.equal(verify.status, 200, JSON.stringify(verify.data));
    return { client: c, secret };
}

// The server accepts each TOTP time step once. Test files run one after the other
// (--test-concurrency=1) and share the last used step through a temp file, so the admin
// login waits for the next 30-second window when a previous file already used this one.
const STEP_FILE = path.join(os.tmpdir(), 'student-portal-test-totp-step');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function adminLogin() {
    for (let attempt = 0; attempt < 2; attempt++) {
        const last = fs.existsSync(STEP_FILE) ? Number(fs.readFileSync(STEP_FILE, 'utf8')) : -1;
        while (stepAt() <= last) await sleep(500);
        const step = stepAt();
        fs.writeFileSync(STEP_FILE, String(step));
        const code = hotp(base32Decode(ADMIN.totpSecret), step);
        const c = new Client();
        const login = await c.req('/api/auth/login', { method: 'POST', body: { username: ADMIN.username, password: ADMIN.password } });
        assert.equal(login.status, 200, JSON.stringify(login.data));
        assert.equal(login.data.requires2FA, true);
        const verify = await c.req('/api/auth/verify-2fa', { method: 'POST', body: { code } });
        if (verify.status === 200) return { client: c, code };
        // Code refused: most likely already used by another login in this window. Retry on the next one.
        if (attempt === 1) assert.equal(verify.status, 200, JSON.stringify(verify.data));
        fs.writeFileSync(STEP_FILE, String(step));
        while (stepAt() <= step) await sleep(500);
    }
    throw new Error('unreachable');
}

export const uniq = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Id of a class of the current school year, from its name (the tests create classes by name)
export async function classIdOf(admin, name) {
    const r = await admin.req('/api/classes');
    const found = r.data.classList.find((c) => c.name === name);
    if (!found) throw new Error(`class "${name}" not found`);
    return found.id;
}
