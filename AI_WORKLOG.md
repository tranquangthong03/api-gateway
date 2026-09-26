# AI Worklog

> Written by the project owner. Agents may suggest entries but never edit this file.

## AI tools used
| Tool | Used for |
|---|---|
| Claude (chat) | mentoring on architecture, database, API design and tech stack; reviews of my diagrams, schema and folder structure |
| Claude Code CLI | _TBD_ |
| Codex CLI | _TBD_ |

## How AI helped
### Design (24–26/09)
_TBD_

### Implementation
_TBD_

## Incorrect or weak AI outputs and how I fixed them
| # | What the AI produced | How I noticed | What I changed |
|---|---|---|---|
| 1 | First architecture diagram mixed C4 levels and placed logging after auth | Mentor's self-correction; failed-auth requests would leave no trace | Logging first; separate context / container / component views |
| 2 | dbdiagram.io export: DEFERRABLE FKs, duplicate unique index on `request_id`, no CHECKs, generated column only as a comment | Reviewed the exported SQL | Migration requirements list in docs/database.md |
| 3 | _TBD_ | | |

## Design decisions I made myself
- Validator step in the request pipeline (now `middleware/validate.js`)
- Admin dashboard as a separate client of `GET /v1/usage`
- `revoked_at` / `expires_at` on API keys instead of `is_active`
- `model_pricing.effective_from` to keep price history
- Split security code into `jwt.js`, `password.js`, `api-key.js`; OpenAPI registry separate from Zod schemas
- JavaScript instead of TypeScript, compensated with Zod at every boundary, JSDoc contracts and adapter contract tests

## What I would improve with 7 more days
_TBD_
