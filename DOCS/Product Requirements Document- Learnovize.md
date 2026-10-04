# Product Requirements Document: Learnovize

Status: Draft v2  
Product name: Learnovize  
Product type: Social media training platform  
Purpose of this document: Describe what the product must do and why, so a development team, designer, or partner can build and evaluate it.  
---

## 1\. Overview

### 1.1 Vision

Learnovize is a platform where anyone with knowledge to share can host live online trainings, promote them through shareable invites and a social feed of short promo posts, and issue verifiable certificates to participants who complete them.

### 1.2 Problem

Trainers today piece together separate tools: a social post to advertise, a form to register people, a video call service to teach, a spreadsheet to track attendance, and a design tool to make certificates. Participants have no easy place to discover trainings, and certificates are hard for employers to trust.

### 1.3 Goals

1. Let a trainer go from idea to a live, promoted, registered training in one place.  
2. Deliver a smooth live classroom with video or audio-only, chat, and polls.  
3. Make certificates credible by tying them to real attendance and making them verifiable online.  
4. Give trainers and participants a reason to return through a discoverable feed of upcoming trainings.  
5. Earn revenue from paid certifications and trainer subscription plans.

### 1.4 Non-goals (for this release)

* Recordings and replays of trainings (trainings are live only).  
* Waitlists for full trainings.  
* Comments on feed posts and a personalized "For You" feed.  
* Exams, assignments, or graded assessments (see Future Considerations).

---

## 2\. Users and Roles

| Role | Description |
| :---- | :---- |
| Trainer | Creates and runs trainings, approves who receives certificates. Can host free trainings immediately. Needs platform approval before offering paid certification. |
| Moderator | Assigned by the trainer to a training. Manages chat and polls and takes attendance during class. |
| Participant | Browses trainings, registers, attends, and receives a certificate if eligible. |
| Platform Admin | Staff who approve trainers for paid certification, review reported content, and manage the platform. |
| Verifier (public) | Anyone (for example an employer) who checks a certificate number on the public verification page. No account required. |

---

## 3\. Release Approach

The product launches complete, with the website and the iPhone and Android apps available together, in Nigeria first. Prices are in Nigerian naira. To reduce risk, the work should still be built and tested in stages (see Section 9), so problems are found early.  
---

## 4\. Functional Requirements

### 4.1 Accounts and Profiles

* FR-1.1 Users can sign up and log in.  
* FR-1.2 Every user can act as a participant. Any user can also become a trainer by completing a trainer profile.  
* FR-1.3 A trainer profile includes name, photo, short bio, topics, and (optionally) logo and signature image for use on certificates.  
* FR-1.4 Participants can follow trainers and see the trainers they follow.

### 4.2 Trainer Approval

* FR-2.1 Any trainer can create and host free trainings immediately.  
* FR-2.2 A trainer must be approved by a Platform Admin before offering paid certification.  
* FR-2.3 A trainer submits an approval request with proof of identity and proof of expertise (for example a professional profile, past work or trainings, credentials, or a short intro video). A Learnovize reviewer approves or declines. The exact documents accepted are to be defined; see Open Questions.  
* FR-2.4 Admins can approve, reject (with a reason), or revoke approval.  
* FR-2.5 Identity documents submitted by trainers must be stored securely and used only for approval (see Section 7).

### 4.3 Creating a Training

A trainer creates a training with:

* FR-3.1 Title, description, and topic or category.  
* FR-3.2 Start date and time, and the number of days (single-day or multi-day), with the session time for each day.  
* FR-3.3 Target attendance: the maximum number of participants. This is a hard limit, capped by the trainer's plan: Free 50, Pro 200, Business 500\.  
* FR-3.4 Format: video and audio, or audio-only.  
* FR-3.5 Certification option: none, free certification, or paid certification (paid only for approved trainers) with a price.  
* FR-3.6 Minimum attendance for certification, as a percentage of sessions. The default is 80%, and the trainer can choose between 60% and 100% for each training.  
* FR-3.7 Assignment of one or more moderators.  
* FR-3.8 A trainer can edit, reschedule, or cancel a training. All registered participants are notified of any change or cancellation. *(Proposed)*

### 4.4 Invite Post

* FR-4.1 When a training is created, the platform generates a shareable invite containing the title, trainer, date(s), a design image, and a Register button linking to the registration page.  
* FR-4.2 The invite link shows a proper preview (title, image, description) when shared on social media and messaging apps.  
* FR-4.3 Trainers can share the invite directly to other platforms and copy the link.  
* FR-4.4 The registration page shows how many seats are left.

### 4.5 Registration

