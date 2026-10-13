// Own 2FA recovery codes – GET (how many are left), POST (generate a new set: replaces the old one)
import { db, tx } from '@/lib/db';
import { json, error, requireAuth } from '@/lib/api';
import { generateRecoveryCodes, remainingRecoveryCodes } from '@/lib/recovery';
import { recordEvent, clientIp, userAgent } from '@/lib/security';

export async function GET(request) {
    const { session, response } = requireAuth(request);
    if (response) return response;
    return json({ remaining: await remainingRecoveryCodes(session.id) });
}

export async function POST(request) {
    const { session, response } = requireAuth(request);
    if (response) return response;
    const user = await db.get('SELECT username, two_factor_secret FROM users WHERE id = ?', [session.id]);
    if (!user?.two_factor_secret) return error('Enable two-factor authentication first', 409);
    const codes = await tx((t) => generateRecoveryCodes(t, session.id));
    await recordEvent('recovery_codes_generated', { username: user.username, userId: session.id, ip: clientIp(request), ua: userAgent(request) });
    return json({ codes, remaining: codes.length }, 201);
}
