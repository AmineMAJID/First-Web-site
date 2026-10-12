// Teachers API – GET (list), POST (create)
import { db, tx } from '@/lib/db';
import { hashPassword, generateTempPassword } from '@/lib/password';
import { json, error, readJson, requirePermission, uniqueUsername, nextCode, clampStr } from '@/lib/api';

export async function GET(request) {
    const { response } = requirePermission(request, 'teachers.view');
    if (response) return response;
    const teachers = await db.all(`
        SELECT u.id AS "userId", u.username, u.full_name, u.email, u.created_at,
               u.two_factor_secret IS NOT NULL AS has_2fa,
               t.id, t.teacher_id, t.subject, t.phone, t.department, t.hire_date,
               (SELECT COUNT(DISTINCT class_name) FROM schedules sc WHERE sc.teacher_id = t.id) AS class_count
        FROM users u JOIN teachers t ON u.id = t.user_id
        WHERE u.role = 'teacher' ORDER BY u.full_name ASC`);
    return json(teachers);
}

export async function POST(request) {
    const { response } = requirePermission(request, 'teachers.manage');
    if (response) return response;

    const body = await readJson(request);
    const fullName = clampStr(body?.fullName, 100);
    const subject = clampStr(body?.subject, 60);
    if (!fullName || !subject) return error('Full name and subject are required');

    const username = await uniqueUsername(fullName);
    const password = generateTempPassword();
    const passwordHash = await hashPassword(password);

    try {
        const teacherCode = await nextCode('teachers', 'teacher_id', 'TCH');
        const userId = await tx(async (t) => {
            const u = await t.get(
                `INSERT INTO users (username, password_hash, role, full_name, email, must_change_password)
                 VALUES (?, ?, 'teacher', ?, ?, TRUE) RETURNING id`,
                [username, passwordHash, fullName, clampStr(body.email, 120) || null],
            );
            await t.run('INSERT INTO teachers (user_id, teacher_id, subject, department, phone) VALUES (?, ?, ?, ?, ?)',
                [u.id, teacherCode, subject, clampStr(body.department, 60) || 'General', clampStr(body.phone, 30) || null]);
            return u.id;
        });
        return json({ success: true, teacher: { userId, teacherId: teacherCode, username, password, fullName, subject } }, 201);
    } catch (e) {
        console.error('Create teacher error:', e);
        return error('Failed to create teacher', 500);
    }
}
