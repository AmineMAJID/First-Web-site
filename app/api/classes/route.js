// GET /api/classes – distinct classes + subjects (for dropdowns)
import { db } from '@/lib/db';
import { json, requireRole } from '@/lib/api';

export async function GET(request) {
    const { response } = requireRole(request);
    if (response) return response;
    const classes = await db.all(`
        SELECT name, SUM(students) AS students FROM (
            SELECT class_name AS name, COUNT(*) AS students FROM students GROUP BY class_name
            UNION ALL
            SELECT DISTINCT class_name, 0 FROM schedules
        ) AS c GROUP BY name ORDER BY name`);
    const subjects = (await db.all(`
        SELECT DISTINCT subject FROM (
            SELECT subject FROM grades UNION SELECT subject FROM schedules UNION SELECT subject FROM teachers WHERE subject IS NOT NULL
        ) AS s ORDER BY subject`)).map((r) => r.subject);
    return json({ classes, subjects });
}
