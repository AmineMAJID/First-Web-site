// School years, terms and classes: shared lookups used by the API routes.
import { db } from './db.js';
import { clampStr, parseId } from './api.js';

// The school year marked as current (every new grade, attendance record and class belongs to it)
export const currentSchoolYear = () =>
    db.get(`SELECT id, label, to_char(starts_on, 'YYYY-MM-DD') AS starts_on, to_char(ends_on, 'YYYY-MM-DD') AS ends_on
            FROM school_years WHERE is_current`);

export const termsOf = (schoolYearId) =>
    db.all('SELECT id, name, position FROM terms WHERE school_year_id = ? ORDER BY position', [schoolYearId]);

// Resolve the class a student should belong to, from either an id (preferred) or a class name.
// Only classes of the current school year are accepted.
//   returns { provided: false }                 -> the request does not touch the class
//   returns { provided: true, classId: null }   -> the class is cleared
//   returns { provided: true, classId: n }      -> the class to assign
//   returns { provided: true, error: '...' }    -> unknown class
export async function resolveClassFor(body, yearId) {
    if (body?.classId !== undefined) {
        if (body.classId === null || body.classId === '') return { provided: true, classId: null };
        const id = parseId(body.classId);
        const row = id && (await db.get('SELECT id FROM classes WHERE id = ? AND school_year_id = ?', [id, yearId]));
        return row ? { provided: true, classId: row.id } : { provided: true, error: 'Unknown class for the current school year' };
    }
    if (body?.className !== undefined) {
        const name = clampStr(body.className, 50);
        if (!name) return { provided: true, classId: null };
        const row = await db.get('SELECT id FROM classes WHERE name = ? AND school_year_id = ?', [name, yearId]);
        return row ? { provided: true, classId: row.id } : { provided: true, error: `Class "${name}" does not exist for the current school year` };
    }
    return { provided: false };
}
