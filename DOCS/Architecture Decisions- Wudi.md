# Architectural Decisions & Recommendations: Wudi

Source: PRD §6 Technical Direction (`DOCS/Product Requirements Document- Wudi.md:202-215`)
Companion: `DOCS/Implementation Plan- Wudi.md` Phase 0

All decisions optimize for: Nigeria-first (expensive data, weak networks, NGN payments), 50/200/500 class caps, web + iOS + Android parity, and verifiable certificates.

## Summary (accept PRD §6, with specifics)

| Area | Recommendation | Status |
|------|---------------|--------|
| Monorepo | pnpm + Turborepo: `apps/web`, `apps/mobile`, `backend/`, `packages/shared` | Accepted |
| Web | Next.js App Router, SSR for `/t/:slug`, `/verify/:number` | Accepted |
| Mobile | React Native + Expo (managed, EAS builds) | Accepted |
| Backend | Single TypeScript API: NestJS + Postgres + Prisma + Redis queue, S3-compatible storage | Recommended |
| Live media | Self-hosted LiveKit SFU + coturn TURN, recording/egress disabled | Accepted with fallback below |
| DB | Postgres (transactions for seats/money), Redis (jobs, presence cache) | Recommended |
| Auth | Email + password + email OTP, JWT access + rotating refresh; phone later | Recommended |
| Payments | Paystack primary, NGN, cards + transfer + USSD; Flutterwave as second later | Recommended |
| Notifications | SES/Resend (email) + Expo Push (FCM/APNs) + `notifications` table (in-app); Termii SMS/WhatsApp as Phase-10 add-on | Recommended |
| Hosting | Web on Vercel; API + LiveKit + TURN on single-region VMs (EU-West, add Lagos relay when measured); object storage S3-compatible | Recommended |

## ADR-001 — Single backend + shared rules package

Context: PRD requires identical registration, attendance (≥75% session, 60–100% program), certification, and payment math on web and mobile.

Decision: One `backend/` API owns all writes. Pure rules live in `packages/shared` (e.g. `isPresent(durationMs, stayedMs)`, `programPct(present,total)`, `isEligible(pct,minPct,paid)`, `commission(plan,amount)`) and are unit-tested once, imported by API and (read-only) by clients.

Alternatives: Logic duplicated per client; BFFs per platform — rejected (drift risk for money/certs).

Consequences: Clients stay thin; all money/cert checks re-validated server-side.

## ADR-002 — Web: Next.js App Router with SSR

Context: Invite/registration/verify pages must load fast from shared links without the app and show proper `og:title/image/description` previews (FR-4.2, §5).

Decision: Next.js App Router. `/t/:slug/register` and `/verify/:number` are server-rendered with cached OG tags. Classroom and dashboards are client components.

Alternatives: Vite SPA — rejected (no SSR previews, slower first load on 3G).

Consequences: Vercel or any Node host works; must set OG image cache + <3s budget on 3G.

## ADR-003 — Mobile: React Native + Expo

Context: Same core features on iPhone + Android with one team (PRD §5, §6).

Decision: Expo managed workflow, EAS builds, Expo Router + deep links (`wudi://t/:slug`, `https://wudi.ng/t/:slug`). LiveKit RN SDK; default to audio-only on cellular.

Alternatives: Native Swift/Kotlin, Flutter — rejected (two codebases or new language, slower for JS team).

Consequences: Must validate LiveKit + Expo SDK compat early in Phase 3; EAS subscription cost planned.

## ADR-004 — Backend: NestJS + Postgres + Prisma + Redis (local-first)

Context: Money and seats need ACID transactions; team is TypeScript-first (Next.js + Expo). App & DB run locally for now (Docker Compose), cloud later.

