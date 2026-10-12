// Parent accounts – GET (all, to link an existing parent to another child)
import { db } from '@/lib/db';
import { json, requirePermission } from '@/lib/api';

export async function GET(request) {
    const { response } = requirePermission(request, 'students.manage');
    if (response) return response;
    return json(await db.all(`
        SELECT u.id AS "userId", u.username, u.full_name, u.email,
               (SELECT COUNT(*) FROM parent_links pl WHERE pl.parent_user_id = u.id) AS children
        FROM users u WHERE u.role = 'parent' ORDER BY u.full_name`));
}
