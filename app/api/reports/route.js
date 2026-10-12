// GET /api/reports – admin analytics
import { db } from '@/lib/db';
import { json, requirePermission } from '@/lib/api';

const LAST_30_DAYS = `to_char(CURRENT_DATE - 30, 'YYYY-MM-DD')`;
const LAST_14_DAYS = `to_char(CURRENT_DATE - 14, 'YYYY-MM-DD')`;

export async function GET(request) {
    const { response } = requirePermission(request, 'reports.view');
    if (response) return response;

    const totalStudents = (await db.get('SELECT COUNT(*) AS c FROM students')).c;
    const totalTeachers = (await db.get('SELECT COUNT(*) AS c FROM teachers')).c;
    const totalClasses = (await db.get('SELECT COUNT(DISTINCT class_name) AS c FROM students')).c;

    const attendanceStats = await db.all(`SELECT status, COUNT(*) AS count FROM attendance WHERE date >= ${LAST_30_DAYS} GROUP BY status`);
    const totalAttendance = attendanceStats.reduce((s, r) => s + r.count, 0);
    const presentCount = attendanceStats.find((r) => r.status === 'present')?.count || 0;
    const attendanceRate = totalAttendance ? Math.round((presentCount / totalAttendance) * 100) : 0;

    const avgGrade = (await db.get('SELECT AVG(grade * 100.0 / max_grade) AS avg FROM grades')).avg || 0;

    const gradesBySubject = await db.all(`
        SELECT subject, ROUND(AVG(grade * 100.0 / max_grade), 1) AS avg, MIN(grade) AS min, MAX(grade) AS max, COUNT(*) AS count
        FROM grades GROUP BY subject ORDER BY subject`);

    const gradesByClass = await db.all(`
        SELECT s.class_name, ROUND(AVG(g.grade * 100.0 / g.max_grade), 1) AS avg, COUNT(DISTINCT s.id) AS students
        FROM grades g JOIN students s ON g.student_id = s.id GROUP BY s.class_name ORDER BY s.class_name`);

    const attendanceByClass = await db.all(`
        SELECT s.class_name, a.status, COUNT(*) AS count
        FROM attendance a JOIN students s ON a.student_id = s.id
        WHERE a.date >= ${LAST_30_DAYS} GROUP BY s.class_name, a.status ORDER BY s.class_name`);

    const attendanceTrend = await db.all(`
        SELECT date, ROUND(100.0 * SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) / COUNT(*)) AS rate, COUNT(*) AS total
        FROM attendance WHERE date >= ${LAST_14_DAYS} GROUP BY date ORDER BY date`);

    const gradeDistribution = await db.all(`
        SELECT CASE WHEN pct >= 90 THEN 'A' WHEN pct >= 80 THEN 'B' WHEN pct >= 70 THEN 'C' WHEN pct >= 60 THEN 'D' ELSE 'F' END AS band, COUNT(*) AS count
        FROM (SELECT grade * 100.0 / max_grade AS pct FROM grades) AS p GROUP BY band ORDER BY band`);

    const topStudents = await db.all(`
        SELECT u.full_name, s.student_id, s.class_name, ROUND(AVG(g.grade * 100.0 / g.max_grade), 1) AS avg
        FROM grades g JOIN students s ON g.student_id = s.id JOIN users u ON s.user_id = u.id
        GROUP BY s.id, u.full_name, s.student_id, s.class_name ORDER BY avg DESC LIMIT 5`);

    const atRiskStudents = await db.all(`
        SELECT * FROM (
            SELECT u.full_name, s.student_id, s.class_name,
                   ROUND(AVG(g.grade * 100.0 / g.max_grade), 1) AS avg,
                   (SELECT ROUND(100.0 * SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) / COUNT(*)) FROM attendance a WHERE a.student_id = s.id) AS attendance_rate
            FROM grades g JOIN students s ON g.student_id = s.id JOIN users u ON s.user_id = u.id
            GROUP BY s.id, u.full_name, s.student_id, s.class_name
        ) AS r
        WHERE avg < 70 OR attendance_rate < 75 ORDER BY avg ASC LIMIT 5`);

    const recentStudents = await db.all(`
        SELECT u.full_name, s.student_id, s.class_name, u.created_at
        FROM users u JOIN students s ON u.id = s.user_id ORDER BY u.created_at DESC, u.id DESC LIMIT 5`);

    return json({
        totalStudents, totalTeachers, totalClasses, attendanceRate,
        avgGrade: Math.round(avgGrade * 10) / 10,
        attendanceStats, gradesBySubject, gradesByClass, attendanceByClass, attendanceTrend,
        gradeDistribution, topStudents, atRiskStudents, recentStudents,
    });
}
