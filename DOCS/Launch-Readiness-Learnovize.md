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

## External services (post-Phase-10 integrations)

- [x] **R2 storage (staging-verified 2026-10-04):** buckets `learnovize-public`/`learnovize-private` live;
  write+read verified on public, signed-URL read verified on private, test objects cleaned up.
  Public HTTP verified 2026-10-04: staging base `https://pub-c21f5276b2a14494898359cefb8d82b6.r2.dev` serves objects (200, byte-match).
  Remaining: custom domain + true CDN for production.
- [x] **Paystack (test mode, verified 2026-10-04):** 27 automated checks passed — key auth, checkout init,
  kobo↔naira round-trip, HMAC-SHA512 signature, credit + split + payout, replay idempotency, forged/tampered
  signature rejection (401), and dropped-webhook recovery. Fixed three real bugs found during this work:
  abandoned checkouts now resume the same transaction (no double-charge), `fee`/`fees` unit confusion that
  would have overstated trainer net 100×, and payments stranded when a webhook is never delivered.
  Remaining: live keys + business KYC, public HTTPS webhook URL, recurring Plans.
- [x] **Resend email (verified 2026-10-04):** all 5 templates sent and confirmed `delivered` by Resend.
  Real seat claim fires the confirmation email with in-app notification intact (201 + duplicate still 409);
  HTML injection neutralised; links absolute. Sends never throw and never roll back a seat claim or payment.
  **Blocker for real users:** no domain verified yet — Resend's shared `onboarding@resend.dev` only delivers
  to the account owner's own address and is capped at ~100/day. Add a domain and set `EMAIL_FROM` before launch.
- [x] **Expo push (verified 2026-10-04):** 17 automated checks passed — malformed tokens rejected at the
  endpoint (5 cases, 0 junk rows), multi-device support, correct fan-out, 250 tokens chunked 100/100/50,
  and `DeviceNotRegistered` tokens pruned (250 sent → 125 retained). Added the ticket/receipt distinction,
  100-message batching, and dead-token cleanup the old code lacked.
  **Blocker for real devices:** no Expo account/EAS project yet — `app.json` still has the placeholder
  project ID and devices refuse to mint a token without one. See below.
- [ ] Termii SMS/WhatsApp · [ ] LiveKit prod (TURN/TLS) · [ ] Slack alerts · [ ] pen-test · [ ] NDPC/lawyer.

### To finish push on real devices

1. Create an Expo account and run `npx eas-cli@latest init` inside `apps/mobile` to create the EAS project.
2. Paste the returned project ID — I will write it into `apps/mobile/app.json` and `EXPO_PROJECT_ID`.
3. Create an access token at expo.dev → Settings → Access Tokens (Enhanced Security if available) → `EXPO_ACCESS_TOKEN`.
4. Build with `eas build` (a dev-client build is enough to receive pushes; Expo Go cannot).

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
