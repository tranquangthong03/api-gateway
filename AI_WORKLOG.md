# AI Worklog

> Compiled with help from Claude (chat) from the project history, then reviewed,
> corrected and completed by me. Coding agents never edited this file.

## 1. AI tools used

| Tool | Used for |
|---|---|
| Claude (chat) | Mentoring on architecture, database, API design, tech stack and deployment; reviewing my diagrams, schema, folder structure, agent plans and reports |
| Google Antigravity (coding agent) | Implementing milestones M1–M7 from the design docs, one milestone per session, in Planning mode |
| Codex CLI / Claude Code | Planned at the start but not used (not available to me). `AGENTS.md` + `CLAUDE.md` are kept so the repo still works with them |
| Gemini, Groq | LLM providers behind the gateway (not used to write code) |

## 2. How I worked with AI

1. **Design before code.** Architecture (3 C4 levels), database schema and API design were
   written and reviewed before any code. They live in `docs/` and are the agents' source of truth.
2. **One milestone per agent session**, with a fixed loop:
   plan → my review → approval with corrections → implementation → real command output →
   my own verification → commit via a Pull Request (one PR per milestone).
3. **Rules instead of repeated corrections.** Every time an agent made a class of mistake,
   I added a rule to `AGENTS.md` so it could not happen again in later milestones (see section 4).
4. **Evidence over claims.** I did not accept "verified" or "no UNVERIFIED items" without real
   output, and I re-ran the key checks myself: tests, psql queries, curl, newman, and a
   production smoke test.

**Timeline and time saved.** Design took 24–26/09; milestones M1–M6 (scaffold to production
deploy) were implemented on 26–27/09; M7 and documentation on 30/09. Writing and testing this
much code by hand would have taken me well beyond the 7 days available. Most of my own time
went into design, reviewing plans and verifying results rather than typing code.

## 3. Incorrect or weak AI outputs and how I fixed them

| # | Phase | What the AI produced | How I noticed | What I changed |
|---|---|---|---|---|
| 1 | Design | First architecture diagram mixed C4 levels and placed logging after auth | Mentor self-correction; failed-auth requests would leave no trace | Logging first; separate context / container / component views |
| 2 | Design | dbdiagram.io SQL export had DEFERRABLE FKs, a duplicate unique index on `request_id`, no CHECK constraints, generated column only as a comment | Reviewed the exported SQL line by line | "Migration requirements" list in `docs/database.md`, implemented by hand in the migration |
| 3 | Setup | Antigravity's summary of AGENTS.md narrowed "never commit" to "never commit AI_WORKLOG.md" and dropped two rules | Compared each bullet with AGENTS.md before giving any task | Correction prompt with explicit confirmation before M1 |
| 4 | M1 plan | Dependency versions from memory (e.g. Express 5.0.1), added `dotenv` outside the approved stack, fake migration timestamp, proposed running migrations against a non-Docker PostgreSQL | Plan review | Required `npm view` output, removed dotenv, real timestamps, database on host port 5433 instead |
| 5 | M1 plan | Rationalised two failed preconditions (Node 24 vs 22, dirty git status) instead of stopping; bash-only `migrate:test` script; reintroduced the rejected `docker/` folder | Read the precondition report carefully | Node 24 everywhere; migrations run in a Vitest globalSetup; rule "never reinterpret a failing check" |
| 6 | M1 | OpenAPI example for `/health` 503 showed `"ok"` everywhere | Looked at `/docs` instead of trusting green tests | Explicit 200/503 examples; 2-second timeout per dependency check |
| 7 | M3 | Ran `prettier --write .` on the whole repo, which could rewrite docs and this file | Checked `git diff --stat` | `.prettierignore`; rule "never run formatters repo-wide" |
| 8 | M3 plan | Mixed model and provider names; no fallback on 4xx (my planned fallback demo with a wrong key would have failed); no design for the structured-output repair call (would have written two log rows) | Plan review against M4 needs | Model→provider map, fallback on client_error, `validateOutputFn` with one repair and summed tokens |
| 9 | M4 | Added a `system_prompt` request field not in the spec; response `usage` missing `cost_usd`; internal fields exposed in conversation responses | Compared responses with `docs/api-design.md` | Removed the field, added `cost_usd`, trimmed responses |
| 10 | M5 plan | Usage SQL `($3 IS NULL OR user_id = $3)` could show system-wide usage to a normal user; `Retry-After` computed from the key TTL, not the clock window | Plan review | Non-admins always filtered by their own id (with a test); `Retry-After` from the clock |
| 11 | M6 | Mentor's secret-scan regex assumed Gemini keys start with `AIza`; my key starts with `AQ.` | Noticed while filling Railway variables | Scan pattern `AIza\|AQ\.\|gsk_` over files and full git history; rotated a key I had exposed in a screenshot |
| 12 | M6 | `migrate` script used `--env-file=.env`, which fails on Railway (no .env) | I found it with `Select-String` before deploying | `--env-file-if-exists`; migrate verified inside the container |
| 13 | M6 | Dockerfile did not copy `migrations/` | Found by the agent's production audit | `COPY migrations ./migrations` |
| 14 | M6 | First Railway deploy crashed: variables were staged but not applied; the mentor's earlier "don't click Deploy yet" advice caused it | Read the Railway deploy log (all variables undefined) | Applied staged changes; documented in `docs/deployment.md` |
| 15 | M6 | Deploy was Active and `/health` said ok, but the database had no tables (pre-deploy command not saved); register returned 500 | Production smoke test with real requests | Saved pre-deploy, redeployed; `/health` now also checks schema readiness |
| 16 | M6 | The 500's `request_id` could not be found in Railway logs | Searched the logs for it | 5xx logged at error level with top-level `request_id`, code, method, path |
| 17 | M7 | Postman collection reported as verified but never run; scripts read wrong field names → 15 cascading failures | Ran it myself with newman against production | Fixed field names, moved key revocation last; 20/20 requests and 38/38 assertions pass |

