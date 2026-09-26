# AGENTS.md — AI Gateway

Rules for every coding agent in this repo. Codex CLI reads this file natively; Claude Code
reads it through `CLAUDE.md` (`@AGENTS.md`). This is the single source of agent rules.

## 1. Project
A central **AI Gateway** backend: applications call this service instead of calling LLM
providers directly. It handles authentication, rate limiting, LLM routing with fallback,
timeouts and retries, structured output, conversation storage, per-request usage logging
and a usage API. 7-day challenge: **a small, working, well-explained system beats a large one.**

## 2. Source of truth — read before any work
1. `docs/PLAN.md` — milestones, acceptance criteria, progress log (what to do next)
2. `docs/architecture.md` — components, layering, request flow
3. `docs/database.md` — approved schema, migration requirements, design decisions
4. `docs/api-design.md` — endpoints and payloads (hand-written spec; code follows it)
5. `docs/error-codes.md` — error format and every error code

These are the approved design. If code and docs disagree, or a doc is ambiguous or seems
wrong, **stop and ask**. Never change a design decision without flagging it.

**One topic, one hand-written file.** Generated files are never edited by hand and start
with a "GENERATED — do not edit" note: `docs/openapi.json` (from Zod, `npm run docs:openapi`)
and `docs/schema.sql` (from `pg_dump --schema-only` after migrations).

## 3. Tech stack (do not add or swap dependencies without asking)
| Layer | Choice |
|---|---|
| Runtime | Node.js 22 LTS, JavaScript, **ES modules only** (`"type": "module"`) |
| Framework | Express 5 |
| Database | PostgreSQL 16 via `pg`, **parameterized raw SQL**, only in `src/repositories/` |
| Migrations | node-pg-migrate (SQL migrations) |
| Cache / rate limit | Redis 7 via ioredis |
| Validation | Zod (requests, LLM output, provider responses, environment) |
| Auth | jsonwebtoken (**HS256 only**, `algorithms: ['HS256']` on verify) + bcryptjs; API keys hashed with SHA-256 (`node:crypto`) |
| LLM | `openai` SDK against OpenAI-compatible endpoints, **`maxRetries: 0` and explicit `timeout`**, always wrapped in an adapter |
| Logging | pino + pino-http |
| API docs | @asteasolutions/zod-to-openapi + swagger-ui-express (served at `/docs`) |
| Tests | Vitest + supertest; fake LLM adapters; real Postgres + Redis from Docker |
| Lint / format | ESLint 9 flat config + Prettier |
| Deploy | Railway (or Render) using the root `Dockerfile` |

- Install with `--save-exact`; commit `package-lock.json`; deploy uses `npm ci`.
- Zod and zod-to-openapi major versions must be compatible — check the library README.
- Provider request/response formats, token-usage fields, OpenAI-compatibility limits and
  model names: **check official provider docs**, do not rely on memory. Model names and
  base URLs come from env, never hard-coded.

## 4. Commands (Milestone 1 creates these npm scripts)
```
npm ci                          # install exact locked deps
docker compose up -d db redis   # infra for dev and tests
npm run migrate                 # node-pg-migrate up (DATABASE_URL)
npm run dev                     # node --watch --env-file=.env src/server.js
npm test                        # vitest run (uses TEST_DATABASE_URL)
npm run lint                    # eslint .
npm run format:check            # prettier --check .
npm run docs:openapi            # regenerate docs/openapi.json
docker compose up --build       # full stack
```
Keep this section updated if commands change.

## 5. Project layout (approved — do not add top-level folders)
```
src/
  app.js            # builds the Express app (middleware order, routes, error handler); no listen()
  server.js         # listen + graceful shutdown (close pg pool and redis)
  config/env.js     # parse + validate env with Zod; app refuses to start if invalid
  core/             # errors.js, logger.js, jwt.js, password.js, api-key.js, time.js
  infra/            # db.js (pg Pool), redis.js
  middleware/       # request-id.js, auth.js, rate-limit.js, validate.js, error-handler.js
  routes/           # health.routes.js, v1/{index,auth,api-keys,ai,conversations,usage}.routes.js
  schemas/          # Zod schemas only
  openapi/          # zod-to-openapi registry + swagger-ui setup
  services/         # auth, api-key, chat, analyze, usage (*.service.js)
  llm/              # provider.js, gemini.adapter.js, groq.adapter.js, retry.js,
                    # orchestrator.js, tasks.js, cost.js
  repositories/     # user, api-key, conversation, message, ai-request, model-pricing (*.repo.js)
migrations/  tests/{helpers,unit,integration}/  docs/
Dockerfile  .dockerignore  docker-compose.yml   # at repo root (build context = root)
```
File names are **kebab-case** with a layer suffix (`chat.service.js`, `user.repo.js`).
Remove a folder's `.gitkeep` once it contains real files.

