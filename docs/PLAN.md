# Implementation plan

Deadline **2026-10-01 23:59**. One milestone per agent session. Tick boxes when done.

## Deliverables map
| Deliverable | Where |
|---|---|
| Source code | this repository |
| API documentation | `/docs` (Swagger UI) + `docs/openapi.json` (generated) + `docs/api-design.md` + `docs/error-codes.md` |
| Architecture diagram | `docs/architecture.md` + `docs/images/architecture.png` |
| Database schema | `docs/database.md` + `docs/schema.dbml` + `docs/images/erd.png` + `migrations/` + `docs/schema.sql` (generated) |
| Postman collection | `docs/postman/collection.json` + `docs/postman/environment.json` |
| Deployed API | URL in README and `docs/deployment.md` |
| README | architecture, API design, database, AI integration, error handling, limitations |
| Process (challenge rules) | `AI_WORKLOG.md`, `docs/prompts.md`, demo video ≤ 5 min |

## M1 — Scaffold (27/09)
- [x] `package.json` (`"type": "module"`, `engines.node >= 24 <25`, exact versions, all scripts in AGENTS.md §4) + `package-lock.json`
- [x] `eslint.config.js`, `.prettierrc`, `vitest.config.js`
- [x] `Dockerfile` (node:24-slim, `npm ci --omit=dev`, non-root user), `.dockerignore` (excludes `.env`, `node_modules`, `tests`, `docs`), `docker-compose.yml` (app, db postgres:16 with named volume, redis:7)
- [x] `src/config/env.js` (Zod), `core/logger.js` (pino + redaction), `core/errors.js`
- [x] `middleware/request-id.js` (pino-http), `middleware/error-handler.js` (format from error-codes.md, 404 for unknown routes)
- [x] `infra/db.js`, `infra/redis.js`; `routes/health.routes.js` checks both
- [x] First migration implementing **every** item of docs/database.md "Migration requirements" + seed for `model_pricing`
- [x] `src/openapi/` registry + Swagger UI at `/docs`; `npm run docs:openapi` writes `docs/openapi.json`
- [x] `server.js` with graceful shutdown
- [x] Test setup: test DB migrated before run; tests for `/health`, error format, unknown route, and DB constraints (invalid `status` rejected, message with unknown conversation rejected, `total_tokens` computed)
**Accept:** clean clone → `docker compose up --build` works; `npm test` and `npm run lint` pass.

## M2 — Auth & API keys (27/09)
- [x] `core/jwt.js`, `core/password.js`, `core/api-key.js`
- [x] register / login; API key create / list / revoke
- [x] `middleware/auth.js`: Bearer JWT or `X-API-Key`; checks revoked, expired, user active; updates `last_used_at`
- [x] Permission rules from api-design.md
**Accept:** tests for valid / invalid / revoked / expired key, expired JWT, 403 when an API key manages keys, 409 duplicate email.

## M3 — LLM core (28/09)
- [ ] `llm/provider.js` (base class + JSDoc typedefs), `gemini.adapter.js`, `groq.adapter.js` (openai SDK, `maxRetries: 0`, explicit timeout)
- [ ] `llm/retry.js` per AGENTS.md §7
- [ ] `llm/cost.js`, `llm/orchestrator.js` (routing, fallback, one `ai_requests` row on success and failure)
- [ ] `tests/helpers/fake-provider.js`; adapter contract test
**Accept:** unit tests: success, retry on 503 then success, no retry on 400, fallback after exhausted retries, timeout → 504, row written on failure, cost calculation.

## M4 — AI endpoints & conversations (28/09)
- [ ] `llm/tasks.js` (sentiment, summarize, extract: prompt + Zod schema)
- [ ] `POST /v1/ai/chat` (user message saved before the LLM call, last 20 messages as history)
- [ ] `POST /v1/ai/analyze` (schema validation, one repair attempt)
- [ ] `GET /v1/conversations`, `GET /v1/conversations/{id}`
**Accept:** integration tests with fake providers; other user's conversation → 404; invalid output → 502.

## M5 — Rate limit, usage, cache (29/09)
- [ ] `middleware/rate-limit.js` + headers + 429 with `Retry-After`
- [ ] `GET /v1/usage` incl. `by_model` and admin filter; `core/time.js` for defaults
- [ ] (bonus) analyze cache with `is_cached`
**Accept:** tests for 429, usage math on seeded rows (success, error, cached, zero tokens).

## M6 — Deploy (29/09)
- [ ] Railway (or Render) + managed Postgres + Redis; migrations as pre-deploy step
- [ ] `docs/deployment.md` completed; smoke test on the public URL
**Accept:** public `/health` OK; one real chat request appears in `/v1/usage`.

## M7 — Deliverables (30/09 – 01/10)
- [ ] `docs/openapi.json` and `docs/schema.sql` regenerated
- [ ] Postman collection + environment (`base_url`, `jwt`, `api_key`), every endpoint + key error cases
- [ ] README complete; limitations listed
- [ ] Final pass: lint, tests, remove dead code and leftover `.gitkeep`

## Submission checklist
- [ ] Public repo, no secrets in history (`git log -p | findstr /i "api_key secret"` returns nothing sensitive)
- [ ] Deployed URL works from another network
- [ ] README links: deployed URL, `/docs`, Postman files, diagrams, video
- [ ] `AI_WORKLOG.md` complete (tools, help, wrong outputs + fixes, 7 more days)
- [ ] Demo video ≤ 5 min shows a fallback happening

## Progress log
<!-- Agents append: date · agent · milestone · done · decisions · open issues -->
2026-09-26 · Antigravity (Gemini 3.6 Flash) · M1 Scaffold · Completed project scaffold, core config, middleware, DB/Redis infra, schema & seed migrations, OpenAPI generation, and Vitest suite · Pinned Node 24 and Zod 4 + zod-to-openapi 9.1.0; mapped container db to host port 5433:5432 to avoid host PostgreSQL port conflict; implemented programmatic test DB creation and migration in Vitest global setup · None
2026-09-26 · Antigravity (Gemini 3.6 Flash) · M2 Auth & API Keys · Implemented register/login endpoints, API key CRUD operations, GET /v1/auth/me, HS256 JWT & SHA-256 API key authentication middleware, OpenAPI documentation, and full integration test suite · Enforced HS256 JWT verification algorithm pinning; normalized email input to lowercase; returned identical 401 message for unknown email and wrong password; disabled X-Powered-By header · None


