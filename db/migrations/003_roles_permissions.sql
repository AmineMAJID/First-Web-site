-- Roles and permissions.
-- Roles: the built-in ones (admin, teacher, student) plus any role the admin creates.
-- Permissions granted to a role are rows in role_permissions. The feature catalog
-- (lib/permissions.js) is the source of truth for permission keys.

CREATE TABLE roles (
    key            TEXT PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{1,29}$'),
    label          TEXT NOT NULL,
    is_system      BOOLEAN NOT NULL DEFAULT FALSE,   -- built-in roles cannot be deleted
    requires_2fa   BOOLEAN NOT NULL DEFAULT TRUE,    -- 2FA enrolment mandatory for this role
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO roles (key, label, is_system, requires_2fa) VALUES
    ('admin',   'Administrateur', TRUE, TRUE),
    ('teacher', 'Enseignant',     TRUE, TRUE),
    ('student', 'Élève',          TRUE, FALSE);

CREATE TABLE role_permissions (
    role_key        TEXT NOT NULL REFERENCES roles(key) ON DELETE CASCADE,
    permission_key  TEXT NOT NULL,
    PRIMARY KEY (role_key, permission_key)
);

-- Existing accounts keep their role; the CHECK constraint is replaced by a foreign key
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_fk FOREIGN KEY (role) REFERENCES roles(key);

-- Defaults reproduce the previous behaviour of the application
INSERT INTO role_permissions (role_key, permission_key) VALUES
    ('teacher', 'home.teacher'),
    ('teacher', 'students.view'),
    ('teacher', 'grades.record'),
    ('teacher', 'attendance.record'),
    ('teacher', 'schedule.view'),
    ('teacher', 'messages.view'),
    ('teacher', 'messages.send'),
    ('student', 'home.student'),
    ('student', 'grades.view_own'),
    ('student', 'attendance.view_own'),
    ('student', 'schedule.view'),
    ('student', 'messages.view');
