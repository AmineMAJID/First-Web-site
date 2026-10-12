// Parents of a student – GET (list), POST (create a parent account or link an existing one), DELETE ?parentId=
import { db, tx } from '@/lib/db';
import { hashPassword, generateTempPassword } from '@/lib/password';
import { json, error, readJson, requirePermission, uniqueUsername, clampStr, parseId } from '@/lib/api';
import { revokeUserSessions } from '@/lib/session';

const LIST_SQL = `
    SELECT u.id AS "userId", u.username, u.full_name, u.email, pl.relation,
           u.two_factor_secret IS NOT NULL AS has_2fa
    FROM parent_links pl JOIN users u ON u.id = pl.parent_user_id
    WHERE pl.student_id = ? ORDER BY u.full_name`;

async function studentExists(id) {
    return id && (await db.get('SELECT id FROM students WHERE id = ?', [id]));
}

export async function GET(request, { params }) {
    const { response } = requirePermission(request, 'students.view', 'students.manage');
    if (response) return response;
    const id = parseId((await params).id);
    if (!(await studentExists(id))) return error('Student not found', 404);
    return json(await db.all(LIST_SQL, [id]));
}

export async function POST(request, { params }) {
    const { response } = requirePermission(request, 'students.manage');
    if (response) return response;
    const id = parseId((await params).id);
    if (!(await studentExists(id))) return error('Student not found', 404);
    const body = await readJson(request);
    const relation = clampStr(body?.relation, 40) || 'Parent';

    // Link an existing parent account
    if (body?.parentUserId !== undefined) {
        const parentUserId = parseId(body.parentUserId);
        const parent = parentUserId && (await db.get("SELECT id FROM users WHERE id = ? AND role = 'parent'", [parentUserId]));
        if (!parent) return error('Unknown parent account');
        await db.run(`INSERT INTO parent_links (parent_user_id, student_id, relation) VALUES (?, ?, ?)
                      ON CONFLICT (parent_user_id, student_id) DO UPDATE SET relation = excluded.relation`, [parentUserId, id, relation]);
        return json({ success: true, linked: parentUserId }, 201);
    }

    // Create a new parent account (password shown once, must be changed at first login)
    const fullName = clampStr(body?.fullName, 100);
    if (!fullName) return error('Parent name is required');
    const username = await uniqueUsername(fullName);
    const password = generateTempPassword();
    const userId = await tx(async (t) => {
        const u = await t.get(
            `INSERT INTO users (username, password_hash, role, full_name, email, must_change_password)
             VALUES (?, ?, 'parent', ?, ?, TRUE) RETURNING id`,
            [username, await hashPassword(password), fullName, clampStr(body.email, 120) || null],
        );
        await t.run('INSERT INTO parent_links (parent_user_id, student_id, relation) VALUES (?, ?, ?)', [u.id, id, relation]);
        return u.id;
    });
    return json({ success: true, parent: { userId, username, password, fullName } }, 201);
}

export async function DELETE(request, { params }) {
    const { response } = requirePermission(request, 'students.manage');
    if (response) return response;
    const id = parseId((await params).id);
    const parentId = parseId(new URL(request.url).searchParams.get('parentId'));
    if (!id || !parentId) return error('Invalid request');
    const result = await db.run('DELETE FROM parent_links WHERE student_id = ? AND parent_user_id = ?', [id, parentId]);
    if (!result.rowCount) return error('Link not found', 404);
    // The parent may have other children; sessions are only closed when the account is left with none
    const left = await db.get('SELECT COUNT(*) AS n FROM parent_links WHERE parent_user_id = ?', [parentId]);
    if (left.n === 0) await revokeUserSessions(parentId);
    return json({ success: true });
}
