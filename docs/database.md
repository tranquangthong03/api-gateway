# Database (PostgreSQL 16)

ERD: `images/erd.png` · DBML source: `schema.dbml` · Generated DDL: `schema.sql` (from `pg_dump`, do not edit).
This file is the approved spec for migrations.

## Tables
**users** — id uuid PK default gen_random_uuid() · email varchar(255) UNIQUE NOT NULL ·
password_hash varchar(255) NOT NULL (bcrypt) · full_name varchar(100) NULL ·
role varchar(20) NOT NULL default 'user' · is_active boolean NOT NULL default true ·
created_at, updated_at timestamptz NOT NULL default now()

**api_keys** — id uuid PK · user_id uuid NOT NULL FK users · name varchar(100) NOT NULL ·
key_hash varchar(255) UNIQUE NOT NULL (SHA-256) · key_prefix varchar(12) NOT NULL ·
rate_limit_per_min int NOT NULL default 60 · last_used_at, expires_at, revoked_at timestamptz NULL ·
created_at timestamptz NOT NULL default now()

**conversations** — id uuid PK · user_id uuid NOT NULL FK users · title varchar(255) NULL ·
default_model varchar(50) NULL (NULL = gateway default) · system_prompt text NULL ·
is_archived boolean NOT NULL default false · created_at, updated_at timestamptz NOT NULL default now()

**messages** — id uuid PK · conversation_id uuid NOT NULL FK conversations ·
role varchar(20) NOT NULL · content text NOT NULL · finish_reason varchar(30) NULL ·
created_at timestamptz NOT NULL default clock_timestamp() · insert-only

**ai_requests** — id uuid PK · user_id uuid NOT NULL FK users · api_key_id uuid NULL FK api_keys ·
conversation_id uuid NULL FK conversations · message_id uuid NULL UNIQUE FK messages (1-1) ·
request_id varchar(64) UNIQUE NOT NULL · endpoint varchar(50) NOT NULL · provider varchar(50) NOT NULL ·
model varchar(50) NOT NULL · is_fallback, is_cached boolean NOT NULL default false ·
input_tokens, output_tokens int NOT NULL default 0 · total_tokens (generated) ·
cost_usd numeric(10,6) NOT NULL default 0 · latency_ms int NOT NULL · retry_count int NOT NULL default 0 ·
status varchar(20) NOT NULL · error_code varchar(50) NULL · error_message text NULL ·
created_at timestamptz NOT NULL default now() · insert-only, single source of truth for usage

**model_pricing** — id uuid PK · provider varchar(50) NOT NULL · model varchar(50) NOT NULL ·
input_price_per_1k, output_price_per_1k numeric(10,6) NOT NULL (USD per 1K tokens) ·
effective_from timestamptz NOT NULL default now() · is_active boolean NOT NULL default true ·
UNIQUE (provider, model, effective_from)

## Migration requirements (all mandatory)
1. `total_tokens int GENERATED ALWAYS AS (input_tokens + output_tokens) STORED` — no DEFAULT, never written by code.
2. CHECK: `users.role IN ('user','admin')`; `messages.role IN ('system','user','assistant')`;
   `ai_requests.status IN ('success','error')`; `ai_requests.endpoint IN ('chat','analyze')`;
   `input_tokens, output_tokens, latency_ms, retry_count, cost_usd >= 0`;
   `(status = 'error') = (error_code IS NOT NULL)`.
3. Indexes, only these: `api_keys (user_id, revoked_at)`; `conversations (user_id, is_archived, updated_at)`;
   `messages (conversation_id, created_at)`; `ai_requests (user_id, created_at)`; `ai_requests (conversation_id)`.
   No extra index on columns that are already UNIQUE (`email`, `key_hash`, `request_id`, `message_id`).
4. Plain foreign keys (no DEFERRABLE). `messages.conversation_id ON DELETE CASCADE`; all others RESTRICT.
5. `updated_at` is set by the application on every update.
6. Seed `model_pricing` for the configured models using the providers' current pricing pages.

## Usage metrics (`GET /v1/usage`)
One aggregate query over `ai_requests`, filtered by `user_id` (unless admin) and `created_at` in `[from, to)`:
- `requests = COUNT(*)`
- `tokens = COALESCE(SUM(total_tokens), 0)`
- `average_latency_ms = ROUND(AVG(latency_ms))` — includes failed requests
- `error_rate = ROUND(AVG(CASE WHEN status = 'error' THEN 1.0 ELSE 0 END), 4)`
- `estimated_cost_usd = SUM(cost_usd)`; `by_model` = the same aggregates grouped by `model`

## Conversation history
Last 20 messages in chronological order: inner query `ORDER BY created_at DESC LIMIT 20`, outer query `ORDER BY created_at ASC`.

## Design decisions
- **`ai_requests` is the only source of token and cost data.** `messages` stores content only; the two are linked 1-1 by `message_id`.
- **No denormalized counters** on `conversations` (lost updates under concurrent requests); counts are computed with `COUNT`/`SUM`.
- **`status` is success/error only; the reason goes to `error_code`**, so `error_rate` counts timeouts correctly.
- **Gateway rate-limit rejections are not stored in `ai_requests`**: they never reached a provider, and would distort `error_rate`. They are visible in the app log.
- **One row per client request**, not per attempt: `retry_count` and `is_fallback` describe the attempts; per-attempt detail lives in the app log.
- **`user_id` is stored with `api_key_id`**: usage queries avoid a join, and JWT callers have no key.
- **API keys hashed with SHA-256, passwords with bcrypt**: keys are long random values, so a fast hash is safe and allows direct lookup; passwords are low-entropy and need a slow hash.
- **`revoked_at` / `expires_at` instead of `is_active`** on keys: records when and supports expiry.
- **`timestamptz` everywhere, `numeric` for money.**
- **`messages.created_at` uses `clock_timestamp()`** because `now()` is fixed per transaction; the user message is also saved in its own transaction before the LLM call.
- **`model_pricing.effective_from`** keeps price history; `cost_usd` is stored at request time so later price changes do not rewrite history.
- **Soft delete for conversations** (`is_archived`).
