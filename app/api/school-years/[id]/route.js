// School year [id] API – PATCH { isCurrent: true } (switch the active year), DELETE (only unused years)
import { db, tx } from '@/lib/db';
import { json, error, readJson, requirePermission, parseId } from '@/lib/api';

export async function PATCH(request, { params }) {
    const { response } = requirePermission(request, 'classes.manage');
    if (response) return response;
    const id = parseId((await params).id);
    if (!id) return error('School year not found', 404);
    const body = await readJson(request);
    if (body?.isCurrent !== true) return error('Only isCurrent: true is supported');
    if (!(await db.get('SELECT 1 FROM school_years WHERE id = ?', [id]))) return error('School year not found', 404);
    await tx(async (t) => {
        await t.run('UPDATE school_years SET is_current = FALSE WHERE is_current');
        await t.run('UPDATE school_years SET is_current = TRUE WHERE id = ?', [id]);
    });
    return json({ success: true });
}

export async function DELETE(request, { params }) {
    const { response } = requirePermission(request, 'classes.manage');
    if (response) return response;
    const id = parseId((await params).id);
    if (!id) return error('School year not found', 404);
    const year = await db.get('SELECT is_current FROM school_years WHERE id = ?', [id]);
    if (!year) return error('School year not found', 404);
    if (year.is_current) return error('Switch to another school year before deleting this one', 409);
    const used = await db.get(`SELECT (SELECT COUNT(*) FROM grades WHERE school_year_id = ?) + (SELECT COUNT(*) FROM attendance WHERE school_year_id = ?) AS n`, [id, id]);
    if (used.n > 0) return error('This school year contains grades or attendance and cannot be deleted', 409);
    await db.run('DELETE FROM school_years WHERE id = ?', [id]);
    return json({ success: true });
}
