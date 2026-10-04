# Launch Readiness: Learnovize (Phase 10 record)

Date: 2026-10-04 · Environment: local Docker (Postgres 16, Redis 7, S3Mock, LiveKit --dev), single Next.js instance.

## Load tests (measured)

| Test | Result |
|------|--------|
| Registration race: 70 concurrent claims, cap 50 | **PASS** — exactly 50×201, 20×409, 0 errors, `seatsTaken=50`, status `full`. No oversell. 1.8s total. |
| Feed burst: 50 concurrent public reads | min 254ms, p50 292ms, p95 321ms, max 323ms (local, cold-ish DB). Budget for CDN + indexes before launch. |
| Verify rate limit: 65 rapid hits (60/min/IP) | 5×429 served, 60 logged as visits. Limiter works; window slides correctly. |
| Auth rate limit | 20/min/IP enforced (proven: blocked a 70-signup burst during testing). |
| 500-user LiveKit classroom | **NOT run locally** — needs staging with TURN/TLS on 443. Gate: run 500 mixed video/audio-only room + bandwidth/cost dashboard before public launch (ADR-005). |

## Security checklist

- [x] Passwords bcrypt-12; generic login errors (no enumeration); rotating refresh with reuse-detection chain revoke.
- [x] Suspended accounts blocked at login, classroom token mint, registration; suspend revokes sessions.
- [x] LiveKit tokens 2h, role-scoped, no admin/egress grants; webhooks signature-verified (401 on forgery, verified).
- [x] Paystack webhook HMAC-SHA512 verified + verify-before-credit; settlement idempotent on reference.
- [x] Rate limits: auth 20/min, verify 60/min, register 300/min (single-instance memory; move to Redis for multi-instance).
- [x] Headers: X-Frame-Options DENY, nosniff, strict referrer, camera/mic-only permissions policy.
- [x] Secrets audit: no real secrets tracked; only dev placeholders in `.example` files. **Prod MUST set**: `JWT_SECRET` (32+ random), `LIVEKIT_API_KEY/SECRET`, `PAYSTACK_SECRET_KEY`, Postgres/R2 credentials.
- [x] Verify endpoint reveals nothing enumerable (valid shows only consented name; misses uniform).
- [x] ID docs: private bucket, 5-min signed URLs, logged access, 90-day purge rule (lawyer to confirm).
- [ ] Recurring plan billing (Paystack Plans) — dev upgrade endpoint only; required before selling Pro/Business publicly.
- [ ] SMS/WhatsApp reminders (Termii) — wired as Phase-7 follow-up if show-up <60%.
- [ ] Independent pen-test + NDPC registration + lawyer sign-off on ToS/privacy (open questions §12.10).

## Analytics (§10, live at GET /api/admin/analytics + /admin console)

regs/training avg · % trainings full · show-up % (≥1 present session) · certs issued + paid share ·
verify visits by status (VerifyVisit table) · return rate (multi-training users) · revenue + commission · sessions ended.
Classroom quality (% sessions without major issues) needs LiveKit room metrics from staging — open.

## Cut list (if behind)

Defer to v1.1: Business analytics extras, custom certificate design, multi-moderator UI polish, personalized feed.
NEVER cut: safety queue, refunds, verification, attendance enforcement, audit log.

## Rollback

Each phase merged to `main` with tags; `git revert` the phase commit + `prisma db push` previous schema. Static pages (verify/community/terms) keep serving during API rollback. Payout release is manual — no auto-money movement to unwind.

## Support rota (launch)

Week 1: founder on-call for flag alerts (Slack webhook when `SLACK_WEBHOOK_URL` set) + payout release daily.
Report → hide drill target: <5 min. 24/7 rota staffed when daily trainings exceed ~20.
