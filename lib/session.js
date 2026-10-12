// Server-side sessions. The browser only holds a random token; the database stores its hash,
// so a leaked database dump does not give usable session cookies, and sessions can be revoked.
import { db } from './db.js';
import { newToken, hashToken } from './crypto.js';
import { SESSION_HOURS, SESSION_IDLE_MINUTES, MFA_MINUTES } from './auth.js';
import { permissionsFor } from './permissions.js';

// Creates a session row and returns the raw token (to be put in a cookie, never stored).
export async function createSession({ userId, kind, ip = null, ua = null, pendingSecret = null }) {
    const token = newToken();
    const lifetime = kind === 'mfa' ? `${MFA_MINUTES} minutes` : `${SESSION_HOURS} hours`;
    await db.run(
        `INSERT INTO sessions (token_hash, user_id, kind, pending_secret, ip, user_agent, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, now() + interval '${lifetime}')`,
        [hashToken(token), userId, kind, pendingSecret, ip, ua],
    );
    return token;
}

// Permissions are read from the database on every request, so a change made by the
// administrator applies immediately (pages and API alike).
export async function loadPermissions(roleKey) {
    const row = await db.get(
        'SELECT COALESCE(array_agg(permission_key), ARRAY[]::text[]) AS granted FROM role_permissions WHERE role_key = ?',
        [roleKey],
    );
    return permissionsFor(roleKey, row?.granted || []);
}

// Returns { sessionId, user, pendingSecret } when the token is valid, otherwise null.
// user.permissions is the list of feature keys the account may use right now.
export async function resolveSession(token, kind = 'full') {
    if (!token || typeof token !== 'string' || token.length > 200) return null;
    const row = await db.get(
        `SELECT s.id AS session_id, s.pending_secret, u.*,
                (SELECT COALESCE(array_agg(rp.permission_key), ARRAY[]::text[])
                   FROM role_permissions rp WHERE rp.role_key = u.role) AS granted
           FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = ? AND s.kind = ? AND s.expires_at > now()
            AND s.last_seen_at > now() - interval '${SESSION_IDLE_MINUTES} minutes'`,
        [hashToken(token), kind],
    );
    if (!row) return null;
    // Refresh the idle timer at most once every 5 minutes
    await db.run(
        `UPDATE sessions SET last_seen_at = now() WHERE id = ? AND last_seen_at < now() - interval '5 minutes'`,
        [row.session_id],
    );
    const { session_id, pending_secret, granted, ...user } = row;
    user.permissions = permissionsFor(user.role, granted || []);
    return { sessionId: session_id, pendingSecret: pending_secret, user };
}

export async function deleteSessionByToken(token) {
    if (!token) return;
    await db.run('DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)]);
}

// Revoke every session of a user (password change, reset, 2FA reset), optionally keeping one
export async function revokeUserSessions(userId, keepSessionId = null) {
    if (keepSessionId) {
        await db.run('DELETE FROM sessions WHERE user_id = ? AND id != ?', [userId, keepSessionId]);
    } else {
        await db.run('DELETE FROM sessions WHERE user_id = ?', [userId]);
    }
}
