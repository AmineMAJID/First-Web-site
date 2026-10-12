// PUT /api/roles/[key] – change label, 2FA requirement and permissions (takes effect immediately)
// DELETE /api/roles/[key] – delete a custom role that has no accounts
import { db, tx } from '@/lib/db';
import { json, error, readJson, requirePermission, clampStr } from '@/lib/api';
import { validatePermissions } from '@/lib/roles';

const LOCKED_ROLE = 'admin';

async function findRole(key) {
    return db.get('SELECT * FROM roles WHERE key = ?', [key]);
}

export async function PUT(request, { params }) {
    const { response } = requirePermission(request, 'roles.manage');
    if (response) return response;
    const { key } = await params;
    if (key === LOCKED_ROLE) return error('The administrator role is locked', 403);

    const role = await findRole(key);
    if (!role) return error('Role not found', 404);

    const body = await readJson(request);
    if (!body) return error('Invalid body');

    const label = body.label !== undefined ? clampStr(body.label, 60) : role.label;
    if (!label) return error('Role name is required');
    if (label !== role.label && await db.get('SELECT 1 FROM roles WHERE LOWER(label) = LOWER(?) AND key != ?', [label, key])) {
        return error('A role with this name already exists', 409);
    }
    const requiresTwoFactor = body.requiresTwoFactor !== undefined ? body.requiresTwoFactor !== false : role.requires_2fa;

    let permissions = null;
    if (body.permissions !== undefined) {
        const check = validatePermissions(body.permissions);
        if (!check.ok) return error(`Unknown or locked permissions: ${check.invalid.join(', ')}`);
        permissions = [...new Set(body.permissions)];
    }

    await tx(async (t) => {
        await t.run('UPDATE roles SET label = ?, requires_2fa = ? WHERE key = ?', [label, requiresTwoFactor, key]);
        if (permissions) {
            await t.run('DELETE FROM role_permissions WHERE role_key = ?', [key]);
            for (const p of permissions) {
                await t.run('INSERT INTO role_permissions (role_key, permission_key) VALUES (?, ?)', [key, p]);
            }
        }
    });
    return json({ success: true });
}

export async function DELETE(request, { params }) {
    const { response } = requirePermission(request, 'roles.manage');
    if (response) return response;
    const { key } = await params;
    const role = await findRole(key);
    if (!role) return error('Role not found', 404);
    if (role.is_system) return error('Built-in roles cannot be deleted', 403);
    const inUse = await db.get('SELECT COUNT(*)::int AS c FROM users WHERE role = ?', [key]);
    if (inUse.c > 0) return error('This role is still assigned to accounts. Move them to another role first.', 409);
    await db.run('DELETE FROM roles WHERE key = ?', [key]);
    return json({ success: true });
}
