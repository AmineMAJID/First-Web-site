// Notifications API – GET (latest 30 + unread count), POST { ids: [...] } or { all: true } to mark as read
import { db } from '@/lib/db';
import { json, error, readJson, requireAuth } from '@/lib/api';

export async function GET(request) {
    const { session, response } = requireAuth(request);
    if (response) return response;
    const items = await db.all(`
        SELECT id, kind, title, body, link, is_read AS "isRead", created_at AS "createdAt"
        FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 30`, [session.id]);
    const unread = await db.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND NOT is_read', [session.id]);
    return json({ unread: unread.n, items });
}

export async function POST(request) {
    const { session, response } = requireAuth(request);
    if (response) return response;
    const body = await readJson(request);
    if (body?.all === true) {
        await db.run('UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND NOT is_read', [session.id]);
    } else if (Array.isArray(body?.ids)) {
        const ids = body.ids.map(Number).filter(Number.isInteger).slice(0, 100);
        if (ids.length) {
            await db.run('UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND id = ANY(?)', [session.id, ids]);
        }
    } else {
        return error('Provide ids[] or all: true');
    }
    return json({ success: true });
}
