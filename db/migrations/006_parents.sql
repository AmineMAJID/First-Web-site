-- Families: a parent account is linked to one or more students (a parent with several children
-- sees them together). Parent accounts require 2FA by default (roles.requires_2fa, editable).

INSERT INTO roles (key, label, is_system, requires_2fa) VALUES ('parent', 'Parent', TRUE, TRUE);

CREATE TABLE parent_links (
    parent_user_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_id      BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    relation        TEXT NOT NULL DEFAULT 'Parent' CHECK (length(btrim(relation)) BETWEEN 1 AND 40),
    PRIMARY KEY (parent_user_id, student_id)
);
CREATE INDEX idx_parent_links_student ON parent_links(student_id);

INSERT INTO role_permissions (role_key, permission_key) VALUES
    ('parent', 'home.parent'),
    ('parent', 'children.view'),
    ('parent', 'schedule.view'),
    ('parent', 'messages.view'),
    ('parent', 'messages.send');
