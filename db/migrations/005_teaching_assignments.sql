-- Teaching assignments: which teacher teaches which subject in which class (current or past school year).
-- A teacher with the built-in teacher role only sees and grades the students of these classes.
-- The head teacher of a class (classes.head_teacher_id) can also record attendance for it.

CREATE TABLE teaching_assignments (
    id          BIGSERIAL PRIMARY KEY,
    teacher_id  BIGINT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    class_id    BIGINT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    subject     TEXT NOT NULL CHECK (length(btrim(subject)) BETWEEN 1 AND 60),
    UNIQUE (teacher_id, class_id, subject)
);
CREATE INDEX idx_teaching_assignments_class ON teaching_assignments(class_id);

-- Backfill from the existing timetable: a teacher assigned to a class slot teaches that subject there
INSERT INTO teaching_assignments (teacher_id, class_id, subject)
SELECT DISTINCT sc.teacher_id, c.id, sc.subject
FROM schedules sc
JOIN classes c ON c.name = sc.class_name
JOIN school_years y ON y.id = c.school_year_id AND y.is_current
WHERE sc.teacher_id IS NOT NULL AND btrim(sc.subject) <> ''
ON CONFLICT (teacher_id, class_id, subject) DO NOTHING;
