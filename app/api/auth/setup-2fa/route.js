// GET /api/auth/setup-2fa – start first-time 2FA enrolment for the pending (mfa) login.
// The secret is generated on the server and kept encrypted in the pending session; asking
// again returns the same secret, so refreshing the page does not break the enrolment.
import QRCode from 'qrcode';
import { db } from '@/lib/db';
import { encryptSecret, decryptSecret } from '@/lib/crypto';
import { generateSecret, otpauthUri } from '@/lib/totp';
import { MFA_COOKIE, cookieOptions } from '@/lib/auth';
import { resolveSession } from '@/lib/session';
import { json, error } from '@/lib/api';

const ISSUER = 'Student Portal';

export async function GET(request) {
    try {
        const pending = await resolveSession(request.cookies.get(MFA_COOKIE)?.value, 'mfa');
        if (!pending) {
            const res = error('Your login session has expired. Please sign in again.', 401);
            res.cookies.set(MFA_COOKIE, '', cookieOptions(request, 0));
            return res;
        }
        const { user } = pending;
        if (user.two_factor_secret) return error('2FA is already configured', 400);

        let secret = pending.pendingSecret ? decryptSecret(pending.pendingSecret) : null;
        if (!secret) {
            secret = generateSecret();
            await db.run('UPDATE sessions SET pending_secret = ? WHERE id = ?', [encryptSecret(secret), pending.sessionId]);
        }

        const qrCodeUrl = await QRCode.toDataURL(otpauthUri(ISSUER, user.username, secret));
        return json({ success: true, secret, qrCodeUrl });
    } catch (e) {
        console.error('Setup 2FA error:', e);
        return error('Internal server error', 500);
    }
}
