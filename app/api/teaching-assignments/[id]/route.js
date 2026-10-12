// Teaching assignments [id] API – DELETE
import { db } from '@/lib/db';
import { json, error, requirePermission, parseId } from '@/lib/api';

export async function DELETE(request, { params }) {
    const { response } = requirePermission(request, 'classes.manage');
    if (response) return response;
    const id = parseId((await params).id);
    if (!id) return error('Assignment not found', 404);
    const result = await db.run('DELETE FROM teaching_assignments WHERE id = ?', [id]);
    if (!result.rowCount) return error('Assignment not found', 404);
    return json({ success: true });
}
