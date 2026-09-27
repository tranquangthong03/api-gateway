# Deployment

> Filled in during Milestone 6. Keep every step reproducible.

## Target

- App: Railway (or Render), built from the root `Dockerfile`
- PostgreSQL 16 and Redis 7: managed services on the same platform
- Public URL: _TBD_

## Environment variables

Same names as `.env.example`. Secrets are set only in the platform dashboard, never in the repo.

## Release steps

1. Push to `main`.
2. Platform builds the image (`npm ci`, production dependencies only).
3. Pre-deploy command runs migrations: `npm run migrate`.
4. App starts with `node src/server.js`; the platform health check calls `GET /health`.

## Smoke test after deploy

_TBD — list of requests (register, login, create key, chat, analyze, usage) and expected results._

## Rollback

_TBD_
