// Which students a session may see or change.
// Only the built-in `teacher` role is restricted: an admin or a custom role keeps the permissions granted to it.
//   visibleClassIds(session)      -> null (no restriction) or the class ids the teacher can see
//   gradableSubjects(session, id) -> null (no restriction) or the subjects the teacher teaches in that class
//   attendanceAllowed(session, id)-> true when the teacher teaches in the class or is its head teacher
import { db } from './db.js';

const teacherRow = (session) => db.get('SELECT id FROM teachers WHERE user_id = ?', [session.id]);

export async function visibleClassIds(session) {
    if (session.role !== 'teacher') return null;
    const teacher = await teacherRow(session);
    if (!teacher) return [];
    const rows = await db.all(`
        SELECT DISTINCT c.id FROM classes c
        JOIN school_years y ON y.id = c.school_year_id AND y.is_current
        WHERE c.head_teacher_id = ?
           OR c.id IN (SELECT class_id FROM teaching_assignments WHERE teacher_id = ?)`, [teacher.id, teacher.id]);
    return rows.map((r) => r.id);
}

export async function gradableSubjects(session, classId) {
    if (session.role !== 'teacher') return null;
    const teacher = await teacherRow(session);
    if (!teacher) return new Set();
    const rows = await db.all('SELECT subject FROM teaching_assignments WHERE teacher_id = ? AND class_id = ?', [teacher.id, classId]);
    return new Set(rows.map((r) => r.subject));
}

export async function attendanceAllowed(session, classId) {
    const ids = await visibleClassIds(session);
    return ids === null || (classId != null && ids.includes(classId));
}

// Students whose class is outside the session's scope (for write checks)
export async function studentClassesById(ids) {
    if (!ids.length) return new Map();
    const rows = await db.all('SELECT id, class_id FROM students WHERE id = ANY(?)', [ids]);
    return new Map(rows.map((r) => [r.id, r.class_id]));
}