* FR-5.1 Participants register for a training from the invite link, the feed, or the training page.  
* FR-5.2 Attendance is free. Certification, where offered, is an optional paid or free add-on according to the trainer's setting. Trainers cannot charge for entry to a training.  
* FR-5.3 For paid certification, the participant pays at registration or before the training ends (exact timing to be decided).  
* FR-5.4 Registration closes automatically when the target attendance is reached. The page then shows the training as full.  
* FR-5.5 Registered participants receive a confirmation and reminders before the training starts.  
* FR-5.6 Participants can cancel their registration. Cancelling frees a seat and reopens registration if the training has not yet started. A participant who paid for certification receives a refund if they cancel at least 24 hours before the start (see 4.9).

### 4.6 Live Classroom

* FR-6.1 The classroom supports video and audio, or audio-only, as set by the trainer.  
* FR-6.2 Participants can also choose an audio-only or low-data mode to save data on weak connections. *(Recommended)*  
* FR-6.3 Live chat is available to everyone in the class.  
* FR-6.4 Polls: the trainer or moderator can create a poll, participants vote, and results are shown live.  
* FR-6.5 Permissions:  
  * Trainer: speak, share video, share screen, manage chat and polls, end the session, mute or remove participants.  
  * Moderator: manage chat and polls, mute or remove participants, take attendance.  
  * Participant: watch and listen, chat, vote in polls, and (if the trainer allows) raise a hand or speak.  
* FR-6.6 The trainer and moderator can remove disruptive participants.  
* FR-6.7 Sessions are not recorded. The platform must not offer replays.  
* FR-6.8 For multi-day trainings, each day is a separate session within the same training.

### 4.7 Attendance

* FR-7.1 Attendance is recorded automatically by time stayed: a participant counts as present in a session if they stay for at least 75% of the session. This rule is the same for every training.  
* FR-7.2 The platform logs when each participant joins and leaves.  
* FR-7.3 The moderator can correct attendance for a session, for example when a participant lost connection, by marking participants present or absent.  
* FR-7.4 Attendance is recorded per session, so multi-day trainings track each day. A participant's attendance percentage is the share of sessions in which they were present.  
* FR-7.5 The trainer can see an attendance summary for each participant, including their attendance percentage.  
* FR-7.6 Clarity for participants (required):  
  * The training page states the rule in plain words before registration, for example "Attend at least 80% of the sessions to earn your certificate."  
  * Each participant sees their own progress during the programme, for example "2 of 3 sessions attended, 67%. You need 80%."  
  * After each session, they get confirmation that their attendance was recorded.  
  * They are alerted when they are at risk of missing the minimum, while there is still time to fix it.  
  * They can raise a correction request with the trainer or moderator.

### 4.8 Certificates

* FR-8.1 A participant is eligible only if their attendance meets the training's minimum percentage and, for paid certification, they have paid.  
* FR-8.2 At the end of the programme, the trainer sees the list of eligible participants and approves who receives a certificate. The trainer cannot certify someone who does not meet the minimum attendance.  
* FR-8.3 Certificates are co-branded: they show the trainer's name, logo, and signature, and the platform's seal.  
* FR-8.4 Each certificate has a unique certificate number.  
* FR-8.5 A public verification page lets anyone enter a certificate number and see whether it is genuine, along with the participant's name, training title, trainer, and date.  
* FR-8.6 Participants can view, download, and share their certificates, including to professional and social networks.  
* FR-8.7 A trainer or admin can revoke a certificate. A revoked certificate shows as revoked on the verification page.

### 4.9 Payments and Revenue

* FR-9.1 Payments are made in Nigerian naira through one main Nigerian payment provider supporting cards (Verve, Visa, Mastercard), bank transfer, and USSD. A second provider may be added later.  
* FR-9.2 Plans and commission:

| Plan | Price | Learnovize commission on paid certifications | Maximum class size | Other benefits |
| :---- | :---- | :---- | :---- | :---- |
| Free | Free | 5% | 50 | Core features |
| Pro | $9 per month (USD reference; proposed ₦12,000, to be confirmed) | 3% | 200 | Custom certificate design |
| Business | $39 per month (USD reference; proposed ₦52,000, to be confirmed) | 1% | 500 | Multiple moderators, analytics |

The full split of features between plans is to be confirmed.

* FR-9.3 Payment provider fees are shown separately from Learnovize's commission. Trainers see a clear breakdown of each payment: amount paid, provider fee, Learnovize commission, and amount due to the trainer.  
* FR-9.4 Payouts: the trainer is paid after the last session ends, following a short waiting period in case of problems. The payout is the payments received minus Learnovize's commission and payment fees. The length of the waiting period is to be decided.  
* FR-9.5 Refunds:  
  * A full refund if the trainer cancels or does not hold the training.  
  * A refund if the participant cancels at least 24 hours before the start.  
  * No refund after that, or if the participant attends but does not meet the minimum attendance.  
  * Who absorbs the payment provider's fee on a refund is to be decided.  
