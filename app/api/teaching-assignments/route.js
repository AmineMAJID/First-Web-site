// Teaching assignments API – GET (current year), POST { teacherId, classId, subject }
import { db } from '@/lib/db';
import { json, error, readJson, requirePermission, clampStr, parseId } from '@/lib/api';
import { currentSchoolYear } from '@/lib/school';

export async function GET(request) {
    const { response } = requirePermission(request, 'classes.manage');
    if (response) return response;
    const year = await currentSchoolYear();
    if (!year) return json([]);
    return json(await db.all(`
        SELECT ta.id, ta.subject, ta.teacher_id AS "teacherId", ta.class_id AS "classId",
               c.name AS "className", u.full_name AS "teacherName"
        FROM teaching_assignments ta
        JOIN classes c ON c.id = ta.class_id AND c.school_year_id = ?
        JOIN teachers t ON t.id = ta.teacher_id
        JOIN users u ON u.id = t.user_id
        ORDER BY c.name, ta.subject, u.full_name`, [year.id]));
}

export async function POST(request) {
    const { response } = requirePermission(request, 'classes.manage');
    if (response) return response;
    const body = await readJson(request);
    const teacherId = parseId(body?.teacherId);
    const classId = parseId(body?.classId);
    const subject = clampStr(body?.subject, 60);
    if (!teacherId) return error('Teacher is required');
    if (!classId) return error('Class is required');
    if (!subject) return error('Subject is required');
    const year = await currentSchoolYear();
    const cls = year && (await db.get('SELECT id FROM classes WHERE id = ? AND school_year_id = ?', [classId, year.id]));
    if (!cls) return error('Unknown class for the current school year');
    if (!(await db.get('SELECT id FROM teachers WHERE id = ?', [teacherId]))) return error('Unknown teacher');
    try {
        const row = await db.get('INSERT INTO teaching_assignments (teacher_id, class_id, subject) VALUES (?, ?, ?) RETURNING id',
            [teacherId, classId, subject]);
        return json({ success: true, id: row.id }, 201);
    } catch (e) {
        if (e.code === '23505') return error('This teacher already teaches this subject in this class', 409);
        throw e;
    }
}
