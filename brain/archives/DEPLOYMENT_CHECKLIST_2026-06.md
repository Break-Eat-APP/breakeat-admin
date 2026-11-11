# BREAK EAT — Deployment Checklist

> **Phase 10 deliverable** — Run this checklist before every production deployment.  
> Mark each item ✅ when verified. Do **not** deploy with any ❌ open.

---

## 0. Pre-flight: branch & secrets

| # | Check | Status |
|---|-------|--------|
| 0.1 | Branch is **not** `main` — deploy via PR, never force-push to main | ⬜ |
| 0.2 | `git status` shows no uncommitted files | ⬜ |
| 0.3 | No `.env` file with real values is tracked (`git ls-files \| grep ".env$"` returns nothing) | ⬜ |
| 0.4 | `firebase-app-distribution-key.json` is **not** in git history | ⬜ |
| 0.5 | `*.p8 *.p12 *.keystore *.jks` → absent from repo | ⬜ |
| 0.6 | `google-services.json` / `GoogleService-Info.plist` → absent from repo | ⬜ |

---

## 1. Backend — Railway

| # | Check | Status |
|---|-------|--------|
| 1.1 | `DATABASE_URL` set in Railway environment (PostgreSQL connection string) | ⬜ |
| 1.2 | `JWT_SECRET` ≥ 32 chars, stored in Railway Secrets | ⬜ |
| 1.3 | `JWT_REFRESH_SECRET` ≥ 32 chars, stored in Railway Secrets | ⬜ |
| 1.4 | `STRIPE_SECRET_KEY` (live key `sk_live_...`) set in Railway Secrets | ⬜ |
| 1.5 | `STRIPE_WEBHOOK_SECRET` (live webhook signing secret) set in Railway Secrets | ⬜ |
| 1.6 | `CORS_ORIGINS` set to the Vercel operator URL (e.g. `https://operator.break-eat.app`) | ⬜ |
| 1.7 | `NODE_ENV=production` | ⬜ |
| 1.8 | `DEMO_MODE` is **absent** or set to `false` — the server will refuse to start if `DEMO_MODE=true` + `NODE_ENV=production` | ⬜ |
| 1.9 | `SENTRY_DSN_BACKEND` set (or intentionally left empty to disable Sentry) | ⬜ |
| 1.10 | `LOG_LEVEL` set (`log` recommended for prod; `debug` for staging) | ⬜ |
| 1.11 | `PORT` not set (Railway injects it automatically) | ⬜ |

### Railway deploy steps

```bash
# 1. Push the branch — Railway auto-deploys from the configured branch
git push origin main

# 2. Watch the deploy log in Railway dashboard → Build logs
# 3. Verify health check: GET https://api.break-eat.app/health → {"status":"ok"}
# 4. Verify migrations ran: Railway → Deployments → last deploy log should show "All migrations successful"
```

---

## 2. Operator app — Vercel

| # | Check | Status |
|---|-------|--------|
| 2.1 | `NEXT_PUBLIC_API_URL` set to the Railway backend URL (`https://api.break-eat.app/api/v1`) | ⬜ |
| 2.2 | `NEXT_PUBLIC_SENTRY_DSN_OPERATOR` set (or empty to disable) | ⬜ |
| 2.3 | `SENTRY_DSN_OPERATOR` set (server-side, not exposed to browser) | ⬜ |
| 2.4 | `SENTRY_AUTH_TOKEN` set in Vercel for source-map uploads | ⬜ |
| 2.5 | `SENTRY_ORG` and `SENTRY_PROJECT` set in Vercel | ⬜ |
| 2.6 | `NEXT_PUBLIC_APP_ENV=production` | ⬜ |
| 2.7 | Vercel project is connected to the `apps/operator` root directory | ⬜ |
| 2.8 | Install command: `cd ../.. && pnpm install --frozen-lockfile` | ⬜ |
| 2.9 | Build command: `pnpm build` | ⬜ |

### Vercel deploy steps

```bash
# Vercel deploys automatically on push to main (configure in Vercel dashboard).
# Manual deploy:
vercel --prod --cwd apps/operator

# Verify:
# - Homepage loads (GET https://operator.break-eat.app)
# - Dashboard page loads without console errors
# - WebSocket connects to backend (check Network → WS tab)
```

---

## 3. Database migrations

| # | Check | Status |
|---|-------|--------|
| 3.1 | All pending migrations are committed to `backend/prisma/migrations/` | ⬜ |
| 3.2 | `pnpm db:migrate:prod` has been **dry-run** against a staging DB first | ⬜ |
| 3.3 | No `DROP TABLE` or `DROP COLUMN` statements without a data-migration plan | ⬜ |
| 3.4 | New `NOT NULL` columns have a default or the migration includes a backfill | ⬜ |
| 3.5 | Rollback procedure documented in the migration SQL comment if destructive | ⬜ |

---

## 4. Test suite

| # | Check | Status |
|---|-------|--------|
| 4.1 | `pnpm test` passes with ≥ 250 tests (run from monorepo root) | ⬜ |
| 4.2 | No `--passWithNoTests` flag hiding failures | ⬜ |
| 4.3 | Rush tests (`rush.spec.ts`) pass — 50-order and 100-order simulations | ⬜ |
| 4.4 | Order-loss tests (`order-loss.spec.ts`) pass | ⬜ |
| 4.5 | Feature-flags and app-settings tests pass | ⬜ |
| 4.6 | TypeScript compiles clean: `pnpm typecheck` (backend + operator) | ⬜ |

---

## 5. Security scan

| # | Check | Status |
|---|-------|--------|
| 5.1 | `pnpm audit` — no critical vulnerabilities | ⬜ |
| 5.2 | Sentry DSN is the **project-specific** DSN, not the Sentry organisation-level key | ⬜ |
| 5.3 | `JWT_SECRET` is not the default placeholder from `.env.example` | ⬜ |
| 5.4 | Stripe keys are **live** (`sk_live_`, `whsec_`) — not test keys | ⬜ |
| 5.5 | CORS `CORS_ORIGINS` does not include `*` or `localhost` in production | ⬜ |

---

## 6. Smoke tests (post-deploy)

Run these manually after each production deployment.

| # | Check | Status |
|---|-------|--------|
| 6.1 | `GET /health` → `200 {"status":"ok"}` | ⬜ |
| 6.2 | Operator app loads in browser, no JS errors in console | ⬜ |
| 6.3 | WebSocket connects (green indicator in operator dashboard) | ⬜ |
| 6.4 | Login with a test account works (JWT issued) | ⬜ |
| 6.5 | Place a test order via the API → appears in operator dashboard | ⬜ |
| 6.6 | Advance order status → WebSocket event received by operator | ⬜ |
| 6.7 | Public screen (`/public/:eventId`) shows READY orders | ⬜ |
| 6.8 | Sentry: trigger a test error → appears in Sentry dashboard within 60 s | ⬜ |

---

## 7. Rollback procedure

If a deployment fails:

```bash
# Railway: roll back via dashboard → Deployments → previous deploy → Redeploy
# Or via CLI:
railway redeploy <previous-deployment-id>

# If a bad migration was run, restore from the last DB snapshot:
# Railway → Database → Snapshots → Restore
```

**Never** run `prisma migrate reset` on production — it drops all data.

---

## 8. Post-deployment monitoring (first 30 min)

- [ ] Watch Railway deploy log for errors
- [ ] Check Sentry for new issues during the deploy window
- [ ] Monitor Railway metrics (CPU / memory) — alert if > 80%
- [ ] Verify error rate in Sentry is not spiking vs baseline

---

*Last updated: Phase 10 — 2026-06-02*
