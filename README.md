# AI Gateway

A central backend service between internal applications and LLM providers. Applications call
the gateway instead of OpenAI, Gemini or other providers directly; the gateway handles
authentication, rate limiting, routing with fallback, timeouts and retries, structured output,
conversation storage and usage tracking.

> Status: design approved, implementation in progress — see [docs/PLAN.md](docs/PLAN.md).

## Links
- Deployed API: _TBD_
- API docs (Swagger): `<deployed-url>/docs`
- Postman: [docs/postman/](docs/postman/)
- Demo video: _TBD_

## Quick start
_TBD (Milestone 1)_

## Architecture
See [docs/architecture.md](docs/architecture.md).
_TBD: diagram, components → folders table, request flow summary._

## API design
See [docs/api-design.md](docs/api-design.md) and [docs/error-codes.md](docs/error-codes.md).
_TBD: endpoint table, auth model._

## Database
See [docs/database.md](docs/database.md).
_TBD: ERD, key design decisions._

## AI integration
_TBD: providers, adapter pattern, model routing, fallback, structured output, cost estimation._

## Error handling and reliability
_TBD: error format, timeout, retry policy, fallback, logging with request_id._

## Usage metrics
_TBD: how each metric in `GET /v1/usage` is collected and calculated._

## Tech stack
_TBD: table + why JavaScript instead of TypeScript._

## Known limitations
_TBD_

## AI usage
See [AI_WORKLOG.md](AI_WORKLOG.md) and [docs/prompts.md](docs/prompts.md).
