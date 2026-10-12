-- Only one administrator account may ever exist. Enforced by the database itself,
-- so no code path (CLI, API, race condition) can create a second one.
CREATE UNIQUE INDEX one_admin_only ON users ((role)) WHERE role = 'admin';
