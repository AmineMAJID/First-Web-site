-- Initial PostgreSQL schema for the student portal.
-- Applied by `npm run db:migrate` (tracked in the schema_migrations table).

CREATE TABLE users (
    id                    BIGSERIAL PRIMARY KEY,
    username              TEXT UNIQUE NOT NULL CHECK (username = lower(username) AND username ~ '^[a-z0-9._-]{1,32}$'),
    password_hash         TEXT NOT NULL,                       -- argon2id, never the plain password
    role                  TEXT NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
    full_name             TEXT NOT NULL,
    email                 TEXT,
    avatar                TEXT,
    two_factor_secret     TEXT,                                 -- TOTP secret, AES-256-GCM encrypted (NULL = not enrolled)
    two_factor_last_step  BIGINT,                               -- last accepted TOTP time step (anti-replay)
    must_change_password  BOOLEAN NOT NULL DEFAULT FALSE,
    password_changed_at   TIMESTAMPTZ,
    last_login_at         TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE students (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_id      TEXT UNIQUE NOT NULL,
    date_of_birth   TEXT,
    gender          TEXT,
    phone           TEXT,
    address         TEXT,
    class_name      TEXT NOT NULL DEFAULT 'Class A',
    enrollment_date TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD'),
    parent_name     TEXT,
    parent_phone    TEXT
);

CREATE TABLE teachers (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    teacher_id   TEXT UNIQUE NOT NULL,
    subject      TEXT,
    phone        TEXT,
    department   TEXT NOT NULL DEFAULT 'General',
    hire_date    TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD')
);

CREATE TABLE grades (
    id           BIGSERIAL PRIMARY KEY,
    student_id   BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    teacher_id   BIGINT REFERENCES teachers(id) ON DELETE SET NULL,
    subject      TEXT NOT NULL,
    grade        NUMERIC(7,2) NOT NULL,
    max_grade    NUMERIC(7,2) NOT NULL DEFAULT 100,
    term         TEXT NOT NULL DEFAULT 'Term 1',
    remarks      TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (student_id, subject, term)
);

CREATE TABLE attendance (
    id           BIGSERIAL PRIMARY KEY,
    student_id   BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    date         TEXT NOT NULL,                                 -- YYYY-MM-DD
    status       TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
    recorded_by  BIGINT REFERENCES teachers(id) ON DELETE SET NULL,
    notes        TEXT,
    UNIQUE (student_id, date)
);

CREATE TABLE messages (
    id               BIGSERIAL PRIMARY KEY,
    sender_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id     BIGINT REFERENCES users(id) ON DELETE CASCADE,
    recipient_role   TEXT,
    subject          TEXT NOT NULL,
    body             TEXT NOT NULL,
    is_read          BOOLEAN NOT NULL DEFAULT FALSE,
    is_announcement  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE schedules (
    id           BIGSERIAL PRIMARY KEY,
    class_name   TEXT NOT NULL,
    subject      TEXT NOT NULL,
    teacher_id   BIGINT REFERENCES teachers(id) ON DELETE SET NULL,
    day_of_week  TEXT NOT NULL,
    start_time   TEXT NOT NULL,
    end_time     TEXT NOT NULL,
    room         TEXT
);

-- Read receipts for announcements (one row per user who read it)
CREATE TABLE message_reads (
    message_id  BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (message_id, user_id)
);

-- Server-side sessions. Only a SHA-256 hash of the cookie token is stored.
--   kind = 'full'  : logged-in session (cookie auth-token)
--   kind = 'mfa'   : password checked, waiting for the 2FA code (cookie mfa-token, 5 min)
CREATE TABLE sessions (
    id                  BIGSERIAL PRIMARY KEY,
    token_hash          TEXT UNIQUE NOT NULL,
    user_id             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind                TEXT NOT NULL CHECK (kind IN ('full', 'mfa')),
    pending_secret      TEXT,                                   -- encrypted TOTP secret during first enrollment
    ip                  TEXT,
    user_agent          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at          TIMESTAMPTZ NOT NULL
);

-- Audit trail for every authentication event (used for rate limiting and security review)
CREATE TABLE auth_events (
    id          BIGSERIAL PRIMARY KEY,
    event       TEXT NOT NULL,        -- login_ok, login_failed, login_locked, mfa_ok, mfa_failed, logout, password_changed, 2fa_enrolled, 2fa_reset, admin_created ...
    username    TEXT,
    user_id     BIGINT,
    ip          TEXT,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_grades_student ON grades(student_id);
CREATE INDEX idx_attendance_student_date ON attendance(student_id, date);
CREATE INDEX idx_messages_recipient ON messages(recipient_id);
CREATE INDEX idx_schedules_class ON schedules(class_name);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE INDEX idx_auth_events_user_time ON auth_events(username, created_at);
CREATE INDEX idx_auth_events_ip_time ON auth_events(ip, created_at);
