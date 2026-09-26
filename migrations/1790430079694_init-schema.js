/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {(() => void) | undefined}
 * @returns {Promise<void> | void}
 */
export async function up(pgm) {
  pgm.sql(`
    CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email varchar(255) UNIQUE NOT NULL,
      password_hash varchar(255) NOT NULL,
      full_name varchar(100) NULL,
      role varchar(20) NOT NULL DEFAULT 'user',
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_users_role CHECK (role IN ('user', 'admin'))
    );

    CREATE TABLE api_keys (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      name varchar(100) NOT NULL,
      key_hash varchar(255) UNIQUE NOT NULL,
      key_prefix varchar(12) NOT NULL,
      rate_limit_per_min int NOT NULL DEFAULT 60,
      last_used_at timestamptz NULL,
      expires_at timestamptz NULL,
      revoked_at timestamptz NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE conversations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      title varchar(255) NULL,
      default_model varchar(50) NULL,
      system_prompt text NULL,
      is_archived boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role varchar(20) NOT NULL,
      content text NOT NULL,
      finish_reason varchar(30) NULL,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT chk_messages_role CHECK (role IN ('system', 'user', 'assistant'))
    );

    CREATE TABLE ai_requests (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      api_key_id uuid NULL REFERENCES api_keys(id) ON DELETE RESTRICT,
      conversation_id uuid NULL REFERENCES conversations(id) ON DELETE RESTRICT,
      message_id uuid NULL UNIQUE REFERENCES messages(id) ON DELETE RESTRICT,
      request_id varchar(64) UNIQUE NOT NULL,
      endpoint varchar(50) NOT NULL,
      provider varchar(50) NOT NULL,
      model varchar(50) NOT NULL,
      is_fallback boolean NOT NULL DEFAULT false,
      is_cached boolean NOT NULL DEFAULT false,
      input_tokens int NOT NULL DEFAULT 0,
      output_tokens int NOT NULL DEFAULT 0,
      total_tokens int GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
      cost_usd numeric(10,6) NOT NULL DEFAULT 0,
      latency_ms int NOT NULL,
      retry_count int NOT NULL DEFAULT 0,
      status varchar(20) NOT NULL,
      error_code varchar(50) NULL,
      error_message text NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_ai_requests_status CHECK (status IN ('success', 'error')),
      CONSTRAINT chk_ai_requests_endpoint CHECK (endpoint IN ('chat', 'analyze')),
      CONSTRAINT chk_ai_requests_non_negative CHECK (
        input_tokens >= 0 AND output_tokens >= 0 AND latency_ms >= 0 AND retry_count >= 0 AND cost_usd >= 0
      ),
      CONSTRAINT chk_ai_requests_error_code CHECK ((status = 'error') = (error_code IS NOT NULL))
    );

    CREATE TABLE model_pricing (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      provider varchar(50) NOT NULL,
      model varchar(50) NOT NULL,
      input_price_per_1k numeric(10,6) NOT NULL,
      output_price_per_1k numeric(10,6) NOT NULL,
      effective_from timestamptz NOT NULL DEFAULT now(),
      is_active boolean NOT NULL DEFAULT true,
      CONSTRAINT uq_model_pricing UNIQUE (provider, model, effective_from)
    );

    CREATE INDEX idx_api_keys_user_revoked ON api_keys (user_id, revoked_at);
    CREATE INDEX idx_conversations_user_archived_updated ON conversations (user_id, is_archived, updated_at);
    CREATE INDEX idx_messages_conversation_created ON messages (conversation_id, created_at);
    CREATE INDEX idx_ai_requests_user_created ON ai_requests (user_id, created_at);
    CREATE INDEX idx_ai_requests_conversation ON ai_requests (conversation_id);
  `);
}

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {(() => void) | undefined}
 * @returns {Promise<void> | void}
 */
export async function down(pgm) {
  pgm.sql(`
    DROP TABLE IF EXISTS model_pricing CASCADE;
    DROP TABLE IF EXISTS ai_requests CASCADE;
    DROP TABLE IF EXISTS messages CASCADE;
    DROP TABLE IF EXISTS conversations CASCADE;
    DROP TABLE IF EXISTS api_keys CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
  `);
}
