# Learnovize

Live social-media training platform: host live trainings, promote them through shareable invites and a social feed, and issue verifiable certificates tied to real attendance.

> Status: Draft v2 | Launch market: Nigeria first (prices in NGN) | Platforms: Web + iOS + Android

Full spec: [`DOCS/Product Requirements Document- Learnovize.md`](DOCS/Product%20Requirements%20Document-%20Learnovize.md)

## Vision

Anyone with knowledge to share can go from idea to a live, promoted, registered training in one place — no patchwork of social posts, forms, video-call links, spreadsheets, and design tools.

Participants get one place to discover trainings and earn certificates employers can actually verify.

## Problem

Trainers today piece together:
social post → registration form → video-call link → attendance spreadsheet → certificate design.

Participants have no easy place to discover trainings, and certificates are hard to trust.

## What Learnovize does

1. **Create & promote trainings** — title, description, topic, dates (single/multi-day), class-size cap, video or audio-only, certification option (none / free / paid).
2. **Shareable invites** — auto-generated invite with title, trainer, dates, cover image, and Register button. Link previews work on WhatsApp, X, Instagram, etc. Registration page shows seats left.
3. **Free attendance, paid certification** — attendance is always free. Certification is an optional add-on. Only approved trainers can offer paid certification.
4. **Live classroom** — WebRTC video/audio or audio-only, live chat, polls, raise-hand, screen share, mute/remove. Low-data mode for weak connections. No recordings/replays (live only).
5. **Trustworthy attendance** — auto-tracked by time stayed (present = ≥75% of session) + join/leave logs. Moderators can correct for network drops. Participants see progress live (e.g. "2 of 3 sessions, 67% — you need 80%") and get at-risk alerts.
6. **Verifiable certificates** — eligible only if attendance % met (trainer-set 60–100%, default 80%) + paid if required. Trainer approves final list (can't approve ineligible). Co-branded (trainer logo/signature + Learnovize seal), unique number, public verification page, revocation support.
7. **Explore feed** — scrollable promo feed for upcoming trainings (≤1 min video, e-card, infographic). Watch, share, register, follow trainer, save, like. Search by topic/date/free vs certified.
8. **Payments & payouts (NGN)** — cards (Verve/Visa/Mastercard), bank transfer, USSD via one main Nigerian provider (Paystack/Flutterwave TBD). Clear split: amount / provider fee / Learnovize commission / trainer payout. Payout after last session + holding period.

## Roles

| Role | What they do |
|------|--------------|
| Trainer | Creates/runs trainings, assigns moderators, approves certificates. Free trainings immediately; needs admin approval for paid certification |
| Moderator | Manages chat/polls, mute/remove, takes/corrects attendance |
| Participant | Discovers, registers, attends, earns certificates. Can follow trainers |
| Platform Admin | Approves paid-certification trainers, reviews reports, manages safety |
| Verifier (public) | Checks any certificate number — no account needed |

## Plans & limits

| Plan | Price | Commission on paid certs | Max class |
|------|-------|--------------------------|-----------|
| Free | Free | 5% | 50 |
| Pro | ~₦12,000/mo ($9 ref, TBC) | 3% | 200 |
| Business | ~₦52,000/mo ($39 ref, TBC) | 1% | 500 |

Pro adds custom certificate design. Business adds multiple moderators + analytics. Full split TBC.

## Tech direction (proposed)

| Area | Choice | Why |
|------|--------|-----|
| Live media | WebRTC SFU, self-hosted LiveKit | Roles, audio-only mode, chat/poll messaging, join/leave events, TURN for tough networks |
| Web | Next.js | SSR for fast invite links + proper social previews |
| Mobile | React Native (Expo) | Shared logic with web |
| Backend | Single API + shared rules for registration/attendance/certs/payments | Consistent across web/apps |
| Payments | One Nigerian provider first | Covers cards/transfer/USSD |

Self-hosting media = team owns capacity, monitoring, bandwidth cost. Load-test to 500 before launch.

## Non-goals (this release)

- No recordings/replays
- No waitlists, no comments, no personalized For-You feed
- No exams/assignments (attendance-only certification)

## Build order

1. Foundation: auth, trainer profiles, create training + invites, registration
2. Live classroom: video/audio, chat, polls, moderator, attendance
3. Certificates: rules, approval, co-branded certs, verification page
4. Money: paid certs, trainer approval, commissions, subscriptions, payouts/refunds
5. Explore feed: posts, follow/save/like, reporting + moderation
6. Mobile apps: iOS + Android parity
7. Launch prep: load testing, security review, NDPA compliance, admin tools

## Repo layout

```
LEARNOVIZE/
  README.md
  DOCS/
    Product Requirements Document- Learnovize.md
```

Code (`apps/web`, `apps/mobile`, `backend/`) lands in stages 1–6.

## Compliance & trust notes

- Certificates confirm attendance/completion only — not government-accredited (stated on cert).
- Nigeria Data Protection Act 2023 applies. Trainer ID docs stored securely, used only for approval.
- Feed safety at launch: user reports, review queue (newest first), auto-flags, instant alerts, one-click hide, audit log, 24/7 monitoring rota.
- Certificate numbers remain verifiable indefinitely.

## Open questions

- Final NGN prices + review cadence
- Full Free/Pro/Business feature split
- Payout holding period + who absorbs provider fee on refunds
- Accepted ID / proof-of-expertise docs + review SLA
- Payment provider selection, feed upload limits, community rules copy, monitoring staffing, legal (CAC, NDPC, ToS/privacy, cert wording)

## Contributing

PRD is still draft. Open an issue for product questions before code. Branch from `main`, keep PRs small per build stage above.