## 6. Architecture rules (graded)
- Dependencies point downward only: routes → services → orchestrator → adapters;
  services/orchestrator → repositories → infra. Lower layers never import upper ones.
  A route importing a `.repo.js` file or an adapter is a violation.
- Routes: validate, call one service, map the response. No business logic, no SQL.
- Repositories: SQL only, no business rules. **Always `$1, $2` parameters — never build SQL
  by concatenating or interpolating values.**
- **Adapters are the only code that talks to LLM providers.** Timeout + retry live in the
  adapter layer (`retry.js`). Routing, fallback and cost live in the orchestrator.
- Middleware order: request-id + pino-http → auth → rate-limit → routes → error-handler.
- The orchestrator writes exactly **one `ai_requests` row per client AI request**, on
  success **and** failure. Gateway rate-limit rejections are NOT written there (app log only).
- In chat, save the user message in its own transaction **before** calling the LLM.
- `llm/tasks.js` defines each analyze task as a pair: prompt + Zod output schema.

## 7. Reliability defaults (from env)
- Provider timeout `PROVIDER_TIMEOUT_MS` (30 s). SDK `maxRetries: 0`; the gateway retries up to
  `PROVIDER_MAX_RETRIES` (2) with exponential backoff + jitter, **only** for timeouts,
  connection errors, HTTP 429 and 5xx. Never retry other 4xx.
- Primary exhausted → fallback provider once (`is_fallback = true`). Both fail →
  502 `PROVIDER_ERROR` or 504 `PROVIDER_TIMEOUT`.
- `latency_ms` measured by the orchestrator from start to final result (retries + fallback included).
- **Token counts come only from the provider response. Never estimate tokens.**

## 8. Security rules
- Never log or return secrets: API keys, JWTs, passwords, hashes, provider keys
  (configure pino redaction for `authorization` and `x-api-key` headers).
- Raw API key returned once at creation; store only SHA-256 hash + prefix.
- API keys may call AI, conversation and usage endpoints only; key management requires JWT.
- Another user's resource → 404, not 403. Invalid/revoked/expired credentials → same 401 message.
- Provider error bodies never reach clients; store at most 500 chars in `error_message`.
- Secrets only from env; keep `.env.example` updated; `.env` is gitignored and dockerignored.

## 9. JavaScript conventions
- `import`/`export` only, never `require`. **Relative imports include the `.js` extension.**
- async/await on the request path; no floating promises.
- JSDoc `@typedef` for shared contracts, at minimum `LLMProvider.generate()` input/output
  (text, input_tokens, output_tokens, finish_reason, provider, model).
- Errors: throw `AppError(code, message, status, details)`; one error handler renders the
  format in `docs/error-codes.md`. Zod errors → 400 `VALIDATION_ERROR`.
- JSON `snake_case`; timestamps ISO 8601 UTC; every response has `X-Request-ID`.
- Small functions; comments explain *why*, not *what*.

## 10. Testing rules
- **Never call real LLM providers in tests**; inject fake adapters implementing `LLMProvider`.
- Integration tests use real Postgres (`TEST_DATABASE_URL`, migrated before the run) and Redis.
- One shared contract test runs against every adapter to verify the normalized result shape.
- Required behaviours: auth (valid/invalid/revoked/expired key, JWT expiry), permissions,
  rate limit 429, retry on 5xx, no retry on 400, fallback, timeout → 504, invalid structured
  output, usage math, `ai_requests` row written on failure, other user's data → 404.

## 11. Workflow rules
- **One milestone** from `docs/PLAN.md` at a time. Do not start the next one.
- Before editing: restate the goal, list files to create/change, flag ambiguities; wait for approval.
- After finishing: run lint + tests and show real output; tick criteria in `docs/PLAN.md`;
  append a Progress log entry (date, agent, done, decisions, open issues). This log is how
  work is handed over between Claude Code and Codex.
- Final message: files changed · commands run + results · deviations from docs ·
  2–4 **suggested** notes for `AI_WORKLOG.md`.
- **Never edit `AI_WORKLOG.md`. Never commit.** The owner reviews the diff and commits.

## 12. Definition of done (per milestone)
Criteria met · lint + format clean · tests pass · no secrets in code, logs or image ·
docs updated if behaviour changed · PLAN.md progress log updated.
