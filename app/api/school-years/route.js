// School years API – GET (list with terms), POST (create: Sept to Aug, with Term 1-3)
import { db, tx } from '@/lib/db';
import { json, error, readJson, requirePermission, parseId } from '@/lib/api';

const YEARS_SQL = `
    SELECT y.id, y.label, y.starts_on AS "startsOn", y.ends_on AS "endsOn", y.is_current AS "isCurrent",
           (SELECT COUNT(*) FROM classes c WHERE c.school_year_id = y.id) AS "classCount"
    FROM school_years y ORDER BY y.starts_on DESC`;

export async function GET(request) {
    const { response } = requirePermission(request, 'classes.manage');
    if (response) return response;
    const years = await db.all(YEARS_SQL);
    const terms = await db.all('SELECT school_year_id, name, position FROM terms ORDER BY position');
    return json(years.map((y) => ({ ...y, terms: terms.filter((t) => t.school_year_id === y.id) })));
}

// Body: { startYear: 2027, copyClassesFrom?: schoolYearId }. Creates 2027-2028 and its terms.
// With copyClassesFrom, classes, head teachers and teaching assignments are copied too.
export async function POST(request) {
    const { response } = requirePermission(request, 'classes.manage');
    if (response) return response;
    const body = await readJson(request);
    const startYear = Number(body?.startYear);
    if (!Number.isInteger(startYear) || startYear < 2000 || startYear > 2100) return error('Invalid start year');
    const label = `${startYear}-${startYear + 1}`;
    const copyFrom = body.copyClassesFrom ? parseId(body.copyClassesFrom) : null;
    if (body.copyClassesFrom && !copyFrom) return error('Invalid school year to copy from');
    try {
        const id = await tx(async (t) => {
            const row = await t.get(
                `INSERT INTO school_years (label, starts_on, ends_on, is_current)
                 VALUES (?, ?, ?, FALSE) RETURNING id`,
                [label, `${startYear}-09-01`, `${startYear + 1}-08-31`],
            );
            await t.run(`INSERT INTO terms (school_year_id, name, position) VALUES (?, 'Term 1', 1), (?, 'Term 2', 2), (?, 'Term 3', 3)`,
                [row.id, row.id, row.id]);
            if (copyFrom) {
                // Same class names and levels, without students (they are assigned again for the new year)
                // Same class names, levels and head teachers, without students (they are assigned again)
                await t.run(`INSERT INTO classes (name, level, school_year_id, head_teacher_id)
                             SELECT name, level, ?, head_teacher_id FROM classes WHERE school_year_id = ?`, [row.id, copyFrom]);
                await t.run(`INSERT INTO teaching_assignments (teacher_id, class_id, subject)
                             SELECT ta.teacher_id, nc.id, ta.subject
                             FROM teaching_assignments ta
                             JOIN classes oc ON oc.id = ta.class_id AND oc.school_year_id = ?
                             JOIN classes nc ON nc.name = oc.name AND nc.school_year_id = ?`, [copyFrom, row.id]);
            }
            return row.id;
        });
        return json({ success: true, id, label }, 201);
    } catch (e) {
        if (e.code === '23505') return error('This school year already exists', 409);
        throw e;
    }
}
