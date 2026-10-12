// TOTP (RFC 6238 / RFC 4226) implemented with node:crypto.
// 6 digits, 30-second step, HMAC-SHA1 (the default of Google Authenticator, Authy, ...).
import crypto from 'crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP = 30;
const DIGITS = 6;
const WINDOW = 1; // accept one step before / after to tolerate clock drift

export function base32Encode(buf) {
    let bits = 0;
    let value = 0;
    let out = '';
    for (const byte of buf) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            out += B32[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) out += B32[(value << (5 - bits)) & 31];
    return out;
}

export function base32Decode(str) {
    const clean = str.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
    let bits = 0;
    let value = 0;
    const out = [];
    for (const ch of clean) {
        const idx = B32.indexOf(ch);
        if (idx === -1) throw new Error('Invalid base32 character');
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            out.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    return Buffer.from(out);
}

// 160-bit secret (RFC 4226 recommendation)
export const generateSecret = () => base32Encode(crypto.randomBytes(20));

export function hotp(secretBuf, counter) {
    const msg = Buffer.alloc(8);
    msg.writeBigUInt64BE(BigInt(counter));
    const hmac = crypto.createHmac('sha1', secretBuf).update(msg).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
    return String(code).padStart(DIGITS, '0');
}

export const stepAt = (timeMs = Date.now()) => Math.floor(timeMs / 1000 / STEP);

// Returns the matching time step, or null. Steps <= lastStep are rejected (anti-replay).
export function matchTotp(secret, code, lastStep = null, now = Date.now()) {
    if (!/^\d{6}$/.test(code)) return null;
    const secretBuf = base32Decode(secret);
    const current = stepAt(now);
    let matched = null;
    for (let s = current - WINDOW; s <= current + WINDOW; s++) {
        const expected = hotp(secretBuf, s);
        // constant-time comparison
        if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(code))) matched = s;
    }
    if (matched === null) return null;
    if (lastStep !== null && lastStep !== undefined && matched <= Number(lastStep)) return null;
    return matched;
}

export function otpauthUri(issuer, label, secret) {
    const enc = encodeURIComponent;
    return `otpauth://totp/${enc(issuer)}:${enc(label)}?secret=${secret}&issuer=${enc(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP}`;
}
