// Creates in-app notifications. Called by the routes after a successful write.
import { db } from './db.js';

// Insert one notification per user id (duplicates removed). Runs on the given client (db or a transaction).
export async function notifyUsers(q, userIds, { kind, title, body = '', link = null }) {
    const ids = [...new Set(userIds.filter((id) => Number.isInteger(id)))];
    if (!ids.length) return;
    await q.run(
        `INSERT INTO notifications (user_id, kind, title, body, link)
         SELECT u, ?, ?, ?, ? FROM unnest(?::bigint[]) AS u`,
        [kind, title, body.slice(0, 300), link, ids],
    );
}

// Users who must hear about a student: the student account and the linked parents
export async function studentAudience(studentIds) {
    const ids = [...new Set(studentIds.filter((id) => Number.isInteger(id)))];
    if (!ids.length) return new Map();
    const rows = await db.all(`
        SELECT s.id AS student_id, s.user_id, pl.parent_user_id
        FROM students s LEFT JOIN parent_links pl ON pl.student_id = s.id
        WHERE s.id = ANY(?)`, [ids]);
    const byStudent = new Map();
    for (const r of rows) {
        if (!byStudent.has(r.student_id)) byStudent.set(r.student_id, { student: r.user_id, parents: [] });
        if (r.parent_user_id) byStudent.get(r.student_id).parents.push(r.parent_user_id);
    }
    return byStudent;
}

// Everyone holding a role (announcements addressed to a role)
export async function notifyRole(q, role, payload) {
    await q.run(
        `INSERT INTO notifications (user_id, kind, title, body, link)
         SELECT id, ?, ?, ?, ? FROM users WHERE role = ?`,
        [payload.kind, payload.title, (payload.body || '').slice(0, 300), payload.link ?? null, role],
    );
}
