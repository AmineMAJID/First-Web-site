// Students API – GET (list), POST (create)
import { db, tx } from '@/lib/db';
import { hashPassword, generateTempPassword } from '@/lib/password';
import { json, error, readJson, requirePermission, uniqueUsername, nextCode, clampStr, isValidDate, parseId } from '@/lib/api';
import { currentSchoolYear, resolveClassFor } from '@/lib/school';

export async function GET(request) {
    const { response } = requirePermission(request, 'students.view');
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const className = searchParams.get('class') || '';
    const classId = parseId(searchParams.get('classId'));

    let query = `
    SELECT u.id AS "userId", u.username, u.full_name, u.email, u.created_at,
           s.id, s.student_id, s.date_of_birth, s.gender, s.phone, s.address,
           s.class_id AS "classId", s.class_name, s.enrollment_date, s.parent_name, s.parent_phone,
           (SELECT ROUND(AVG(g.grade * 100.0 / g.max_grade), 1) FROM grades g WHERE g.student_id = s.id) AS average,
           (SELECT ROUND(100.0 * SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) / COUNT(*)) FROM attendance a WHERE a.student_id = s.id) AS attendance_rate
    FROM users u
    JOIN students s ON u.id = s.user_id
    WHERE u.role = 'student'`;
    const params = [];
    if (search) {
        query += ' AND (u.full_name ILIKE ? OR s.student_id ILIKE ? OR u.email ILIKE ? OR u.username ILIKE ?)';
        const like = `%${search}%`;
        params.push(like, like, like, like);
    }
    if (className) {
        query += ' AND s.class_name = ?';
        params.push(className);
    }
    if (classId) {
        query += ' AND s.class_id = ?';
        params.push(classId);
    }
    query += ' ORDER BY u.full_name ASC';
    return json(await db.all(query, params));
}

export async function POST(request) {
    const { response } = requirePermission(request, 'students.manage');
    if (response) return response;

    const body = await readJson(request);
    const fullName = clampStr(body?.fullName, 100);
    if (!fullName) return error('Full name is required');
    if (body?.dateOfBirth && !isValidDate(body.dateOfBirth)) return error('Invalid date of birth');

    const year = await currentSchoolYear();
    const cls = await resolveClassFor(body, year?.id ?? 0);
    if (cls.error) return error(cls.error);

    const username = await uniqueUsername(fullName);
    const password = generateTempPassword();
    const passwordHash = await hashPassword(password);

    try {
        const studentCode = await nextCode('students', 'student_id', 'STU');
        const userId = await tx(async (t) => {
            const u = await t.get(
                `INSERT INTO users (username, password_hash, role, full_name, email, must_change_password)
                 VALUES (?, ?, 'student', ?, ?, TRUE) RETURNING id`,
                [username, passwordHash, fullName, clampStr(body.email, 120) || null],
            );
            await t.run(
                `INSERT INTO students (user_id, student_id, date_of_birth, gender, phone, address, class_id, parent_name, parent_phone)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [u.id, studentCode, body.dateOfBirth || null, clampStr(body.gender, 20) || null,
                    clampStr(body.phone, 30) || null, clampStr(body.address, 200) || null, cls.classId ?? null,
                    clampStr(body.parentName, 100) || null, clampStr(body.parentPhone, 30) || null],
            );
            return u.id;
        });
        const created = await db.get('SELECT class_name FROM students WHERE user_id = ?', [userId]);
        return json({
            success: true,
            student: { userId, studentId: studentCode, username, password, fullName, email: body.email || null, className: created?.class_name ?? null },
        }, 201);
    } catch (e) {
        console.error('Create student error:', e);
        return error('Failed to create student', 500);
    }
}
