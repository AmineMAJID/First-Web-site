// POST /api/auth/login  { username, password }
// - roles without 2FA (roles.requires_2fa = false): session cookie is set immediately
// - other roles: a 5-minute "mfa" session cookie is set, then POST /api/auth/verify-2fa
import { db } from '@/lib/db';
import { verifyPassword, burnPasswordTime } from '@/lib/password';
import { publicUser, cookieOptions, COOKIE_NAME, MFA_COOKIE, SESSION_HOURS, MFA_MINUTES } from '@/lib/auth';
import { createSession, loadPermissions } from '@/lib/session';
import { landingFor } from '@/lib/permissions';
import { recordEvent, isLoginBlocked, clientIp, userAgent } from '@/lib/security';
import { json, error, readJson } from '@/lib/api';

export async function POST(request) {
    try {
        const body = await readJson(request);
        const username = String(body?.username || '').trim().toLowerCase().slice(0, 64);
        const password = typeof body?.password === 'string' ? body.password.slice(0, 256) : '';
        if (!username || !password) return error('Username and password required');

        const ip = clientIp(request);
        const ua = userAgent(request);

        if (await isLoginBlocked(username, ip)) {
            await recordEvent('login_locked', { username, ip, ua });
            return error('Too many failed attempts. Please try again in 15 minutes.', 429);
        }

        const user = await db.get(
            'SELECT u.*, r.requires_2fa FROM users u JOIN roles r ON r.key = u.role WHERE u.username = ?',
            [username],
        );
        // Always run one argon2 verification, so response time does not reveal whether the user exists
        let valid = false;
        if (user) valid = await verifyPassword(user.password_hash, password);
        else await burnPasswordTime(password);

        if (!user || !valid) {
            await recordEvent('login_failed', { username, userId: user?.id ?? null, ip, ua });
            // Same message for unknown user and wrong password
            return error('Invalid credentials', 401);
        }

        if (user.requires_2fa) {
            const token = await createSession({ userId: user.id, kind: 'mfa', ip, ua });
            const response = json({
                success: true,
                requires2FA: !!user.two_factor_secret,
                requires2FASetup: !user.two_factor_secret,
            });
            response.cookies.set(MFA_COOKIE, token, cookieOptions(request, MFA_MINUTES * 60));
            await recordEvent('password_ok', { username, userId: user.id, ip, ua });
            return response;
        }

        const token = await createSession({ userId: user.id, kind: 'full', ip, ua });
        await db.run('UPDATE users SET last_login_at = now() WHERE id = ?', [user.id]);
        await recordEvent('login_ok', { username, userId: user.id, ip, ua });
        const permissions = await loadPermissions(user.role);
        const response = json({ success: true, user: publicUser({ ...user, permissions }), landing: landingFor(permissions) });
        response.cookies.set(COOKIE_NAME, token, cookieOptions(request, SESSION_HOURS * 3600));
        return response;
    } catch (e) {
        console.error('Login error:', e);
        return error('Internal server error', 500);
    }
}
