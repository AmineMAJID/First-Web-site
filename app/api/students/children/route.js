// GET /api/students/children – the students linked to the signed-in parent, with a summary
import { db } from '@/lib/db';
import { json, requirePermission } from '@/lib/api';
import { childStudentIds } from '@/lib/scope';

export async function GET(request) {
    const { session, response } = requirePermission(request, 'children.view');
    if (response) return response;
    const ids = (await childStudentIds(session)) ?? [];
    if (!ids.length) return json([]);
    return json(await db.all(`
        SELECT s.id, s.student_id, s.class_name, s.class_id, u.full_name,
               (SELECT ROUND(AVG(g.grade * 100.0 / g.max_grade), 1) FROM grades g WHERE g.student_id = s.id) AS average,
               (SELECT ROUND(100.0 * SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) / COUNT(*)) FROM attendance a WHERE a.student_id = s.id) AS attendance_rate
        FROM students s JOIN users u ON u.id = s.user_id
        WHERE s.id = ANY(?) ORDER BY u.full_name`, [ids]));
}
