// Students [id] API – GET, PUT, DELETE, POST (reset password)
import { db } from '@/lib/db';
import { hashPassword, generateTempPassword } from '@/lib/password';
import { revokeUserSessions } from '@/lib/session';
import { json, error, readJson, requirePermission, hasPerm, clampStr, isValidDate, parseId } from '@/lib/api';
import { currentSchoolYear, resolveClassFor } from '@/lib/school';

export async function GET(request, { params }) {
    const { session, response } = requirePermission(request);
    if (response) return response;
    const id = parseId((await params).id);
    if (!id) return error('Student not found', 404);

    const student = await db.get(`
        SELECT u.id AS "userId", u.username, u.full_name, u.email, s.*
        FROM users u JOIN students s ON u.id = s.user_id WHERE s.id = ?`, [id]);
    if (!student) return error('Student not found', 404);
    if (student.userId !== session.id && !hasPerm(session, 'students.view')) return error('Forbidden', 403);

    const grades = await db.all('SELECT * FROM grades WHERE student_id = ? ORDER BY term, subject', [id]);
    const attendance = await db.all('SELECT status, COUNT(*) AS count FROM attendance WHERE student_id = ? GROUP BY status', [id]);
    return json({ ...student, grades, attendance });
}

export async function PUT(request, { params }) {
    const { response } = requirePermission(request, 'students.manage');
    if (response) return response;
    const id = parseId((await params).id);
    const body = await readJson(request);
    if (!body) return error('Invalid body');
    if (body.dateOfBirth && !isValidDate(body.dateOfBirth)) return error('Invalid date of birth');
    if (!id) return error('Student not found', 404);

    const student = await db.get('SELECT * FROM students WHERE id = ?', [id]);
    if (!student) return error('Student not found', 404);

    const year = await currentSchoolYear();
    const cls = await resolveClassFor(body, year?.id ?? 0);
    if (cls.error) return error(cls.error);

    await db.run('UPDATE users SET full_name = COALESCE(?, full_name), email = COALESCE(?, email), updated_at = now() WHERE id = ?',
        [clampStr(body.fullName, 100) || null, body.email !== undefined ? clampStr(body.email, 120) : null, student.user_id]);
    await db.run(`
        UPDATE students SET
          date_of_birth = COALESCE(?, date_of_birth), gender = COALESCE(?, gender), phone = COALESCE(?, phone),
          address = COALESCE(?, address),
          parent_name = COALESCE(?, parent_name), parent_phone = COALESCE(?, parent_phone)
        WHERE id = ?`,
        [body.dateOfBirth || null, body.gender ?? null, body.phone ?? null, body.address ?? null,
            body.parentName ?? null, body.parentPhone ?? null, id]);
    // class_id is set explicitly so that a student can also be removed from a class (class_name follows by trigger)
    if (cls.provided) await db.run('UPDATE students SET class_id = ? WHERE id = ?', [cls.classId, id]);
    return json({ success: true });
}

// POST /api/students/[id]  { action: 'reset-password' }
export async function POST(request, { params }) {
    const { response } = requirePermission(request, 'students.manage');
    if (response) return response;
    const id = parseId((await params).id);
    const body = await readJson(request);
    if (body?.action !== 'reset-password') return error('Unknown action');
    if (!id) return error('Student not found', 404);

    const student = await db.get('SELECT user_id FROM students WHERE id = ?', [id]);
    if (!student) return error('Student not found', 404);
    const password = generateTempPassword();
    await db.run('UPDATE users SET password_hash = ?, must_change_password = TRUE, updated_at = now() WHERE id = ?',
        [await hashPassword(password), student.user_id]);
    await revokeUserSessions(student.user_id);
    return json({ success: true, password });
}

export async function DELETE(request, { params }) {
    const { response } = requirePermission(request, 'students.manage');
    if (response) return response;
    const id = parseId((await params).id);
    if (!id) return error('Student not found', 404);
    const student = await db.get('SELECT user_id FROM students WHERE id = ?', [id]);
    if (!student) return error('Student not found', 404);
    await db.run('DELETE FROM users WHERE id = ?', [student.user_id]);
    return json({ success: true });
}
