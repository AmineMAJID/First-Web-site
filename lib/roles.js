// Shared helpers for role and staff management (used by the /api/roles and /api/staff routes)
import { db } from './db.js';
import { BUILT_IN_ROLES, isGrantable } from './permissions.js';

// Turns a label into a role key: lowercase ascii letters, digits, underscore, 2 to 30 chars
export async function uniqueRoleKey(label) {
    const base = label
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
        .replace(/^[^a-z]+/, '').slice(0, 26) || 'role';
    const stem = base.length >= 2 ? base : `${base}_r`;
    let key = stem;
    let n = 2;
    while (BUILT_IN_ROLES.includes(key) || await db.get('SELECT 1 FROM roles WHERE key = ?', [key])) {
        key = `${stem}_${n++}`;
    }
    return key;
}

// Validates a list of permission keys sent by the client. Returns { ok, invalid }.
export function validatePermissions(list) {
    if (!Array.isArray(list)) return { ok: false, invalid: ['permissions'] };
    const invalid = [...new Set(list.filter((k) => !isGrantable(k)))];
    return { ok: invalid.length === 0, invalid: invalid.map(String) };
}
