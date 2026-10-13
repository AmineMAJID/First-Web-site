// GET /api/dashboard/admin?date=YYYY-MM-DD – what the administration must look at today
import { db } from '@/lib/db';
import { json, error, requirePermission } from '@/lib/api';
import { currentSchoolYear } from '@/lib/school';

const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function GET(request) {
    const { session, response } = requirePermission(request, 'home.admin');
    if (response) return response;
    const param = new URL(request.url).searchParams.get('date');
    const day = isDay(param) ? param : new Date().toISOString().slice(0, 10);
    if (!isDay(param) && param) return error('Invalid date');
    const year = await currentSchoolYear();

    // Absences and late arrivals of the day (current school year)
    const movements = year ? await db.all(`
        SELECT a.status, s.id AS "studentId", u.full_name AS "studentName", s.class_name AS "className"
        FROM attendance a
        JOIN students s ON s.id = a.student_id
        JOIN users u ON u.id = s.user_id
        WHERE a.date = ? AND a.school_year_id = ? AND a.status IN ('absent', 'late')
        ORDER BY a.status, u.full_name`, [day, year.id]) : [];

    const unread = await db.get('SELECT COUNT(*) AS n FROM messages WHERE recipient_id = ? AND is_read = FALSE', [session.id]);

    // Things waiting for someone to act on them
    const tasks = [];
    const count = async (sql, params = []) => (await db.get(sql, params)).n;
    if (!year) {
        tasks.push({ key: 'no-year', label: 'Aucune année scolaire en cours', count: 1, href: '/dashboard/admin/classes' });
    } else {
        const noClass = await count('SELECT COUNT(*) AS n FROM students WHERE class_id IS NULL');
        const noHead = await count('SELECT COUNT(*) AS n FROM classes WHERE school_year_id = ? AND head_teacher_id IS NULL', [year.id]);
        const emptyClass = await count(`SELECT COUNT(*) AS n FROM classes c WHERE c.school_year_id = ?
            AND NOT EXISTS (SELECT 1 FROM students s WHERE s.class_id = c.id)`, [year.id]);
        const unassigned = await count(`SELECT COUNT(*) AS n FROM teachers t
            WHERE NOT EXISTS (SELECT 1 FROM teaching_assignments ta JOIN classes c ON c.id = ta.class_id AND c.school_year_id = ?
                              WHERE ta.teacher_id = t.id)`, [year.id]);
        tasks.push(
            { key: 'no-class', label: 'Élèves sans classe', count: noClass, href: '/dashboard/admin/students' },
            { key: 'no-head', label: 'Classes sans professeur principal', count: noHead, href: '/dashboard/admin/classes' },
            { key: 'empty-class', label: 'Classes sans élève', count: emptyClass, href: '/dashboard/admin/classes' },
            { key: 'unassigned', label: 'Enseignants sans affectation', count: unassigned, href: '/dashboard/admin/classes' },
        );
    }
    const pendingRoles = await count("SELECT COUNT(*) AS n FROM users WHERE role = 'parent' AND two_factor_secret IS NULL");
    tasks.push({ key: 'parents-2fa', label: 'Familles qui n’ont pas encore activé la 2FA', count: pendingRoles, href: '/dashboard/admin/students' });

    return json({
        date: day,
        schoolYear: year ? year.label : null,
        absent: movements.filter((m) => m.status === 'absent'),
        late: movements.filter((m) => m.status === 'late'),
        unreadMessages: unread.n,
        tasks: tasks.filter((t) => t.count > 0),
    });
}
