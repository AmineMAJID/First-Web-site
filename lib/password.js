// Password hashing (argon2id, OWASP parameters) and password policy.
import argon2 from '@node-rs/argon2';
import crypto from 'crypto';

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128; // argon2 cost is per byte, cap it to avoid abuse

const COMMON = new Set([
    'password', 'password1234', 'password123', 'motdepasse', 'motdepasse123', 'azerty123456',
    'admin123456', 'admin1234567', 'qwertyuiop12', '123456789012', 'letmein12345', 'welcome12345',
]);

export const hashPassword = (password) => argon2.hash(password);

export const verifyPassword = (hash, password) => argon2.verify(hash, password).catch(() => false);

// Used to spend the same time on unknown usernames (prevents user enumeration by timing)
let dummy;
export async function burnPasswordTime(password) {
    if (!dummy) dummy = argon2.hash(crypto.randomBytes(16).toString('hex'));
    await argon2.verify(await dummy, password).catch(() => false);
}

// Returns an error message, or null when the password is acceptable
export function checkPasswordPolicy(password, username = '') {
    if (typeof password !== 'string') return 'Password is required';
    if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    if (password.length > MAX_PASSWORD_LENGTH) return `Password must be at most ${MAX_PASSWORD_LENGTH} characters`;
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
        return 'Password must contain an uppercase letter, a lowercase letter and a digit';
    }
    if (username && password.toLowerCase().includes(username.toLowerCase()) && username.length >= 3) {
        return 'Password must not contain the username';
    }
    if (COMMON.has(password.toLowerCase())) return 'Password is too common';
    if (/^(.)\1+$/.test(password)) return 'Password must not be a single repeated character';
    return null;
}

// Readable random password for accounts created by an admin (must be changed at first login)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
export function generateTempPassword(length = 16) {
    let out = '';
    while (out.length < length) {
        const b = crypto.randomInt(ALPHABET.length);
        out += ALPHABET[b];
    }
    // Guarantee the policy: one of each class, then shuffle
    const pick = (re) => ALPHABET.split('').find((c) => re.test(c));
    const chars = out.slice(0, length - 3).split('');
    chars.push(pick(/[A-Z]/), pick(/[a-z]/), pick(/[0-9]/));
    for (let i = chars.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
}
