# Implementation Plan: Wudi

Source: `DOCS/Product Requirements Document- Wudi.md` (Draft v2)
Architecture: `DOCS/Architecture Decisions- Wudi.md` (ADRs 001–010, recommended stack)
Goal: Build in ordered, demoable phases. Each phase has concrete outputs and an exit gate. No phase starts until its dependencies are met.

Launch constraint: Web + iOS + Android together in Nigeria, NGN pricing. Build web-first, then port to mobile to reduce risk (PRD §3, §9).

## Phase 0 — Decisions + Technical Foundation

**Goal:** Remove blockers before code.

Outputs:
- Locked decisions: cert payment deadline (at registration vs before end), payout hold period (e.g. 7 days), refund fee absorber, NGN prices (₦12,000 / ₦52,000 confirm), accepted ID docs + review SLA, payment provider (Paystack vs Flutterwave), feed upload limits, certificate consent copy.
- Repo scaffolding: `apps/web` (Next.js), `backend/` (single API), `packages/shared` (registration/attendance/cert/payment rules), infra for LiveKit self-hosted + TURN, Postgres + Redis + S3 storage + job queue, all runnable locally via `docker-compose.yml` (Postgres 16 + Redis 7 + S3Mock; R2 in staging/prod). See ADR-001–010 for stack rationale and data model v1.
- Core data model v1: `users, refresh_tokens, trainer_profiles, trainer_approvals, moderators, trainings, sessions, registrations, attendance_logs, certificates, payments, payouts, feed_posts, follows, saves, likes, reports, audit_logs, notifications`.
- Auth baseline: signup/login (email OR phone), password reset via OTP, rotating refresh tokens, TOTP 2FA for admins, timezone rule (store UTC, display Africa/Lagos).

Exit gate: All 11 open questions (§12) have an owner + decision or explicit default. `docker compose up -d` healthy locally; `GET /health` + login works on staging.

## Phase 1 — Accounts, Trainer Profiles, Follow

FR: 1.1–1.4, 2.1 (free training allowed)

Outputs:
- Screens: signup/login, participant profile, trainer onboarding form (name, photo, bio, topics, logo/signature upload), follow/unfollow + following list.
- APIs: `POST /auth/*`, `PUT /trainer/profile`, `POST /trainers/:id/follow`, `GET /me/following`.
- Storage: trainer assets in object storage with size/type validation.

Exit gate: Any user can become trainer, complete profile, be followed. E2E test covers this.

## Phase 2 — Training Creation, Invites, Registration

FR: 3.1–3.8, 4.1–4.4, 5.1, 5.4–5.6, 11.1 (partial)

Outputs:
- Screens: create/edit/reschedule/cancel training (title, desc, topic, dates + per-day times, cap by plan 50/200/500, format video/audio-only, cert option none/free/paid, min % 60–100 default 80%, assign moderators), training page, registration page (seats-left counter, full state, plain-words cert rule e.g. “Attend 80% to earn certificate”), my-registrations + cancel.
- Invite system: unique slug `/t/:slug/register`, SSR meta (og:title/image/description) for WhatsApp/X previews, copy-link + native share, cover image generator (e-card template v1).
- APIs: `CRUD /trainings`, `POST /trainings/:id/register`, `POST /registrations/:id/cancel`, atomic seat-claim via `UPDATE trainings SET seats_taken = seats_taken+1 WHERE id=$1 AND seats_taken < cap RETURNING` (no COUNT+lock).
- Jobs: confirmation email + reminders (T-24h, T-1h), change/cancel broadcast to registrants.

Exit gate: Trainer goes idea → live invite → N registrations → full → cancel-reopens-seat, with notifications delivered. Load test registration concurrency for 500-seat cap.

## Phase 3 — Live Classroom (LiveKit)

FR: 6.1–6.8, 11 (classroom events)

Outputs:
- LiveKit setup: self-hosted SFU + TURN, rooms per session (`trainingId-sessionDate`), tokens with roles (trainer/moderator/participant).
- Web classroom: video/audio or audio-only per training, participant low-data/audio-only toggle (required, not optional), chat, polls (create/vote/live results), raise-hand, screen share, mute/remove, end session. Multi-day = separate sessions/rooms.
- Permissions matrix enforced server-side (not just UI). No-record flag: ensure LiveKit egress/recording disabled.
- Moderator invite/accept flow (missing in PRD — define here): trainer adds by email → invite → accept → role scoped to training.

Exit gate: 50-user class stable on staging with chat + polls, permission tests pass, no recording artifact exists.

## Phase 4 — Attendance Engine

FR: 7.1–7.6

Outputs:
- Tracking: LiveKit join/leave webhooks → `attendance_logs`, present = stayed ≥75% of session duration. Per-session + program % (`present_sessions / total_sessions`).
- Screens: trainer attendance table + % summary, moderator correct present/absent override with reason, participant progress view (“2 of 3, 67% — need 80%”), post-session confirmation, at-risk alert, correction-request button → trainer/moderator inbox.
- APIs: `GET /trainings/:id/attendance`, `PATCH /sessions/:id/attendance`, `POST /attendance/correction-request`.

Exit gate: 3-session test training computes % correctly including disconnect + moderator correction. At-risk alert fires while fixable.

