// Operator codes: 18-character secrets that gate the admin command-line tools.
//   ADMIN_CREATE_CODE_HASH  -> needed by `npm run admin:create`
//   ADMIN_MANAGE_CODE_HASH  -> needed by `npm run admin:reset-password` and `admin:reset-2fa`
// Only argon2 hashes are stored in .env.local; the plain codes are shown once, at generation.
import crypto from 'crypto';
import { verifyPassword } from './password.js';

export const CODE_LENGTH = 18;
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGIT = '23456789';
const SPECIAL = '!@#%&*-_=+?';
const ALL = LOWER + UPPER + DIGIT + SPECIAL;

const pick = (set) => set[crypto.randomInt(set.length)];

export function generateCode() {
    // One character of each class guaranteed, the rest random, then shuffled
    const chars = [pick(LOWER), pick(UPPER), pick(DIGIT), pick(SPECIAL)];
    while (chars.length < CODE_LENGTH) chars.push(pick(ALL));
    for (let i = chars.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
}

// Returns an error message, or null when the format is right
export function checkCodeFormat(code) {
    if (typeof code !== 'string' || code.length !== CODE_LENGTH) return `The code must be exactly ${CODE_LENGTH} characters`;
    if (!/[a-z]/.test(code)) return 'The code must contain a lowercase letter';
    if (!/[A-Z]/.test(code)) return 'The code must contain an uppercase letter';
    if (!/[0-9]/.test(code)) return 'The code must contain a digit';
    if (!/[^A-Za-z0-9]/.test(code)) return 'The code must contain a special character';
    return null;
}

// Verifies a code against the hash stored under the given environment variable
export async function codeMatches(envName, code) {
    const hash = process.env[envName];
    if (!hash) throw new Error(`${envName} is not set. Run "npm run codes:generate" first.`);
    return verifyPassword(hash, code);
}
