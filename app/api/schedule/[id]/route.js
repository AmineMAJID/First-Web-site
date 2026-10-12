// Schedule [id] – PUT, DELETE (admin)
import { db } from '@/lib/db';
import { json, error, readJson, requireRole, parseId } from '@/lib/api';
import { validateSlot } from '@/lib/schedule';

export async function PUT(request, { params }) {
    const { response } = requireRole(request, 'admin');
    if (response) return response;
    const id = parseId((await params).id);
    const body = await readJson(request);
    const { error: msg, value } = validateSlot(body);
    if (msg) return error(msg);
    if (!id) return error('Slot not found', 404);

    if (!(await db.get('SELECT 1 FROM schedules WHERE id = ?', [id]))) return error('Slot not found', 404);
    const clash = await db.get(
        'SELECT 1 FROM schedules WHERE id != ? AND class_name = ? AND day_of_week = ? AND start_time < ? AND end_time > ?',
        [id, value.className, value.day, value.end, value.start]);
    if (clash) return error('This class already has a lesson in that time slot', 409);

    await db.run(
        'UPDATE schedules SET class_name = ?, subject = ?, teacher_id = ?, day_of_week = ?, start_time = ?, end_time = ?, room = ? WHERE id = ?',
        [value.className, value.subject, value.teacherId, value.day, value.start, value.end, value.room, id]);
    return json({ success: true });
}

export async function DELETE(request, { params }) {
    const { response } = requireRole(request, 'admin');
    if (response) return response;
    const id = parseId((await params).id);
    if (!id) return error('Slot not found', 404);
    const r = await db.run('DELETE FROM schedules WHERE id = ?', [id]);
    if (!r.rowCount) return error('Slot not found', 404);
    return json({ success: true });
}
