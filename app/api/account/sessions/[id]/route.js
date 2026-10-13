// Close one of my sessions – DELETE /api/account/sessions/[id]
import { db } from '@/lib/db';
import { json, error, requireAuth, parseId } from '@/lib/api';

export async function DELETE(request, { params }) {
    const { session, response } = requireAuth(request);
    if (response) return response;
    const id = parseId((await params).id);
    if (!id) return error('Session not found', 404);
    // Only sessions of this account; a session can be closed by its owner only
    const r = await db.run("DELETE FROM sessions WHERE id = ? AND user_id = ? AND kind = 'full'", [id, session.id]);
    if (!r.rowCount) return error('Session not found', 404);
    return json({ success: true, current: id === session.sessionId });
}