## Phase 5 — Certificates + Verification

FR: 8.1–8.7, 2.3–2.5 (approval plumbing for paid certs starts here, enforced in Phase 6)

Outputs:
- Eligibility engine: `attendance% >= min% AND (paid if required)`. Trainer approval UI lists only eligible; API rejects ineligible certification attempts.
- Certificate renderer: co-branded PDF + image (trainer name/logo/signature + Wudi seal + non-accredited disclaimer + unique number `WUDI-YYYY-XXXXXX`).
- Public verification `/verify/:number`: valid / revoked / not-found + name, training, trainer, date (only with participant consent flag collected at registration).
- Participant actions: view/download/share to LinkedIn/X/WhatsApp. Revoke by trainer/admin → verify page shows revoked.
- Storage: certificates immutable + permanently resolvable (PRD §7).

Exit gate: End-to-end: attend → eligible → approve → download → public verify → revoke → verify shows revoked.

## Phase 6 — Money: Paid Certs, Plans, Payouts, Refunds

FR: 5.2–5.3, 9.1–9.6, 12.1 (approval review)

Outputs:
- Payments: Paystack primary (locked), NGN, cards + transfer + USSD. Cert-fee checkout (per locked Phase-0 timing). Webhooks signature-verified, idempotent, reconciled to `payments`.
- Trainer approval flow: submit ID + expertise evidence → admin approve/reject-with-reason/revoke. ID docs in private bucket, encrypted, retention policy, NDPA-compliant access log. Gate: unapproved trainer cannot set paid cert price (API + UI).
- Plans: Free/Pro/Business with caps 50/200/500 + commission 5%/3%/1%. Provider fee shown separately. Trainer earnings page: amount / fee / commission / net / payout status.
- Payouts: after last session + hold period, payout job + ledger. Refunds: auto-full on trainer cancel/no-show; auto if participant cancels ≥24h before start; none after or for low attendance. Fee-absorber per Phase-0 decision.
- Admin: approval queue + payout review.

Exit gate: Paid-cert purchase → commission math correct → payout after hold → refund paths tested with sandbox provider. Audit log covers all money moves.

## Phase 7 — Explore Feed + Social + Notifications

FR: 10.1–10.8, 11.1–11.4, 4.5 (feed registration entry)

Outputs:
- Feed: scrollable upcoming-trainings posts (≤60s video, e-card, infographic with upload limits from Phase 0), card shows trainer/title/date/free-vs-certified + Register. Actions: watch, share, register, follow, save, like. Search/filter by topic/date/free-vs-certified. Full/cancelled/finished auto-marked/removed.
- Composer: upload video/image or use e-card/infographic templates.
- Notifications: push + email + in-app for confirmations, reminders, changes, new-training-from-followed, full-class, payment-received. SMS/WhatsApp via Termii lands in Phase 7 (moved forward — critical for Nigeria show-up rate).
- Reporting: report post/trainer → review queue.

Exit gate: Post → discover → register from feed; filters work; notifications deliver in <60s on staging.

## Phase 8 — Admin, Safety, Compliance

FR: 12.1–12.10, §7 NFRs

Outputs:
- Admin console: trainer-approval queue, unified review queue (newest first, auto-flags on top: N reports in M mins, scam keywords), one-click hide, suspend, audit log (who/when/what/why), platform metrics (trainings, registrations, payments, certs issued, verify visits).
- Community rules pages + reporting copy. Instant alerts (Slack/email) on flag. 24/7 rota doc + staffing plan.
- Legal/privacy: ToS, privacy policy, cert disclaimer, NDPC registration, breach runbook, ID-doc handling SOP.

Exit gate: Report → flag → hide in <5 min in drill. Audit log immutable. Legal sign-off filed.

## Phase 9 — Mobile Apps (iOS + Android)

FR: §5 parity

Outputs:
- Expo app parity for Phases 1–7: auth, browse/feed, register, classroom (LiveKit RN SDK with audio-only default on cellular), attendance progress, certificates, push notifications.
- Deep links: invite/registration/verify URLs open directly, no app-required gate. Fast invite load budget (e.g. <3s on 3G).
- Store compliance: permissions copy, data-safety forms.

Exit gate: Same E2E as web passes on both stores via TestFlight/Play internal track.

## Phase 10 — Launch Readiness

Outputs:
- Load tests: 500-user classroom (video + audio-only), 500 concurrent registrations, feed burst. Bandwidth/cost dashboard + alerts.
- Security review: auth, LiveKit tokens, webhook signatures, PII encryption, ID-doc access, rate limits, anti-enumeration on verify endpoint.
- Analytics: active trainers, regs/training, % full, show-up %, certs + paid %, verify visits, return rate, follower growth, revenue, % sessions without major issues (PRD §10).
- Cut list: if behind, defer Business analytics, custom cert design, multi-moderator to v1.1 — never cut safety, refunds, or verification.

Exit gate: All gates green, rollback plan tested, support rota live.

## Cross-cutting backlog (do not skip)

- Consent checkbox for public cert display at registration.
- Accessibility: contrast, font scaling, touch targets. Captions deferred.
- `GET /verify` rate-limited, no PII leakage on miss.
- Every admin/moderator override writes to audit log with reason.
