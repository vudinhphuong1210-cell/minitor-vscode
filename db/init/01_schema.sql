-- ============================================================
-- EDU MONITOR – Database Schema
-- ============================================================

-- Extension để tạo UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users (sinh viên + giảng viên) ──────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT UNIQUE NOT NULL,
    display_name  TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('student', 'instructor', 'admin')),
    ai_level      SMALLINT NOT NULL DEFAULT 0 CHECK (ai_level BETWEEN 0 AND 5), -- APLCS level
    token_quota   INTEGER NOT NULL DEFAULT 10000,  -- token còn lại trong ngày
    quota_reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 day',
    hardware_fingerprint TEXT,                     -- Hardware fingerprinting
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Sessions (mỗi lần mở VS Code) ───────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hardware_fp     TEXT NOT NULL,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at        TIMESTAMPTZ,
    last_chain_hash TEXT,                          -- hash cuối cùng trong chuỗi
    is_tampered     BOOLEAN NOT NULL DEFAULT FALSE
);

-- ── Event Log (keystroke, paste, cursor jump, ...) ──────────
CREATE TABLE IF NOT EXISTS events (
    id            BIGSERIAL PRIMARY KEY,
    session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type    TEXT NOT NULL,                   -- 'keystroke'|'paste'|'cursor_jump'|'ai_accept'|'explanation_gate'
    payload       JSONB NOT NULL DEFAULT '{}',
    chain_hash    TEXT NOT NULL,                   -- SHA-256 hash của event này + hash trước
    prev_hash     TEXT,                            -- hash của event trước (chain integrity)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_user    ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_type    ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_time    ON events(created_at DESC);

-- ── Suspicion Scores (tính toán định kỳ) ────────────────────
CREATE TABLE IF NOT EXISTS suspicion_scores (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id      UUID REFERENCES sessions(id) ON DELETE SET NULL,
    keypress_entropy        NUMERIC(5,3),          -- KE: độ biến thiên nhịp gõ
    code_jump_magnitude     NUMERIC(10,2),         -- CJM: tổng khoảng nhảy cursor
    modification_ratio      NUMERIC(5,3),          -- MR: tỷ lệ sửa đổi sau AI suggest
    explanation_gate_score  NUMERIC(5,3),          -- EGS: điểm vấn đáp
    composite_score         NUMERIC(5,3),          -- điểm tổng hợp 0-1
    flagged                 BOOLEAN NOT NULL DEFAULT FALSE,
    computed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scores_user ON suspicion_scores(user_id);

-- ── Explanation Gate (lịch sử vấn đáp) ─────────────────────
CREATE TABLE IF NOT EXISTS explanation_gates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    code_snippet    TEXT NOT NULL,                 -- đoạn code bị chặn
    question        TEXT NOT NULL,                 -- câu hỏi AI tạo ra
    student_answer  TEXT,
    judge_score     NUMERIC(5,3),                  -- 0-1, do LLM-as-Judge chấm
    judge_feedback  TEXT,
    passed          BOOLEAN,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    answered_at     TIMESTAMPTZ
);

-- ── AI Gateway Log ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_gateway_log (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id      UUID REFERENCES sessions(id) ON DELETE SET NULL,
    model           TEXT NOT NULL,
    prompt_tokens   INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens    INTEGER NOT NULL DEFAULT 0,
    socratic_injected BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_log_user ON ai_gateway_log(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_log_time ON ai_gateway_log(created_at DESC);

-- ── Seed: tài khoản admin mặc định ──────────────────────────
INSERT INTO users (email, display_name, role, ai_level)
VALUES ('admin@edu.local', 'Administrator', 'admin', 5)
ON CONFLICT (email) DO NOTHING;
