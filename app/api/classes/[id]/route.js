// Classes [id] API – PUT (rename, level, head teacher), DELETE (only when empty)
import { db } from '@/lib/db';
import { json, error, readJson, requirePermission, clampStr, parseId } from '@/lib/api';

export async function PUT(request, { params }) {
    const { response } = requirePermission(request, 'classes.manage');
    if (response) return response;
    const id = parseId((await params).id);
    if (!id) return error('Class not found', 404);
    const body = await readJson(request);
    if (!body) return error('Invalid body');
    const cls = await db.get('SELECT * FROM classes WHERE id = ?', [id]);
    if (!cls) return error('Class not found', 404);
    const name = body.name !== undefined ? clampStr(body.name, 50) : cls.name;
    if (!name) return error('Class name is required');
    const headId = body.headTeacherId === undefined ? cls.head_teacher_id
        : body.headTeacherId === null || body.headTeacherId === '' ? null : parseId(body.headTeacherId);
    if (headId === null && body.headTeacherId && body.headTeacherId !== '') return error('Invalid head teacher');
    const level = body.level !== undefined ? clampStr(body.level, 30) || null : cls.level;
    try {
        // Renaming a class also renames its students and timetable slots (database trigger)
        await db.run('UPDATE classes SET name = ?, level = ?, head_teacher_id = ? WHERE id = ?', [name, level, headId, id]);
    } catch (e) {
        if (e.code === '23505') return error('A class with this name already exists this year', 409);
        if (e.code === '23503') return error('Unknown head teacher', 400);
        throw e;
    }
    return json({ success: true });
}

export async function DELETE(request, { params }) {
    const { response } = requirePermission(request, 'classes.manage');
    if (response) return response;
    const id = parseId((await params).id);
    if (!id) return error('Class not found', 404);
    const count = await db.get('SELECT COUNT(*) AS n FROM students WHERE class_id = ?', [id]);
    if (count.n > 0) return error('This class still has students. Move them to another class first.', 409);
    await db.run('DELETE FROM classes WHERE id = ?', [id]);
    return json({ success: true });
}
