// PUT /api/staff/[id] { fullName, email, roleKey } – edit a staff account; a role change applies at once
// POST /api/staff/[id] { action: 'reset-password' | 'reset-2fa' }
// DELETE /api/staff/[id]
import { db } from '@/lib/db';
import { hashPassword, generateTempPassword } from '@/lib/password';
import { revokeUserSessions } from '@/lib/session';
import { recordEvent, clientIp, userAgent } from '@/lib/security';
import { json, error, readJson, requirePermission, clampStr, parseId } from '@/lib/api';
import { BUILT_IN_ROLES } from '@/lib/permissions';

// Only accounts with a custom role can be managed here
async function findStaff(id) {
    if (!id) return null;
    return db.get('SELECT id, username, role FROM users WHERE id = ? AND role <> ALL(?::text[])', [id, BUILT_IN_ROLES]);
}

export async function PUT(request, { params }) {
    const { response } = requirePermission(request, 'staff.manage');
    if (response) return response;
    const staff = await findStaff(parseId((await params).id));
    if (!staff) return error('Staff account not found', 404);

    const body = await readJson(request);
    if (!body) return error('Invalid body');

    let roleKey = staff.role;
    if (body.roleKey !== undefined) {
        roleKey = clampStr(body.roleKey, 30);
        if (BUILT_IN_ROLES.includes(roleKey) || !(await db.get('SELECT 1 FROM roles WHERE key = ?', [roleKey]))) {
            return error('Choose a custom role for this account');
        }
    }
    await db.run(
        `UPDATE users SET full_name = COALESCE(?, full_name), email = COALESCE(?, email), role = ?, updated_at = now() WHERE id = ?`,
        [clampStr(body.fullName, 100) || null, body.email !== undefined ? clampStr(body.email, 120) : null, roleKey, staff.id],
    );
    if (roleKey !== staff.role) await revokeUserSessions(staff.id);
    return json({ success: true });
}

export async function POST(request, { params }) {
    const { response } = requirePermission(request, 'staff.manage');
    if (response) return response;
    const staff = await findStaff(parseId((await params).id));
    if (!staff) return error('Staff account not found', 404);
    const body = await readJson(request);
    const ctx = { username: staff.username, userId: staff.id, ip: clientIp(request), ua: userAgent(request) };

    if (body?.action === 'reset-password') {
        const password = generateTempPassword();
        await db.run('UPDATE users SET password_hash = ?, must_change_password = TRUE, updated_at = now() WHERE id = ?',
            [await hashPassword(password), staff.id]);
        await revokeUserSessions(staff.id);
        await recordEvent('password_reset_by_admin', ctx);
        return json({ success: true, password });
    }
    if (body?.action === 'reset-2fa') {
        await db.run('UPDATE users SET two_factor_secret = NULL, two_factor_last_step = NULL, updated_at = now() WHERE id = ?', [staff.id]);
        await revokeUserSessions(staff.id);
        await recordEvent('2fa_reset_by_admin', ctx);
        return json({ success: true });
    }
    return error('Unknown action');
}

export async function DELETE(request, { params }) {
    const { response } = requirePermission(request, 'staff.manage');
    if (response) return response;
    const staff = await findStaff(parseId((await params).id));
    if (!staff) return error('Staff account not found', 404);
    await db.run('DELETE FROM users WHERE id = ?', [staff.id]);
    return json({ success: true });
}
