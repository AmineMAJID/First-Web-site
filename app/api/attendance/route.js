// Attendance API – GET, POST (bulk upsert)
import { db, tx } from '@/lib/db';
import { json, error, readJson, requirePermission, hasPerm, isValidDate, clampStr, parseId } from '@/lib/api';
import { currentSchoolYear } from '@/lib/school';
import { visibleClassIds, attendanceAllowed, studentClassesById } from '@/lib/scope';

const STATUSES = new Set(['present', 'absent', 'late', 'excused']);

export async function GET(request) {
    const { session, response } = requirePermission(request, 'attendance.record', 'attendance.view_all', 'attendance.view_own');
    if (response) return response;
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const className = searchParams.get('class');
    const studentId = searchParams.get('studentId');

    const year = await currentSchoolYear();
    if (!year) return json([]);
    const where = ['a.school_year_id = ?'];
    const params = [year.id];
    // Reading all records needs attendance.view_all (or attendance.record); otherwise only the account's own
    if (!hasPerm(session, 'attendance.record') && !hasPerm(session, 'attendance.view_all')) {
        const student = await db.get('SELECT id FROM students WHERE user_id = ?', [session.id]);
        if (!student) return json([]);
        where.push('a.student_id = ?');
        params.push(student.id);
    } else if (studentId) {
        if (!parseId(studentId)) return json([]);
        where.push('a.student_id = ?');
        params.push(parseId(studentId));
    }
    if (date) { where.push('a.date = ?'); params.push(date); }
    if (from) { where.push('a.date >= ?'); params.push(from); }
    if (to) { where.push('a.date <= ?'); params.push(to); }
    if (className) { where.push('s.class_name = ?'); params.push(className); }
    const visible = await visibleClassIds(session);
    if (visible) { where.push('s.class_id = ANY(?)'); params.push(visible); }

    const sql = `SELECT a.*, u.full_name AS student_name, s.student_id AS student_code, s.class_name
                 FROM attendance a
                 JOIN students s ON a.student_id = s.id
                 JOIN users u ON s.user_id = u.id
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY a.date DESC, u.full_name`;
    return json(await db.all(sql, params));
}

export async function POST(request) {
    const { session, response } = requirePermission(request, 'attendance.record');
    if (response) return response;

    const body = await readJson(request);
    const records = Array.isArray(body?.records) ? body.records : null;
    if (!records || records.length === 0) return error('records[] is required');
    if (records.length > 1000) return error('Too many records in one request (max 1000)');

    const year = await currentSchoolYear();
    if (!year) return error('No current school year');
    const classOf = await studentClassesById(records.map((r) => parseId(r.studentId)).filter(Boolean));
    for (const r of records) {
        if (!(await attendanceAllowed(session, classOf.get(parseId(r.studentId)) ?? null))) return error('Forbidden: this student is not in your classes', 403);
    }
    for (const r of records) {
        if (!parseId(r.studentId)) return error('Invalid studentId');
        if (!isValidDate(r.date)) return error('Invalid date');
        if (!STATUSES.has(r.status)) return error('Invalid status');
        if (r.date < year.starts_on || r.date > year.ends_on) {
            return error(`Date ${r.date} is outside the current school year (${year.label})`);
        }
    }

    let teacherId = null;
    if (session.role === 'teacher') {
        teacherId = (await db.get('SELECT id FROM teachers WHERE user_id = ?', [session.id]))?.id ?? null;
    }

    await tx(async (t) => {
        for (const r of records) {
            await t.run(`
                INSERT INTO attendance (student_id, date, status, recorded_by, notes, school_year_id) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT (student_id, date) DO UPDATE SET
                    status = excluded.status, recorded_by = excluded.recorded_by, notes = excluded.notes`,
                [Number(r.studentId), r.date, r.status, teacherId, clampStr(r.notes, 200), year.id]);
        }
    });
    return json({ success: true, count: records.length });
}