* FR-9.6 Trainers can see their earnings, the commission and fees deducted, and payout status.  
* FR-9.7 Faster payouts for trusted, well-rated trainers may be offered later, for example as a perk on higher plans. *(Future)*

### 4.10 Explore Feed

* FR-10.1 The Explore page is a scrollable social feed of promo posts for upcoming trainings.  
* FR-10.2 A post can be a video of up to 1 minute, an e-card, or an infographic.  
* FR-10.3 Each post shows the trainer, the training title and date, whether it is free or certified, and a Register button.  
* FR-10.4 Participants can watch, share, register, follow the trainer, save the training, and like the post.  
* FR-10.5 Participants can browse or search by topic, date, and free versus certified.  
* FR-10.6 Trainers can create feed posts for their trainings (uploading their own video or image, or using the platform's e-card and infographic templates).  
* FR-10.7 Posts go live immediately. Users can report any post, and admins can review reports, hide or remove posts, and suspend accounts (see 4.12).  
* FR-10.8 Posts for trainings that are full, cancelled, or finished are marked accordingly or removed from the feed.  
* FR-10.9 Comments and a personalized feed are not in this release.

### 4.11 Notifications

* FR-11.1 Participants are notified of registration confirmation, reminders before a training starts, and changes or cancellations.  
* FR-11.2 Participants are notified when a trainer they follow announces a new training.  
* FR-11.3 Trainers are notified of new registrations, when a training becomes full, and when a certificate payment is received.  
* FR-11.4 Notifications are sent by push notification (mobile), email, and in-app.

### 4.12 Admin and Safety

* FR-12.1 Admins can review trainer approval requests.  
* FR-12.2 Admins can review reported posts, trainers, and certificates, and take action.  
* FR-12.3 Admins can view platform activity such as number of trainings, registrations, payments, and certificates issued.  
* FR-12.4 Community rules define what content and behavior are not allowed.  
* FR-12.5 A review queue shows new posts and reported posts in one place, newest first.  
* FR-12.6 Automatic flags push suspicious posts to the top of the queue, for example a post with several reports in a short time, or one containing words linked to scams.  
* FR-12.7 The team receives instant alerts when a post is flagged.  
* FR-12.8 Admins have a hide button that removes a post from the feed immediately while it is investigated.  
* FR-12.9 Every admin action is recorded in an audit log.  
* FR-12.10 Reports are monitored round the clock, with the Learnovize team working in shifts.

---

## 5\. Platforms

* Website that works well on desktop and phone browsers.  
* iPhone app and Android app, offering the same core features.  
* Invite and registration pages must load quickly and open directly from shared links, without requiring the app.

---

## 6\. Technical Direction

> Note: technical specifications and architectural structures are documented separately in `DOCS/Architecture Decisions- Learnovize.md` (stack, ADRs 001–010, data model) and run locally via `docker-compose.yml` (Postgres + Redis + S3Mock; Cloudflare R2 in staging/production). This PRD defines product behavior only — see those files for implementation detail.

Self-hosting the media server means the team is responsible for server capacity, monitoring, and bandwidth costs. The team should plan and load-test for the maximum class size.  
---

## 7\. Non-Functional Requirements

* Performance and reliability: Live classes should stay stable at the maximum target attendance. Load testing is required before launch.  
* Low data usage: Audio-only and low-data options must work well on weak or expensive connections.  
* Security and privacy: Protect personal data and payment information, and only show certificate details on the verification page that the participant has agreed to make public. Comply with the Nigeria Data Protection Act 2023, including registration with the Nigeria Data Protection Commission where required, breach reporting, and secure handling of trainers' identity documents.  
* Certificate wording: Certificates confirm attendance and completion. They must state that they are not government-accredited qualifications.  
* Trust and safety: Reporting and removal tools must exist at launch, especially for the Explore feed.  
* Accessibility: Text sizes, contrast, and controls should support all users. Captions are a future consideration.  
* Availability of certificates: Certificate numbers must remain verifiable indefinitely.

---

## 8\. Key Decisions Log

| Topic | Decision |
| :---- | :---- |
| Live classroom | Self-hosted WebRTC with a media server, using LiveKit |
| Platforms | Website plus iPhone and Android apps together |
| Build approach | Recommended: Next.js for the website and React Native for the mobile apps |
| Revenue | Commission on paid certifications plus trainer subscription plans |
| Who can train | Anyone can host free trainings; approval required for paid certification |
| Certificate rules | Minimum attendance (trainer-set), then trainer approval |
| Certificate style | Co-branded with unique verifiable number |
| Discovery | Invite links plus an Explore feed of 1-minute videos, e-cards, and infographics |
| Feed actions | Watch, share, register, follow, save, like (no comments yet) |
| Target attendance | Hard limit; registration closes automatically |
| Recordings | None; trainings are live only |
| Launch scope | Everything at once |
| Launch market | Nigeria first, with prices in naira |
| Commission | Free 5%, Pro 3%, Business 1%; payment provider fees shown separately |
| Plans | Free, Pro ($9 per month), Business ($39 per month), USD reference |
| Class size limits | Free 50, Pro 200, Business 500 |
| Minimum attendance | Default 80%, trainer can choose 60% to 100% |
| Present in a session | Stays at least 75% of the session; moderator can correct |
| Refunds | If trainer cancels, or participant cancels at least 24 hours before start |
| Trainer approval | Identity check plus proof of expertise, reviewed by Learnovize |
| Payouts | After the training ends, following a short waiting period |
| Payments | One main Nigerian provider: cards, bank transfer, USSD |
| What participants pay for | Only the certificate; attendance is always free |
| Feed safety | Posts live immediately, user reports, round-the-clock monitoring |

---

## 9\. Suggested Build Order

Although the launch is complete, build and test in stages:

1. Foundation: sign-up, trainer profiles, creating trainings and invites, registration.  
2. Live classroom: video and audio, chat, polls, moderator role, attendance.  
3. Certificates: attendance rules, trainer approval, co-branded certificates, online verification.  
4. Money: paid certification, trainer approval for paid trainings, commission, subscription plans, payouts.  
5. Explore feed: posts, follow, save, like, reporting and removal.  
6. Mobile apps: iPhone and Android versions of all the above.  
7. Launch preparation: load testing, security review, content and safety rules, admin tools.

---

## 10\. Success Metrics (Suggested)

* Number of active trainers and trainings hosted each month.  
* Registrations per training, and the share of trainings that reach their target attendance.  
* Show-up rate (registered participants who actually attend).  
* Certificates issued and the share of paid certifications.  
* Verification page visits, as a signal that certificates are being checked.  
* Return rate of participants and follower growth on trainers.  
* Revenue from commissions and subscriptions.  
* Classroom quality: percentage of sessions without major connection problems.

---

## 11\. Risks

| Risk | Mitigation |
| :---- | :---- |
| Launching everything at once takes long and costs more | Build in stages, test each stage, and be ready to cut or delay lower-priority features if needed. |
| Live classes struggle at high attendance | Load testing, sensible maximum class sizes, and audio-only fallback. |
| Low-quality or fake trainers damage trust in certificates | Approval for paid certification, attendance rules, revocation, and public verification. |
| Inappropriate or misleading feed content | Reporting, admin review, and clear community rules from day one. |
| Hard attendance limit turns away interested people | Show demand to the trainer; consider a waitlist in a future release. |
| Video hosting and bandwidth costs grow with usage | Monitor usage, set upload limits, and review the subscription and commission pricing. |
| Payment disputes and refunds | Clear refund policy (see 4.9) and record of all transactions. |
| Thin margin on the Free plan: 5% commission, and free trainings still cost money to run | Class size limits, paid plans, and close monitoring of cost per training. |
| Round-the-clock monitoring is costly for a small team | Automatic flags, the hide button, careful shift planning, and a budget for it. |
| Not complying with the Nigeria Data Protection Act | Legal advice, registration with the regulator, and secure storage of trainers' ID documents. |
| Naira exchange-rate changes affect plan prices | Price in naira and review prices regularly. |

---

## 12\. Open Questions

1. Branding: logo and visual identity, and confirming the name Learnovize is available (website address, social media handles, and trademark).  
2. Naira prices: confirm ₦12,000 for Pro and ₦52,000 for Business, and how often prices are reviewed.  
3. Feature split: exactly which features belong to Free, Pro, and Business, beyond class size, commission, custom certificate design, multiple moderators, and analytics.  
4. Payouts and refunds: the length of the waiting period before payouts, and who absorbs the payment provider's fee on a refund.  
5. Trainer approval: which identity documents and proof of expertise are accepted, and how long a review should take.  
6. Payment provider: which provider is selected, and its onboarding requirements.  
7. Feed upload limits: video file size, image size, and formats.  
8. Community rules: the written rules for the Explore feed and live classes.  
9. Monitoring team: how many people are needed for round-the-clock monitoring, and the shift plan.  
10. Legal: company registration, registration with the Nigeria Data Protection Commission, terms of service, privacy policy, and certificate wording, all to be confirmed with a Nigerian lawyer.  
11. Who owns the certificate's validity if a trainer leaves the platform.

---

## 13\. Future Considerations

* Waitlists for full trainings.  
* Comments and a personalized "For You" feed.  
* Recordings and replays, possibly as a perk for paid participants.  
* Final tests or assignments as a requirement for certification.  
* Captions and translations.  
* Trainer teams and organizations, and bulk registration.  
* Analytics dashboards for trainers.

---

## 14\. Implementation Plan (summary)

Full plan with concrete outputs and exit gates: `DOCS/Implementation Plan- Learnovize.md`. Build web-first, then port to mobile; no phase starts until its dependencies are met.

| Phase | Scope | Key outputs | Exit gate |
| :---- | :---- | :---- | :---- |
| 0 — Decisions + Foundation | Close §12 blockers, scaffold repo + local stack | Locked money/approval/upload decisions; `apps/web`, `backend/`, `packages/shared`; data model v1; auth baseline | All 11 open questions owned; `docker compose up -d` healthy; login works |
| 1 — Accounts | FR-1.1–1.4, 2.1 | Signup/login, trainer profile (photo/bio/logo/signature), follow | Any user → trainer → followed |
| 2 — Training + Invites + Registration | FR-3, 4, 5.1, 5.4–5.6 | Create/edit/cancel training; SSR invite `/t/:slug/register` with previews; atomic seat-claim; confirm/reminder/change mails | Idea → invite → full → cancel-reopens-seat |
| 3 — Live Classroom | FR-6 | LiveKit rooms per session, role tokens, chat/polls/raise-hand/share, mandatory low-data mode, no recording, moderator invite/accept | 50-user class stable; permission tests pass |
| 4 — Attendance | FR-7 | Join/leave webhooks, present = ≥75% session, program % + progress view, at-risk alerts, moderator corrections | 3-session % correct incl. disconnect + correction |
| 5 — Certificates | FR-8 | Eligibility (attendance% + paid), trainer approves only eligible, co-branded PDF + `LEARNOVIZE-YYYY-XXXXXX`, public `/verify`, revoke | Attend → approve → verify → revoke → revoked |
| 6 — Money | FR-5.2–5.3, 9 | Paystack NGN (cards/transfer/USSD), trainer approval gate, plans 50/200/500 + 5%/3%/1%, earnings page, held payouts, refunds | Purchase → correct split → payout → refund paths pass |
| 7 — Feed + Notifications | FR-10, 11 | Promo posts (60s video/e-card/infographic), register/follow/save/like, filters; push/email/in-app + Termii SMS/WhatsApp | Post → discover → register from feed |
| 8 — Admin + Safety | FR-12, §7 | Approval + review queues, one-click hide, audit log, metrics; ToS/privacy/NDPA docs; 24/7 rota | Report → hide <5 min in drill |
| 9 — Mobile | §5 parity | Expo iOS/Android parity, deep links, <3s invite on 3G | Web E2E passes on both stores |
| 10 — Launch | Load/security/analytics | 500-user + 500-seat tests, security review, §10 metrics, cut list (never safety/refunds/verification) | All gates green, rollback tested |

---

## 15\. Notes (locked working agreements)

* Stack: Next.js (SSR invites/verify) + Expo + single backend (NestJS; Route Handlers allowed Phases 1–2) + `packages/shared` rules; Postgres 16 + Redis 7; LiveKit + TURN, recording off; Paystack primary (Flutterwave later). Details: `DOCS/Architecture Decisions- Learnovize.md`.
* Storage: S3Mock locally (buckets `learnovize-public`/`learnovize-private`, path-style) → Cloudflare R2 in staging/prod (zero egress, CDN on public, locked private, 5-min signed URLs). Same S3 keys; only endpoint changes.
* Local run: `docker compose up -d postgres redis s3mock` (see `docker-compose.yml`, `.env.example`). Cloud later.
* Money defaults (confirm in Phase 0): charge cert fee at registration; payout after last session + hold (e.g. 7 days); full refund on trainer cancel or participant cancel ≥24h before start.
* Trust rules: attendance present = ≥75% of session; program min trainer-set 60–100% (default 80%); trainer cannot certify ineligible; certs immutable with consent-gated verify page; every admin/moderator override logged with reason.
* Design: tokens + components in `DOCS/Design System- Learnovize.md`, visual preview in `DOCS/design-preview.html`.

