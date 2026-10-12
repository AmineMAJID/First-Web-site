// Audit trail and brute-force protection, both backed by the auth_events table.
import { db } from './db.js';

export const LOGIN_WINDOW_MINUTES = 15;
export const MAX_FAILED_PER_ACCOUNT = 5;   // failed logins for one username in the window
export const MAX_FAILED_PER_IP = 50;       // failed logins from one IP in the window (only with TRUST_PROXY)

// Client IP. X-Forwarded-For can be forged, so it is only read when the app sits
// behind a reverse proxy that we control (TRUST_PROXY=true).
export function clientIp(request) {
    if (process.env.TRUST_PROXY !== 'true') return null;
    const fwd = request.headers.get('x-forwarded-for');
    return fwd ? fwd.split(',')[0].trim().slice(0, 64) : null;
}

export const userAgent = (request) => (request.headers.get('user-agent') || '').slice(0, 255);

export async function recordEvent(event, { username = null, userId = null, ip = null, ua = null } = {}) {
    try {
        await db.run(
            'INSERT INTO auth_events (event, username, user_id, ip, user_agent) VALUES (?, ?, ?, ?, ?)',
            [event, username, userId, ip, ua],
        );
    } catch (e) {
        // Never block authentication because the audit insert failed, but make it visible
        console.error('[audit] failed to record event', event, e.message);
    }
}

export async function isLoginBlocked(username, ip) {
    const since = `now() - interval '${LOGIN_WINDOW_MINUTES} minutes'`;
    const account = await db.get(
        `SELECT COUNT(*) AS c FROM auth_events WHERE event = 'login_failed' AND username = ? AND created_at > ${since}`,
        [username],
    );
    if (account.c >= MAX_FAILED_PER_ACCOUNT) return true;
    if (ip) {
        const byIp = await db.get(
            `SELECT COUNT(*) AS c FROM auth_events WHERE event = 'login_failed' AND ip = ? AND created_at > ${since}`,
            [ip],
        );
        if (byIp.c >= MAX_FAILED_PER_IP) return true;
    }
    return false;
}

// Failed 2FA codes for one user in the last 5 minutes
export async function mfaFailureCount(userId) {
    const r = await db.get(
        `SELECT COUNT(*) AS c FROM auth_events WHERE event = 'mfa_failed' AND user_id = ? AND created_at > now() - interval '5 minutes'`,
        [userId],
    );
    return r.c;
}