Decision: NestJS (modules: auth, trainings, registrations, classroom, attendance, certs, payments, feed, admin), Postgres 16 + Prisma, Redis + BullMQ for reminders/payouts/webhook retries, S3-compatible storage (public bucket: covers/feed; private bucket: IDs/certs source PDFs). Local: Postgres + Redis + MinIO (S3) + LiveKit + coturn via `docker-compose.yml`. Solo-dev allowance: Phases 1–2 may run as Next.js Route Handlers + Prisma, extracted to NestJS at Phase 6 — `packages/shared` stays pure either way.

Alternatives: Firebase/Supabase-only — rejected (seat-race + payout ledger + webhook reconciliation need explicit transactions and audit control). Express bare — rejected (no opinionated modules for growing team).

Consequences: Run migrations in CI and locally (`prisma migrate dev`); every money/cert write in a DB transaction + idempotency key on webhooks. No cloud dependency for day-1 dev: `docker compose up postgres redis minio livekit`.

## ADR-005 — Live media: self-hosted LiveKit SFU + TURN, no recording

Context: 50–500 live rooms, audio-only/low-data required, join/leave events feed attendance, must disable replays (FR-6.7).

Decision: Self-hosted LiveKit + coturn, one room per session (`trainingId-sessionId`), short-lived tokens with role claims (`trainer|moderator|participant`), DataChannel for chat/polls, webhook `participant_joined/left` → attendance service. Egress/recording disabled at config + verified in tests.

Alternatives: LiveKit Cloud / Daily / Agora — keep as fallback if self-host ops slip: run Phase 3 on LiveKit Cloud, migrate to self-hosted before Phase 10 load test. Do not build recording.

Consequences: Team owns capacity/monitoring/bandwidth (PRD §6 note). Phase-10 must load-test 500 with video + audio-only mix and publish cost-per-training-hour. Deploy TURN with TLS on 443 (Nigerian NATs/firewalls).

Hosting note: Start API + LiveKit in EU-West (best Lagos latency/cost trade-off on Hetzner/Fly/AWS), measure p95 join time; add Lagos-region TURN relay if p95 >3s or packet loss high. CDN (CloudFront/Cloudflare) for covers/feed/certs.

## ADR-006 — Data model v1 (authoritative tables, hardened)

`users(id, email citext unique, phone unique?, password_hash, role_flags, created_at)`
`refresh_tokens(id, user_id FK, token_hash unique, revoked_at?, created_at)` — rotating refresh, stored hashed.
`trainer_profiles(user_id FK, display_name, photo_url, bio, topics[], logo_url, signature_url, paid_cert_approved, approval_state, rejection_reason)`
`trainer_approvals(id, trainer_id, id_doc_urls[private], expertise_evidence, status, reviewer_id, decided_at)`
`moderators(training_id FK, user_id FK, status[invited|active|removed], primary key(training_id,user_id))` — scopes LiveKit moderator tokens.
`trainings(id, slug unique, trainer_id, title, description, topic, format[video|audio], cert_mode[none|free|paid], cert_price_ngn?, min_pct default 80 check 60–100, cap, seats_taken default 0, plan, status[draft|live|full|cancelled|finished], created_at)`
`sessions(id, training_id, starts_at_utc, ends_at_utc, livekit_room, status)`
`registrations(id, training_id, user_id, cert_consent_public bool, cert_paid bool, status[active|cancelled], unique(training_id,user_id), partial unique(training_id,user_id) where active)`
`attendance_logs(id, session_id, user_id, joined_at, left_at, stayed_ms, present bool, corrected_by?, correction_reason?, unique(session_id,user_id))`
`certificates(id, number unique text check `WUDI-YYYY-XXXXXX` format, training_id, user_id, pdf_url, image_url, sha256, status[valid|revoked], revoked_reason?)` — immutable, never overwritten.
`payments(id, registration_id, provider, provider_ref unique, amount_ngn, provider_fee_ngn, commission_ngn, net_ngn, status, idempotency_key unique, raw_webhook jsonb)`
`payouts(id, trainer_id, training_id, amount_net, status[pending|held|paid|failed], hold_until)`
`feed_posts(id, training_id, type[video|ecard|infographic], media_url, thumb_url?, status[live|hidden|removed], reports_count)`
`follows(follower_id, trainer_id)`, `saves(user_id, training_id)`, `likes(user_id, post_id)`
`reports(id, target_type, target_id, reporter_id, reason, status)`, `audit_logs(id, actor_id, action, target, reason, created_at)` — append-only, no UPDATE/DELETE grants.
`notifications(id, user_id, type, payload jsonb, read_at?)`

