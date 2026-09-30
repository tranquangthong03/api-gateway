# Production Deployment Guide — Railway

## Target Platform

- **App Service**: Railway `api-gateway` built from the root `Dockerfile` (branch `main`).
- **Database**: PostgreSQL 16 managed database (connected via internal Railway network).
- **Cache / Rate Limit**: Redis 7 managed database (connected via internal Railway network).
- **Public URL**: `https://api-gateway-production-3321.up.railway.app`

---

## Railway Service Configuration

### Services & Networking

- `api-gateway`: Root `Dockerfile` build context. Port target `8080` (Railway automatically injects `PORT` into process environment).
- `Postgres`: Managed PostgreSQL 16 instance.
- `Redis`: Managed Redis 7 instance.

### Environment Variables

Set in Railway service settings dashboard (secrets never committed to repository):

- `NODE_ENV=production`
- `DATABASE_URL=${{Postgres.DATABASE_URL}}` (Railway reference)
- `REDIS_URL=${{Redis.REDIS_URL}}` (Railway reference)
- `JWT_SECRET=<strong-random-32-char-min-string>`
- `JWT_EXPIRES_IN=1h`
- `LOG_LEVEL=info`
- `DEFAULT_PROVIDER=gemini`
- `FALLBACK_PROVIDER=groq`
- `GEMINI_API_KEY=<gemini-api-key>`
- `GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/`
- `GEMINI_MODEL=gemini-2.5-flash`
- `GROQ_API_KEY=<groq-api-key>`
- `GROQ_BASE_URL=https://api.groq.com/openai/v1`
- `GROQ_MODEL=llama-3.3-70b-versatile`
- `PROVIDER_TIMEOUT_MS=30000`
- `PROVIDER_MAX_RETRIES=2`
- `DEFAULT_RATE_LIMIT_PER_MIN=60`

### Commands & Health Check

- **Pre-deploy command**: `npm run migrate`
  > [!WARNING]
  > **CRITICAL PRE-DEPLOYMENT REQUIREMENT**: The pre-deploy command `npm run migrate` **must be configured and saved in Railway service settings before the initial deployment**. If omitted, the service will build and start as `Active` (passing basic TCP health checks), but incoming API calls requiring database tables will fail with HTTP 500 errors. `/health` now validates database schema readiness (`schema: "ok"`) and returns `503 Service Unavailable` if migrations have not been applied.
- **Healthcheck Path**: `/health`
- **Start Command**: Empty (uses Dockerfile `CMD ["node", "src/server.js"]`)

---

## Release Steps

1. Merge approved feature branch into `main`.
2. Push `main` to GitHub repository connected to Railway.
3. Railway triggers automated Docker build (`npm ci --omit=dev`).
4. Railway executes pre-deploy command `npm run migrate` to apply pending SQL migrations.
5. Container starts with `node src/server.js` listening on host `0.0.0.0:${PORT}`.
6. Railway verifies `/health` returns `200 OK` before routing public traffic.

---

## PowerShell Smoke-Test Script

Execute this script after deployment to verify all gateway endpoints on the public URL:

```powershell
$ErrorActionPreference = "Stop"
$base = "https://api-gateway-production-3321.up.railway.app"

Write-Host "=== 1. Health Check ==="
$health = Invoke-RestMethod -Uri "$base/health" -Method Get
Write-Host "Health Status: $($health.status), DB: $($health.db), Redis: $($health.redis), Schema: $($health.schema)"

Write-Host "`n=== 2. API Docs ==="
$docs = Invoke-WebRequest -Uri "$base/docs/" -Method Get
Write-Host "Swagger UI Status: $($docs.StatusCode)"

Write-Host "`n=== 3. Auth Register & Login ==="
$email = "smoke.$(Get-Random)@example.com"
$password = "Password123!"

$register = Invoke-RestMethod -Uri "$base/v1/auth/register" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = $password } | ConvertTo-Json)
Write-Host "Registered User ID: $($register.user.id)"

$login = Invoke-RestMethod -Uri "$base/v1/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = $password } | ConvertTo-Json)
$jwt = $login.access_token
Write-Host "JWT Token acquired successfully."

Write-Host "`n=== 4. Create API Key ==="
$keyRes = Invoke-RestMethod -Uri "$base/v1/api-keys" -Method Post -Headers @{ "Authorization" = "Bearer $jwt" } -ContentType "application/json" -Body (@{ name = "Smoke Test Key" } | ConvertTo-Json)
$apiKey = $keyRes.api_key
Write-Host "API Key Created: $($keyRes.name), Prefix: $($keyRes.key_prefix)"

Write-Host "`n=== 5. Chat Endpoint (via API Key) ==="
$chatRes = Invoke-RestMethod -Uri "$base/v1/ai/chat" -Method Post -Headers @{ "X-API-Key" = $apiKey } -ContentType "application/json" -Body (@{ message = "Reply with 'OK'." } | ConvertTo-Json)
Write-Host "Chat Response: $($chatRes.message.content)"

Write-Host "`n=== 6. Analyze Endpoint (with Cache Hit Verification) ==="
$analyzeBody = @{ task = "sentiment"; text = "Railway deployment is fast and seamless." } | ConvertTo-Json

$an1 = Invoke-RestMethod -Uri "$base/v1/ai/analyze" -Method Post -Headers @{ "X-API-Key" = $apiKey } -ContentType "application/json" -Body $analyzeBody
Write-Host "Analyze Call 1 (Cached: $($an1.is_cached)): $($an1.result.sentiment)"

$an2 = Invoke-RestMethod -Uri "$base/v1/ai/analyze" -Method Post -Headers @{ "X-API-Key" = $apiKey } -ContentType "application/json" -Body $analyzeBody
Write-Host "Analyze Call 2 (Cached: $($an2.is_cached)): $($an2.result.sentiment)"

Write-Host "`n=== 7. Usage Metrics ==="
$usage = Invoke-RestMethod -Uri "$base/v1/usage" -Method Get -Headers @{ "Authorization" = "Bearer $jwt" }
Write-Host "Total Requests: $($usage.requests), Total Tokens: $($usage.tokens), Cost: `$$($usage.estimated_cost_usd)"

Write-Host "`n=== 8. Rate Limiting Check ==="
$me = Invoke-WebRequest -Uri "$base/v1/auth/me" -Method Get -Headers @{ "Authorization" = "Bearer $jwt" }
Write-Host "Rate Limit Limit Header: $($me.Headers['X-RateLimit-Limit'])"
Write-Host "Rate Limit Remaining Header: $($me.Headers['X-RateLimit-Remaining'])"

Write-Host "`n=== ALL SMOKE TESTS PASSED SUCCESSFULLY ==="
```

---

## Rollback Procedure

1. **Deployment Rollback**: In Railway dashboard, locate the previous successful deployment and click **Rollback**.
2. **Database Rollback** (if a migration failed or broke compatibility):
   Run `node-pg-migrate down` locally targeting `DATABASE_URL` or run a database backup restore via Railway PostgreSQL backup tab.
3. **Verification**: Verify `$base/health` returns `200 OK` and run the smoke-test script against the restored version.
