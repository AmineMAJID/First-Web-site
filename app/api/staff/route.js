// Staff accounts: users whose role is a custom role (not admin / teacher / student).
// GET /api/staff – list (staff.manage)
// POST /api/staff { fullName, email, roleKey } – create an account with a temporary password (shown once)
import { db } from '@/lib/db';
import { hashPassword, generateTempPassword } from '@/lib/password';
import { json, error, readJson, requirePermission, uniqueUsername, clampStr } from '@/lib/api';
import { BUILT_IN_ROLES } from '@/lib/permissions';

export async function GET(request) {
    const { response } = requirePermission(request, 'staff.manage');
    if (response) return response;
    const rows = await db.all(
        `SELECT u.id, u.username, u.full_name, u.email, u.role, r.label AS role_label,
                u.two_factor_secret IS NOT NULL AS has_2fa, u.must_change_password, u.last_login_at
           FROM users u JOIN roles r ON r.key = u.role
          WHERE u.role <> ALL(?::text[])
          ORDER BY u.full_name`,
        [BUILT_IN_ROLES],
    );
    return json(rows.map((u) => ({
        id: u.id,
        username: u.username,
        fullName: u.full_name,
        email: u.email,
        roleKey: u.role,
        roleLabel: u.role_label,
        has2fa: !!u.has_2fa,
        mustChangePassword: !!u.must_change_password,
        lastLoginAt: u.last_login_at,
    })));
}

export async function POST(request) {
    const { response } = requirePermission(request, 'staff.manage');
    if (response) return response;

    const body = await readJson(request);
    const fullName = clampStr(body?.fullName, 100);
    const roleKey = clampStr(body?.roleKey, 30);
    if (!fullName) return error('Full name is required');
    if (!roleKey || BUILT_IN_ROLES.includes(roleKey)) return error('Choose a custom role for this account');
    const role = await db.get('SELECT key FROM roles WHERE key = ?', [roleKey]);
    if (!role) return error('Unknown role', 400);

    const username = await uniqueUsername(fullName);
    const password = generateTempPassword();
    const u = await db.get(
        `INSERT INTO users (username, password_hash, role, full_name, email, must_change_password)
         VALUES (?, ?, ?, ?, ?, TRUE) RETURNING id`,
        [username, await hashPassword(password), roleKey, fullName, clampStr(body?.email, 120) || null],
    );
    return json({ success: true, staff: { id: u.id, username, password, fullName, roleKey } }, 201);
}
