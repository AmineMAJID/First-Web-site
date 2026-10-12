// Classes API – GET (classes of the current school year, plus names used by dropdowns), POST (create)
import { db } from '@/lib/db';
import { json, error, readJson, requireAuth, requirePermission, clampStr, parseId } from '@/lib/api';
import { currentSchoolYear } from '@/lib/school';

const CLASS_SQL = `
    SELECT c.id, c.name, c.level, c.school_year_id AS "schoolYearId", c.head_teacher_id AS "headTeacherId",
           tu.full_name AS "headTeacherName",
           (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id) AS "studentCount"
    FROM classes c
    LEFT JOIN teachers t ON c.head_teacher_id = t.id
    LEFT JOIN users tu ON t.user_id = tu.id`;

export async function GET(request) {
    const { response } = requireAuth(request);
    if (response) return response;
    const year = await currentSchoolYear();
    const classList = year ? await db.all(`${CLASS_SQL} WHERE c.school_year_id = ? ORDER BY c.name`, [year.id]) : [];
    // Names still used by timetable slots that match no class of this year (kept so nothing disappears)
    const legacy = await db.all(`SELECT DISTINCT class_name AS name FROM schedules
        WHERE class_name NOT IN (SELECT name FROM classes WHERE school_year_id = ?)`, [year?.id ?? 0]);
    const names = [...new Set([...classList.map((c) => c.name), ...legacy.map((r) => r.name)])].sort();
    const subjects = (await db.all(`
        SELECT DISTINCT subject FROM (
            SELECT subject FROM grades UNION SELECT subject FROM schedules UNION SELECT subject FROM teachers WHERE subject IS NOT NULL
        ) AS s ORDER BY subject`)).map((r) => r.subject);
    const counts = Object.fromEntries(classList.map((c) => [c.name, c.studentCount]));
    return json({
        // `classes` keeps the shape used by the dropdowns: { name, students }
        classes: names.map((name) => ({ name, students: counts[name] ?? 0 })),
        classList,
        schoolYear: year,
        subjects,
    });
}

export async function POST(request) {
    const { response } = requirePermission(request, 'classes.manage');
    if (response) return response;
    const body = await readJson(request);
    const name = clampStr(body?.name, 50);
    if (!name) return error('Class name is required');
    const year = await currentSchoolYear();
    if (!year) return error('No current school year. Create one first.');
    const headId = body?.headTeacherId ? parseId(body.headTeacherId) : null;
    if (body?.headTeacherId && !headId) return error('Invalid head teacher');
    try {
        const row = await db.get(
            `INSERT INTO classes (name, level, school_year_id, head_teacher_id) VALUES (?, ?, ?, ?) RETURNING id`,
            [name, clampStr(body.level, 30) || null, year.id, headId],
        );
        return json({ success: true, id: row.id }, 201);
    } catch (e) {
        if (e.code === '23505') return error('A class with this name already exists this year', 409);
        if (e.code === '23503') return error('Unknown head teacher', 400);
        throw e;
    }
}
