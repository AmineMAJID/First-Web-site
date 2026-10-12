-- School years, terms and classes.
-- A class belongs to one school year. Students point to a class (class_id); students.class_name is
-- kept as a copy of the class name by triggers, so older reads keep working.

CREATE TABLE school_years (
    id          BIGSERIAL PRIMARY KEY,
    label       TEXT UNIQUE NOT NULL CHECK (label ~ '^[0-9]{4}-[0-9]{4}$'),
    starts_on   DATE NOT NULL,
    ends_on     DATE NOT NULL CHECK (ends_on > starts_on),
    is_current  BOOLEAN NOT NULL DEFAULT FALSE
);
-- Only one school year can be the current one
CREATE UNIQUE INDEX one_current_school_year ON school_years (is_current) WHERE is_current;

CREATE TABLE terms (
    id              BIGSERIAL PRIMARY KEY,
    school_year_id  BIGINT NOT NULL REFERENCES school_years(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    position        INTEGER NOT NULL,
    UNIQUE (school_year_id, name),
    UNIQUE (school_year_id, position)
);

CREATE TABLE classes (
    id              BIGSERIAL PRIMARY KEY,
    name            TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 50),
    level           TEXT,
    school_year_id  BIGINT NOT NULL REFERENCES school_years(id) ON DELETE CASCADE,
    head_teacher_id BIGINT REFERENCES teachers(id) ON DELETE SET NULL,
    UNIQUE (school_year_id, name)
);

ALTER TABLE students ADD COLUMN class_id BIGINT REFERENCES classes(id) ON DELETE SET NULL;
ALTER TABLE students ALTER COLUMN class_name DROP NOT NULL;
ALTER TABLE students ALTER COLUMN class_name DROP DEFAULT;

-- Keep students.class_name equal to the class name
CREATE FUNCTION sync_student_class_name() RETURNS trigger AS $$
BEGIN
    NEW.class_name := (SELECT name FROM classes WHERE id = NEW.class_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER students_class_name_sync
    BEFORE INSERT OR UPDATE OF class_id ON students
    FOR EACH ROW EXECUTE FUNCTION sync_student_class_name();

-- Renaming a class renames it for its students and its timetable slots
CREATE FUNCTION sync_class_rename() RETURNS trigger AS $$
BEGIN
    UPDATE students SET class_name = NEW.name WHERE class_id = NEW.id;
    UPDATE schedules SET class_name = NEW.name WHERE class_name = OLD.name;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER classes_rename_sync
    AFTER UPDATE OF name ON classes
    FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name)
    EXECUTE FUNCTION sync_class_rename();

-- Backfill: create the current school year (Sept to Aug), its terms, and one class per existing class name
DO $$
DECLARE
    y INTEGER := EXTRACT(YEAR FROM now())::INTEGER;
    cy BIGINT;
BEGIN
    IF EXTRACT(MONTH FROM now()) < 8 THEN y := y - 1; END IF;
    INSERT INTO school_years (label, starts_on, ends_on, is_current)
    VALUES (y || '-' || (y + 1), make_date(y, 9, 1), make_date(y + 1, 8, 31), TRUE)
    RETURNING id INTO cy;
    INSERT INTO terms (school_year_id, name, position) VALUES (cy, 'Term 1', 1), (cy, 'Term 2', 2), (cy, 'Term 3', 3);
    INSERT INTO classes (name, school_year_id)
        SELECT DISTINCT btrim(class_name), cy FROM students WHERE btrim(class_name) <> ''
        UNION
        SELECT DISTINCT btrim(class_name), cy FROM schedules WHERE btrim(class_name) <> '';
    UPDATE students s SET class_id = c.id FROM classes c
        WHERE c.school_year_id = cy AND c.name = btrim(s.class_name);
END;
$$;

-- Grades and attendance belong to a school year. Existing rows are attached to the current year.
ALTER TABLE grades ADD COLUMN school_year_id BIGINT REFERENCES school_years(id);
ALTER TABLE attendance ADD COLUMN school_year_id BIGINT REFERENCES school_years(id);
UPDATE grades SET school_year_id = (SELECT id FROM school_years WHERE is_current);
UPDATE attendance SET school_year_id = (SELECT id FROM school_years WHERE is_current);
ALTER TABLE grades ALTER COLUMN school_year_id SET NOT NULL;
ALTER TABLE attendance ALTER COLUMN school_year_id SET NOT NULL;
ALTER TABLE grades DROP CONSTRAINT grades_student_id_subject_term_key;
ALTER TABLE grades ADD CONSTRAINT grades_one_per_subject_term_year UNIQUE (student_id, subject, term, school_year_id);
CREATE INDEX idx_attendance_year ON attendance(school_year_id);
