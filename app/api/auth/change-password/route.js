// POST /api/auth/change-password  { currentPassword, newPassword }
// On success every other session of the account is revoked (the current one stays logged in).
import { db } from '@/lib/db';
import { hashPassword, verifyPassword, checkPasswordPolicy } from '@/lib/password';
import { json, error, readJson, requireAuth } from '@/lib/api';
import { revokeUserSessions } from '@/lib/session';
import { recordEvent, clientIp, userAgent } from '@/lib/security';

export async function POST(request) {
    const { session, response } = requireAuth(request);
    if (response) return response;

    const body = await readJson(request);
    const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
    if (!currentPassword || !newPassword) return error('Both passwords are required');

    const user = await db.get('SELECT id, username, password_hash FROM users WHERE id = ?', [session.id]);
    if (!user) return error('User not found', 404);
    if (!(await verifyPassword(user.password_hash, currentPassword))) return error('Current password is incorrect', 401);

    const policyError = checkPasswordPolicy(newPassword, user.username);
    if (policyError) return error(policyError);
    if (await verifyPassword(user.password_hash, newPassword)) return error('New password must be different from the current one');

    await db.run(
        'UPDATE users SET password_hash = ?, must_change_password = FALSE, password_changed_at = now(), updated_at = now() WHERE id = ?',
        [await hashPassword(newPassword), session.id],
    );
    await revokeUserSessions(session.id, session.sessionId);
    await recordEvent('password_changed', { username: user.username, userId: user.id, ip: clientIp(request), ua: userAgent(request) });
    return json({ success: true });
}
