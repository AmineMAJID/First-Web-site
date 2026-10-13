// Own active sessions – GET (list), POST { action: 'revoke-others' } (sign out every other device)
import { db } from '@/lib/db';
import { json, error, readJson, requireAuth } from '@/lib/api';
import { revokeUserSessions } from '@/lib/session';

export async function GET(request) {
    const { session, response } = requireAuth(request);
    if (response) return response;
    const rows = await db.all(`
        SELECT id, ip, user_agent AS "userAgent", created_at AS "createdAt", last_seen_at AS "lastSeenAt"
        FROM sessions WHERE user_id = ? AND kind = 'full' AND expires_at > now()
        ORDER BY last_seen_at DESC`, [session.id]);
    return json(rows.map((r) => ({ ...r, current: r.id === session.sessionId })));
}

export async function POST(request) {
    const { session, response } = requireAuth(request);
    if (response) return response;
    const body = await readJson(request);
    if (body?.action !== 'revoke-others') return error('Unknown action');
    await revokeUserSessions(session.id, session.sessionId);
    return json({ success: true });
}
