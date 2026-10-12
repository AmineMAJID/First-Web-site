// Symmetric encryption for secrets stored in the database (TOTP secrets) and
// hashing helpers for opaque session tokens.
//
// APP_ENCRYPTION_KEY must be 32 random bytes, base64 encoded:
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
import crypto from 'crypto';

function encryptionKey() {
    const raw = process.env.APP_ENCRYPTION_KEY;
    if (!raw) throw new Error('APP_ENCRYPTION_KEY is not set (see .env.example)');
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) throw new Error('APP_ENCRYPTION_KEY must decode to exactly 32 bytes');
    return key;
}

// Output format: v1.<iv>.<authTag>.<ciphertext>  (AES-256-GCM, fresh 96-bit IV each time)
export function encryptSecret(plain) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join('.');
}

export function decryptSecret(value) {
    const [version, iv, tag, data] = String(value).split('.');
    if (version !== 'v1' || !iv || !tag || !data) throw new Error('Unsupported encrypted value');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

// Session tokens: 256 random bits in the cookie, only their SHA-256 hash is stored.
export const newToken = () => crypto.randomBytes(32).toString('base64url');
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
