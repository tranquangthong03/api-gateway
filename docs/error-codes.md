# Error format and codes

Every error from every endpoint uses this body:
```json
{ "error": { "code": "RATE_LIMIT_EXCEEDED", "message": "Human readable message",
             "request_id": "req_…", "details": { "retry_after_seconds": 23 } } }
```
`code` is stable and meant for programs; `message` is for people; `details` is optional and code-specific.

| HTTP | code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | invalid body or query, unknown task, input too long (`details.issues` lists fields) |
| 401 | `UNAUTHORIZED` | missing, invalid, revoked or expired credentials — same message for all |
| 403 | `FORBIDDEN` | authenticated but not allowed (API key on key management, non-admin `user_id`) |
| 404 | `NOT_FOUND` | route or resource missing, or resource owned by another user |
| 409 | `CONFLICT` | email already registered |
| 429 | `RATE_LIMIT_EXCEEDED` | gateway quota exceeded; `Retry-After` header set |
| 502 | `PROVIDER_ERROR` | providers failed after retries and fallback, or structured output invalid |
| 504 | `PROVIDER_TIMEOUT` | every attempt timed out |
| 500 | `INTERNAL_ERROR` | unexpected gateway error (details never exposed) |

## Stored `ai_requests.error_code` values
| Value | Meaning | Client sees |
|---|---|---|
| `timeout` | all attempts timed out | 504 |
| `provider_rate_limited` | provider kept returning 429 | 502 |
| `provider_error` | provider 5xx / network error / non-retryable 4xx | 502 |
| `invalid_output` | output failed the task schema after one repair | 502 |
| `internal_error` | gateway bug during an AI request | 500 |

## Rules
- Provider error bodies are never sent to clients; up to 500 characters are stored in `error_message`.
- Stack traces are logged, never returned.
- 5xx responses are logged at `error` level with `request_id`; 4xx at `warn`.
