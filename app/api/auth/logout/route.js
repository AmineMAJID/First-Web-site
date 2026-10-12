// POST /api/auth/logout – revokes the server-side session and clears both cookies
import { json } from '@/lib/api';
import { COOKIE_NAME, MFA_COOKIE, cookieOptions } from '@/lib/auth';
import { deleteSessionByToken } from '@/lib/session';
import { recordEvent, clientIp, userAgent } from '@/lib/security';

export async function POST(request) {
    const token = request.cookies.get(COOKIE_NAME)?.value;
    const mfa = request.cookies.get(MFA_COOKIE)?.value;
    await deleteSessionByToken(token);
    await deleteSessionByToken(mfa);
    if (token) await recordEvent('logout', { ip: clientIp(request), ua: userAgent(request) });

    const response = json({ success: true });
    response.cookies.set(COOKIE_NAME, '', cookieOptions(request, 0));
    response.cookies.set(MFA_COOKIE, '', cookieOptions(request, 0));
    return response;
}
