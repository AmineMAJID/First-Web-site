// GET /api/roles – all roles with their permissions (admin only)
// POST /api/roles – create a custom role { label, requiresTwoFactor, permissions[] }
import { db, tx } from '@/lib/db';
import { json, error, readJson, requirePermission, clampStr } from '@/lib/api';
import { permissionsFor, FEATURES } from '@/lib/permissions';
import { uniqueRoleKey, validatePermissions } from '@/lib/roles';

export async function GET(request) {
    const { response } = requirePermission(request, 'roles.manage');
    if (response) return response;

    const roles = await db.all(`
        SELECT r.key, r.label, r.is_system, r.requires_2fa,
               (SELECT COUNT(*) FROM users u WHERE u.role = r.key)::int AS user_count,
               COALESCE((SELECT array_agg(rp.permission_key ORDER BY rp.permission_key)
                           FROM role_permissions rp WHERE rp.role_key = r.key), ARRAY[]::text[]) AS granted
          FROM roles r ORDER BY r.is_system DESC, r.label`);

    return json({
        roles: roles.map((r) => ({
            key: r.key,
            label: r.label,
            isSystem: r.is_system,
            locked: r.key === 'admin',
            requiresTwoFactor: r.requires_2fa,
            userCount: r.user_count,
            // Effective permissions (the administrator role always has its full set)
            permissions: permissionsFor(r.key, r.granted),
        })),
        features: FEATURES.map((f) => ({
            key: f.key,
            group: f.group,
            label: f.label,
            locked: f.locked || null,
            excludeRoles: f.excludeRoles || [],
            alwaysOn: !!f.alwaysOn,
        })),
    });
}

export async function POST(request) {
    const { response } = requirePermission(request, 'roles.manage');
    if (response) return response;

    const body = await readJson(request);
    const label = clampStr(body?.label, 60);
    if (!label) return error('Role name is required');
    const check = validatePermissions(body?.permissions ?? []);
    if (!check.ok) return error(`Unknown or locked permissions: ${check.invalid.join(', ')}`);
    if (await db.get('SELECT 1 FROM roles WHERE LOWER(label) = LOWER(?)', [label])) return error('A role with this name already exists', 409);

    const key = await uniqueRoleKey(label);
    await tx(async (t) => {
        await t.run('INSERT INTO roles (key, label, is_system, requires_2fa) VALUES (?, ?, FALSE, ?)',
            [key, label, body?.requiresTwoFactor !== false]);
        for (const p of [...new Set(body?.permissions ?? [])]) {
            await t.run('INSERT INTO role_permissions (role_key, permission_key) VALUES (?, ?)', [key, p]);
        }
    });
    return json({ success: true, key }, 201);
}
