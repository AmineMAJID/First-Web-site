// PUT /api/messages/[id] – mark as read ; DELETE – delete own/sent message
import { db } from '@/lib/db';
import { json, error, requirePermission, parseId } from '@/lib/api';

export async function PUT(request, { params }) {
    const { session, response } = requirePermission(request, 'messages.view');
    if (response) return response;
    const id = parseId((await params).id);
    if (!id) return error('Message not found', 404);
    const msg = await db.get('SELECT * FROM messages WHERE id = ?', [id]);
    if (!msg) return error('Message not found', 404);

    if (msg.is_announcement) {
        if (msg.recipient_role !== session.role && msg.sender_id !== session.id) return error('Forbidden', 403);
        await db.run('INSERT INTO message_reads (message_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [msg.id, session.id]);
    } else {
        if (msg.recipient_id !== session.id) return error('Forbidden', 403);
        await db.run('UPDATE messages SET is_read = TRUE WHERE id = ?', [msg.id]);
    }
    return json({ success: true });
}

export async function DELETE(request, { params }) {
    const { session, response } = requirePermission(request, 'messages.view');
    if (response) return response;
    const id = parseId((await params).id);
    if (!id) return error('Message not found', 404);
    const msg = await db.get('SELECT * FROM messages WHERE id = ?', [id]);
    if (!msg) return error('Message not found', 404);
    const allowed = session.role === 'admin' || msg.sender_id === session.id || msg.recipient_id === session.id;
    if (!allowed) return error('Forbidden', 403);
    await db.run('DELETE FROM messages WHERE id = ?', [id]);
    return json({ success: true });
}