Where the AI was right: when I asked for evidence of the port-5432 conflict, the agent showed
that a native PostgreSQL service really was running on my machine. Asking for evidence works in
both directions.

## 4. Rules added to AGENTS.md because of these incidents

- Git is read-only for agents; the owner reviews every diff and commits.
- If a precondition or verification step fails, stop and report it; never reinterpret it as passing.
- Never run formatters or other commands that rewrite files repo-wide.
- Verify dependency versions and provider details from official sources, not memory.
- Never read, print or edit `.env`.

## 5. Design decisions I made myself

- A Validator step in the request pipeline (now `middleware/validate.js`)
- Admin dashboard as a separate client of `GET /v1/usage`, never reading the database directly
- `revoked_at` / `expires_at` on API keys instead of a single `is_active` flag
- `model_pricing.effective_from` to keep price history (Gemini 3.8 Flash's scheduled price change on 2027-01-01 is a real example)
- Split security helpers into `jwt.js`, `password.js`, `api-key.js`; OpenAPI registry separate from Zod schemas
- JavaScript instead of TypeScript, compensated with Zod at every boundary, JSDoc contracts and adapter contract tests
- Node 24 LTS for the whole project, so development and production use the same runtime
- Antigravity as the coding agent when Codex CLI was not available, keeping the same AGENTS.md workflow
- Railway over Render, so reviewers never hit a cold start

## 6. How the result was verified

- 66 automated tests (Vitest): retry, no retry on 4xx, fallback on 401, timeout → 504,
  structured-output repair, log row on failure, rate limit 429, usage math, permissions.
- Newman: 20 requests / 38 assertions pass locally; against production, all requests except the
  ones added in M7 passed before M7 was deployed.
- Cost checked by hand on production: 4 input + 37 output tokens on `gemini-3.5-flash-lite` =
  4 × 0.0003/1000 + 37 × 0.0025/1000 = 0.000094 USD, equal to `estimated_cost_usd` from `/v1/usage`.
- `/v1/usage` compared with the same aggregates computed directly in psql.

## 7. What I would improve with 7 more days

1. Rate limiting and lockout on `/v1/auth/login` (the main security gap today)
2. CI pipeline running lint, tests and newman on every Pull Request
3. Circuit breaker per provider, so a failing provider is skipped instead of retried
4. Observability: request metrics and latency histograms (Prometheus / OpenTelemetry)
5. Queue-based processing (BullMQ on Redis) for long analyze jobs
6. Streaming responses (SSE) for chat
7. A per-attempt table for retries and fallbacks, next to the per-request `ai_requests`
8. Admin endpoints to manage `model_pricing` and per-key budgets