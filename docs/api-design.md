# API design (v1)

Hand-written spec that the code follows. The generated reference is `openapi.json` and the live Swagger UI at `/docs`.
Errors: see `error-codes.md`.

## Conventions

- Base path `/v1` (except `/health` and `/docs`). JSON `snake_case`. Timestamps ISO 8601 UTC.
- Every response has `X-Request-ID` (an incoming `X-Request-ID` is reused if valid).
- Rate-limited endpoints add `X-RateLimit-Limit` and `X-RateLimit-Remaining`.
- Auth: `Authorization: Bearer <jwt>` (people) or `X-API-Key: <key>` (applications).
- Input limits: `message` / `text` ≤ 10,000 characters; `limit` ≤ 100 (default 20).
- Not supported (documented limitation): streaming responses.

## Endpoints

| Method | Path      | Auth | Success                               |
| ------ | --------- | ---- | ------------------------------------- |
| GET    | `/`       | none | 200 `{ name, version, docs, health }` |
| GET    | `/health` | none | 200 `{ status, db, redis, schema }`   |

`/health` returns 503 with the `HealthResponse` shape (not the standard error format) if any of `db`, `redis`, or `schema` readiness checks fail so callers and load balancers can see which component failed.
| POST | `/v1/auth/register` | none | 201 user (never includes the hash) |
| POST | `/v1/auth/login` | none | 200 `{ access_token, token_type, expires_in }` |
| GET | `/v1/auth/me` | key or JWT | 200 `{ user_id, email, role, auth_type }` |
| POST | `/v1/api-keys` | JWT only | 201 key created (raw key shown once) |
| GET | `/v1/api-keys` | JWT only | 200 list (prefix only) |
| DELETE | `/v1/api-keys/{id}` | JWT only | 204 |
| POST | `/v1/ai/chat` | key or JWT | 200 |
| POST | `/v1/ai/analyze` | key or JWT | 200 |
| GET | `/v1/conversations` | key or JWT | 200 paginated |
| GET | `/v1/conversations/{id}` | key or JWT | 200 with messages |
| GET | `/v1/usage` | key or JWT | 200 |

The challenge suggests `POST /auth`; it is split into register and login because they are different actions.

## Permission rules

- API keys cannot call `/v1/api-keys*` → 403 `FORBIDDEN`.
- Users only see their own conversations and usage; another user's resource → 404.
- `GET /v1/usage?user_id=` is admin-only (non-admin → 403). Admin without `user_id` → whole system.

## Auth

`POST /v1/auth/register` `{ "email", "password", "full_name" }` → 201 `{ id, email, full_name, role, created_at }`.
Password: 8–128 characters. Duplicate email → 409 `CONFLICT`.
`POST /v1/auth/login` `{ "email", "password" }` → 200 `{ "access_token", "token_type": "Bearer", "expires_in": 3600 }`.

## API keys

`POST /v1/api-keys` `{ "name": "HR chatbot", "expires_in_days": 90 }` (expiry optional) →

```json
{
  "id": "…",
  "name": "HR chatbot",
  "key": "gw_3f9a…",
  "key_prefix": "gw_3f9a",
  "rate_limit_per_min": 60,
  "expires_at": "2026-12-25T00:00:00Z",
  "created_at": "…",
  "warning": "Store this key now. It will not be shown again."
}
```

Key format: `gw_` + 32 random bytes, base64url. `GET` returns the same fields without `key` and `warning`, plus `last_used_at` and `revoked_at`.
`DELETE /v1/api-keys/{id}` → 204; already revoked → 204 (idempotent); not found or not owned → 404.

## POST /v1/ai/chat

Request `{ "conversation_id": null, "message": "…", "model": null }`.
`conversation_id: null` starts a new conversation; `model: null` uses the conversation or gateway default.

```json
{
  "conversation_id": "…",
  "message_id": "…",
  "reply": "…",
  "provider": "gemini",
  "model": "…",
  "is_fallback": false,
  "usage": { "input_tokens": 42, "output_tokens": 118, "cost_usd": 0.000031 },
  "latency_ms": 1240
}
```

## POST /v1/ai/analyze

Request `{ "task": "sentiment" | "summarize" | "extract", "text": "…", "model": null }`.
Response `{ task, result, provider, model, is_fallback, is_cached, usage, latency_ms }`.
`result` is validated with the task's Zod schema; invalid after one repair attempt → 502 (`error_code = invalid_output`).

- sentiment: `{ sentiment: "positive"|"negative"|"neutral"|"mixed", confidence: 0..1, aspects: [{ aspect, sentiment }] }`
- summarize: `{ summary: string, key_points: string[] (≤ 5) }`
- extract: `{ people: string[], organizations: string[], dates: string[], amounts: [{ value: number, currency: string|null }] }`

## GET /v1/conversations

Query `limit`, `offset`. Non-archived only, newest `updated_at` first →
`{ "items": [{ id, title, created_at, updated_at }], "limit", "offset", "total" }`.
`GET /v1/conversations/{id}` → conversation fields + `messages: [{ id, role, content, created_at }]` in chronological order.

## GET /v1/usage

Query `from`, `to` (default: last 24 h), `user_id` (admin only).

```json
{
  "period": { "from": "…", "to": "…" },
  "requests": 124,
  "tokens": 48320,
  "average_latency_ms": 1230,
  "error_rate": 0.02,
  "estimated_cost_usd": 0.0184,
  "by_model": [{ "model": "…", "requests": 118, "tokens": 46100 }]
}
```

Calculation: `database.md` → Usage metrics.

## Rate limiting

Fixed window per minute in Redis (`INCR` + `EXPIRE`), key `rl:{api_key_id | user_id}:{epoch_minute}`.
Limit = `api_keys.rate_limit_per_min`; JWT callers use `DEFAULT_RATE_LIMIT_PER_MIN`.
Applies to `/v1/ai/*`, `/v1/conversations*`, `/v1/usage`.

## Cache (bonus)

`/v1/ai/analyze` only, key = SHA-256 of (task, text, model), TTL 1 h. A cache hit still writes an
`ai_requests` row with `is_cached = true`, zero tokens and zero cost. Chat is not cached (depends on history).
