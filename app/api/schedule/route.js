// Schedule API – GET (role aware), POST (admin create)
import { db } from '@/lib/db';
import { json, error, readJson, requirePermission, parseId } from '@/lib/api';
import { DAYS, validateSlot } from '@/lib/schedule';

const ORDER = `CASE sc.day_of_week ${DAYS.map((d, i) => `WHEN '${d}' THEN ${i + 1}`).join(' ')} END, sc.start_time`;
const BASE = `SELECT sc.*, u.full_name AS teacher_name FROM schedules sc
              LEFT JOIN teachers t ON sc.teacher_id = t.id
              LEFT JOIN users u ON t.user_id = u.id`;

export async function GET(request) {
    const { session, response } = requirePermission(request, 'schedule.view');
    if (response) return response;
    const className = new URL(request.url).searchParams.get('class');

    if (session.role === 'student') {
        const student = await db.get('SELECT class_name FROM students WHERE user_id = ?', [session.id]);
        if (!student) return json([]);
        return json(await db.all(`${BASE} WHERE sc.class_name = ? ORDER BY ${ORDER}`, [student.class_name]));
    }
    if (session.role === 'teacher' && !className) {
        const teacher = await db.get('SELECT id FROM teachers WHERE user_id = ?', [session.id]);
        if (!teacher) return json([]);
        return json(await db.all(`${BASE} WHERE sc.teacher_id = ? ORDER BY ${ORDER}`, [teacher.id]));
    }
    if (className) return json(await db.all(`${BASE} WHERE sc.class_name = ? ORDER BY ${ORDER}`, [className]));
    return json(await db.all(`${BASE} ORDER BY sc.class_name, ${ORDER}`));
}

export async function POST(request) {
    const { response } = requirePermission(request, 'schedule.manage');
    if (response) return response;
    const body = await readJson(request);
    const { error: msg, value } = validateSlot(body);
    if (msg) return error(msg);

    const clash = await db.get(
        'SELECT 1 FROM schedules WHERE class_name = ? AND day_of_week = ? AND start_time < ? AND end_time > ?',
        [value.className, value.day, value.end, value.start]);
    if (clash) return error('This class already has a lesson in that time slot', 409);

    const r = await db.run(
        `INSERT INTO schedules (class_name, subject, teacher_id, day_of_week, start_time, end_time, room)
         VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [value.className, value.subject, value.teacherId, value.day, value.start, value.end, value.room]);
    return json({ success: true, id: r.rows[0].id }, 201);
}
