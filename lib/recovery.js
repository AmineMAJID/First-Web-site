// 2FA recovery codes: 10 single-use codes per account, shown once, stored hashed.
import crypto from 'crypto';
import { db } from './db.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O/1/I/L: easy to read and copy
const COUNT = 10;

const hash = (normalized) => crypto.createHash('sha256').update(normalized).digest('hex');

// "ab12-cd34" -> "AB12CD34"; anything else is not a recovery code
export function normalizeRecoveryCode(input) {
    const s = String(input || '').toUpperCase().replace(/[\s-]/g, '');
    return /^[A-Z0-9]{8}$/.test(s) ? s : null;
}

const format = (s) => `${s.slice(0, 4)}-${s.slice(4)}`;

function randomCode() {
    let out = '';
    while (out.length < 8) {
        const b = crypto.randomBytes(1)[0];
        if (b < 256 - (256 % ALPHABET.length)) out += ALPHABET[b % ALPHABET.length];
    }
    return out;
}

// Replaces every previous code of the account. Returns the plain codes (to show once).
export async function generateRecoveryCodes(q, userId) {
    await q.run('DELETE FROM recovery_codes WHERE user_id = ?', [userId]);
    const codes = [];
    while (codes.length < COUNT) {
        const c = randomCode();
        if (!codes.includes(c)) codes.push(c);
    }
    for (const c of codes) {
        await q.run('INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)', [userId, hash(c)]);
    }
    return codes.map(format);
}

// Uses one code. Returns true only when it was valid and unused (the update is atomic).
export async function consumeRecoveryCode(userId, input) {
    const normalized = normalizeRecoveryCode(input);
    if (!normalized) return false;
    const r = await db.run('UPDATE recovery_codes SET used_at = now() WHERE user_id = ? AND code_hash = ? AND used_at IS NULL',
        [userId, hash(normalized)]);
    return r.rowCount === 1;
}

export async function remainingRecoveryCodes(userId) {
    const row = await db.get('SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id = ? AND used_at IS NULL', [userId]);
    return row.n;
}
