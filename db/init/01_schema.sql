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
    password_hash   TEXT,                          -- Hashed password (bcrypt)
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,   -- Khóa tài khoản
    last_login_at TIMESTAMPTZ,                     -- Lần đăng nhập cuối
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index để tăng tốc query
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active) WHERE is_active = TRUE;

-- ── Sessions (mỗi lần mở VS Code) ───────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hardware_fp     TEXT NOT NULL,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at        TIMESTAMPTZ,
    last_chain_hash TEXT,                          -- hash cuối cùng trong chuỗi
    is_tampered     BOOLEAN NOT NULL DEFAULT FALSE,
    event_count     INTEGER NOT NULL DEFAULT 0,    -- Đếm số event trong session
    duration_seconds INTEGER,                      -- Thời lượng session (tính khi ended_at)
    ip_address      INET,                          -- IP address của session
    user_agent      TEXT                           -- VS Code version info
);

-- Index để query session theo user và thời gian
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_tampered ON sessions(is_tampered) WHERE is_tampered = TRUE;
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(user_id) WHERE ended_at IS NULL;

-- ── Event Log (keystroke, paste, cursor jump, ...) ──────────
CREATE TABLE IF NOT EXISTS events (
    id            BIGSERIAL PRIMARY KEY,
    session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type    TEXT NOT NULL,                   -- 'keystroke'|'paste'|'cursor_jump'|'ai_accept'|'explanation_gate'
    payload       JSONB NOT NULL DEFAULT '{}',
    file_source   TEXT,                            -- File đang làm việc khi event xảy ra (vd: src/main.js)
    chain_hash    TEXT NOT NULL,                   -- SHA-256 hash của event này + hash trước
    prev_hash     TEXT,                            -- hash của event trước (chain integrity)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_user    ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_type    ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_time    ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_file    ON events(file_source) WHERE file_source IS NOT NULL;

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
    reviewed_by     UUID REFERENCES users(id) ON DELETE SET NULL, -- Giảng viên đã review
    review_notes    TEXT,                          -- Ghi chú của giảng viên
    review_status   TEXT CHECK (review_status IN ('pending', 'confirmed', 'false_positive')),
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scores_user ON suspicion_scores(user_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_scores_flagged ON suspicion_scores(flagged, computed_at DESC) WHERE flagged = TRUE;
CREATE INDEX IF NOT EXISTS idx_scores_session ON suspicion_scores(session_id);
CREATE INDEX IF NOT EXISTS idx_scores_review ON suspicion_scores(review_status) WHERE review_status = 'pending';

-- ── Explanation Gate (lịch sử vấn đáp) ─────────────────────
CREATE TABLE IF NOT EXISTS explanation_gates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    code_snippet    TEXT NOT NULL,                 -- đoạn code bị chặn
    file_source     TEXT,                          -- File nguồn của code snippet
    question        TEXT NOT NULL,                 -- câu hỏi AI tạo ra
    student_answer  TEXT,
    judge_score     NUMERIC(5,3),                  -- 0-1, do LLM-as-Judge chấm
    judge_feedback  TEXT,
    passed          BOOLEAN,
    attempt_count   INTEGER NOT NULL DEFAULT 1,    -- Số lần thử
    time_to_answer  INTEGER,                       -- Thời gian trả lời (giây)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    answered_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_gates_user ON explanation_gates(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gates_session ON explanation_gates(session_id);
CREATE INDEX IF NOT EXISTS idx_gates_passed ON explanation_gates(passed, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gates_file ON explanation_gates(file_source) WHERE file_source IS NOT NULL;

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
    request_type    TEXT,                          -- 'completion', 'chat', 'embedding'
    file_source     TEXT,                          -- File đang làm việc khi gọi AI
    prompt_input    TEXT,                          -- Nội dung prompt gửi đi (full text)
    prompt_output   TEXT,                          -- Nội dung response nhận về (full text)
    response_time_ms INTEGER,                      -- Thời gian phản hồi (ms)
    error_message   TEXT,                          -- Lỗi nếu có
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_log_user ON ai_gateway_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_log_session ON ai_gateway_log(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_log_time ON ai_gateway_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_log_model ON ai_gateway_log(model, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_log_file ON ai_gateway_log(file_source) WHERE file_source IS NOT NULL;

-- ── Seed: tài khoản mặc định (password: admin1234) ──────────
INSERT INTO users (email, display_name, role, ai_level, password_hash)
VALUES 
    ('admin@edu.local', 'Administrator', 'admin', 5, '$2a$10$dy1YcPTWhxNhyzaB4kBfpeuqkbbRTjks01uHhwJ3iBHeFj5sbWjiu'),
    ('student@edu.local', 'Mẫu Sinh Viên', 'student', 0, '$2a$10$dy1YcPTWhxNhyzaB4kBfpeuqkbbRTjks01uHhwJ3iBHeFj5sbWjiu'),
    ('instructor@edu.local', 'Mẫu Giảng Viên', 'instructor', 0, '$2a$10$dy1YcPTWhxNhyzaB4kBfpeuqkbbRTjks01uHhwJ3iBHeFj5sbWjiu')
ON CONFLICT (email) DO UPDATE SET 
    password_hash = EXCLUDED.password_hash,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    ai_level = EXCLUDED.ai_level;