Rules: seats via atomic `UPDATE trainings SET seats_taken = seats_taken+1 WHERE id=$1 AND seats_taken < cap RETURNING seats_taken` (no COUNT+FOR UPDATE); money math recomputed server-side from `packages/shared` (never trust client amount); verify endpoint rate-limited, no user enumeration on miss. Indexes: `registrations(training_id, status)`, `attendance_logs(user_id, session_id)`, `certificates(number)`, `payments(provider_ref, idempotency_key)`.

## ADR-007 — Auth + timezone + privacy (local-first)

Decision: Email OR phone signup; email-OTP now, Termii SMS/WhatsApp OTP moved forward to Phase 7 (Nigeria activation). Email + password + OTP verify; JWT (15 min) + rotating refresh stored hashed in `refresh_tokens` (30 d, reuse detection revokes chain); password reset via OTP, rate-limit 5/hr/IP + 3/hr/account. Admins require TOTP 2FA from day 1 (holds ID docs + payouts). LiveKit tokens separate: 2h TTL, role claims checked against `moderators` table. Store all times UTC, display `Africa/Lagos`. Collect `cert_consent_public` checkbox at registration — verify page shows name/training/trainer/date only if true, else minimal valid/invalid + redacted view. ID docs: private bucket (MinIO locally, R2/S3 in cloud), SSE, signed URLs with 5-min expiry, access logged, retention auto-purge rejected docs after 90 days (confirm with lawyer).

## ADR-008 — Payments: Paystack first

Context: NGN cards (incl. Verve), transfer, USSD required (FR-9.1).

Decision: Paystack primary (best Verve/USSD coverage + webhooks + transfers for payouts). Abstract behind `payments/` port so Flutterwave can be added later. Payouts via Paystack Transfers after hold period. All webhooks signature-verified + idempotent.

Recommendation: Lock in Phase 0: cert fee charged at registration (simpler refunds) vs before-end (higher conversion, harder dunning). Default recommendation: charge at registration, auto-refund on ≥24h cancel.

## ADR-009 — Notifications (show-up rate is the risk)

Decision: `notifications` table + workers → Resend/SES email, Expo Push, in-app inbox. Triggers: confirm, T-24h/T-1h reminders, reschedule/cancel, new-training-from-followed, full-class, payment-received, attendance-confirmation, at-risk. Add Termii SMS/WhatsApp in Phase 10 if show-up <60% — push/email alone underperforms in Nigeria.

## ADR-010 — Observability, security, cost guards

Decision: OpenTelemetry traces (API + LiveKit webhooks), Sentry, Postgres slow-query log, LiveKit room metrics (join p95, packet loss, drop %), bandwidth dashboard + per-training cost estimate. Security: LiveKit tokens 2h TTL, webhook secrets rotated, rate limits on register/verify/login, PII encryption at rest, admin actions require reason → `audit_logs`. Cost guards: feed video ≤60s + size cap (e.g. 50 MB), image ≤5 MB, classroom default 720p / audio-only toggle kills video uplink.

## What to confirm in Phase 0 (blocking)

1. Paystack vs Flutterwave + transfer fees + refund fee absorber.
2. VM region + LiveKit sizing for 500 (test before committing to self-host).
3. S3-compatible vendor + private-bucket encryption + NDPA retention.
4. Cert payment timing + payout hold days + NGN prices.
5. SMS/WhatsApp budget (Termii) — include or explicitly defer.

Reject for v1: microservices, multi-region active-active, custom SFU, recordings/replays, personalized feed ranking, exams/grading.
