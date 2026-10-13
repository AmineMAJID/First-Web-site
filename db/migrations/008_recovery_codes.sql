-- 2FA recovery codes: printed once by the user, stored as SHA-256 hashes, each usable once.
CREATE TABLE recovery_codes (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash   TEXT NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, code_hash)
);
CREATE INDEX idx_recovery_codes_user ON recovery_codes(user_id) WHERE used_at IS NULL;
