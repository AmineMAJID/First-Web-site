// Messages API – GET (inbox + sent), POST (send)
import { db, tx } from '@/lib/db';
import { json, error, readJson, requirePermission, clampStr } from '@/lib/api';

export async function GET(request) {
    const { session, response } = requirePermission(request, 'messages.view');
    if (response) return response;
    const box = new URL(request.url).searchParams.get('box') || 'all'; // inbox | sent | all

    const inbox = await db.all(`
        SELECT m.*, u.full_name AS sender_name, u.role AS sender_role,
               CASE WHEN m.is_announcement
                    THEN EXISTS(SELECT 1 FROM message_reads r WHERE r.message_id = m.id AND r.user_id = ?)
                    ELSE m.is_read END AS is_read,
               0 AS is_sent
        FROM messages m JOIN users u ON m.sender_id = u.id
        WHERE m.sender_id != ? AND (m.recipient_id = ? OR (m.is_announcement = TRUE AND m.recipient_role = ?))
        ORDER BY m.created_at DESC`, [session.id, session.id, session.id, session.role]);

    // Sent: group individual copies of the same bulk message together
    const sentRows = await db.all(`
        SELECT m.*, u.full_name AS sender_name, u.role AS sender_role,
               ru.full_name AS recipient_name, 1 AS is_sent
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        LEFT JOIN users ru ON m.recipient_id = ru.id
        WHERE m.sender_id = ?
        ORDER BY m.created_at DESC`, [session.id]);

    const sentMap = new Map();
    for (const m of sentRows) {
        const key = m.is_announcement ? `a-${m.id}` : `${m.subject}|${m.body}|${new Date(m.created_at).toISOString().slice(0, 19)}`;
        if (!sentMap.has(key)) {
            sentMap.set(key, { ...m, recipients: [], recipient_count: 0, read_count: 0 });
        }
        const entry = sentMap.get(key);
        if (m.recipient_name) entry.recipients.push(m.recipient_name);
        entry.recipient_count += m.is_announcement ? 0 : 1;
        entry.read_count += m.is_read ? 1 : 0;
    }
    const sent = [...sentMap.values()];

    const result = box === 'inbox' ? inbox : box === 'sent' ? sent : [...inbox, ...sent];
    result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return json(result);
}

export async function POST(request) {
    const { session, response } = requirePermission(request, 'messages.send');
    if (response) return response;

    const body = await readJson(request);
    const subject = clampStr(body?.subject, 150);
    const messageBody = clampStr(body?.messageBody, 5000);
    if (!subject || !messageBody) return error('Subject and body are required');

    const { recipientRole, recipientIds = [], recipientClasses = [], isAnnouncement } = body;

    if (isAnnouncement) {
        if (!['student', 'teacher'].includes(recipientRole)) return error('Invalid recipient role');
        // Only the administrator may address teachers; everyone else may only write to students
        if (session.role !== 'admin' && recipientRole !== 'student') return error('Forbidden', 403);
        await db.run(`INSERT INTO messages (sender_id, recipient_role, subject, body, is_announcement) VALUES (?, ?, ?, ?, TRUE)`,
            [session.id, recipientRole, subject, messageBody]);
        return json({ success: true, count: 1 }, 201);
    }

    const targets = new Set(recipientIds.map(Number).filter(Number.isInteger));
    if (Array.isArray(recipientClasses) && recipientClasses.length > 0) {
        const classes = recipientClasses.map((c) => clampStr(c, 50)).filter(Boolean);
        if (classes.length) {
            const placeholders = classes.map(() => '?').join(',');
            for (const s of await db.all(`SELECT user_id FROM students WHERE class_name IN (${placeholders})`, classes)) {
                targets.add(s.user_id);
            }
        }
    }
    targets.delete(session.id);
    if (targets.size === 0) return error('No recipients selected');

    // Make sure all targets exist. Non-admin senders may only write to students and administrators.
    const ids = [...targets];
    const placeholders = ids.map(() => '?').join(',');
    const users = await db.all(`SELECT id, role FROM users WHERE id IN (${placeholders})`, ids);
    if (users.length !== ids.length) return error('Unknown recipient');
    if (session.role !== 'admin' && users.some((u) => !['student', 'admin'].includes(u.role))) return error('Forbidden', 403);

    await tx(async (t) => {
        for (const id of ids) {
            await t.run('INSERT INTO messages (sender_id, recipient_id, subject, body, is_announcement) VALUES (?, ?, ?, ?, FALSE)',
                [session.id, id, subject, messageBody]);
        }
    });
    return json({ success: true, count: ids.length }, 201);
}
