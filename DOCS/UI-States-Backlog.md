# UI States Backlog — Learnovize

Adopted from a design-system review that surfaced a practice worth copying: *"70+ screens
designed to account for any potential scenario."*

That is the standard this file holds us to. **A screen is not done when the happy path works.**
It is done when the states a real user will actually hit are designed, built and reachable.

## How to use this

Every page owns a row below. Before a page ships, confirm each applicable state is handled —
or explicitly marked N/A with a reason. No silent gaps.

Priority:
- **P0** — the state blocks a real user from completing something important
- **P1** — the state degrades trust or causes support load
- **P2** — polish

---

## Global states (apply everywhere)

| # | State | Priority | Notes |
|---|---|---|---|
| G1 | Loading (skeleton, not spinner) | P1 | Never a blank screen. Skeletons only for list content. |
| G2 | Empty — first run | P0 | **Most important on this product.** Cold-start copy + a real next action, never a dead end. |
| G3 | Empty — filtered out | P1 | "No results for X" + a one-tap way to clear filters. |
| G4 | Offline | P0 | Reads are cached; writes are queued or clearly refused. Never silently fail. |
| G5 | Request failed | P0 | Say what failed and offer Retry. Never a raw error string. |
| G6 | Not found / deleted | P1 | Distinct from empty — the thing existed and no longer does. |
| G7 | Unauthorised (401) | P0 | Redirect to login with a return path, not a dead end. |
| G8 | Forbidden (403) | P0 | Suspended accounts get a support route, not a bare error. |
| G9 | Rate limited (429) | P1 | Explain the wait and when they can retry. |
| G10 | Long content | P2 | 80-character titles, 5-line bios, empty avatars, no image. |
| G11 | Slow network | P2 | Skeletons persist; timeouts offer retry rather than a blank frame. |
| G12 | Session expired mid-task | P1 | Preserve form input across re-auth. Losing a typed form is unacceptable. |

---

## Page-by-page

### Home (`/`)
| # | State | Priority | Notes |
|---|---|---|---|
| H1 | No registered trainings yet | P0 | Onboard to Explore. Currently shows nothing useful. |
| H2 | Next session happening right now | P0 | A "Join now" affordance is the single highest-value home state. |
| H3 | All sessions finished | P1 | Pivot to certificates and new trainers to follow. |

### Explore / feed (`/feed`)
| # | State | Priority | Notes |
|---|---|---|---|
| E1 | **Zero posts platform-wide** | P0 | **Live today.** Needs real cold-start copy and a route to follow trainers. |
| E2 | Some trainers, no posts for this trainer | P1 | Hide them rather than show an empty tile. |
| E3 | Filter returns nothing | P1 | Show which filter caused it, with a clear-filters action. |
| E4 | Media failed to load | P1 | Broken-image placeholder; never a dead rectangle. |
| E5 | Seats left = 1 | P1 | Social proof — surface scarcity honestly. |
| E6 | Training full | P1 | Join the waitlist rather than a dead end. |

### Signup / OTP (`/signup`)
| # | State | Priority | Notes |
|---|---|---|---|
| S1 | Email already registered | P1 | Offer to log in instead of a bare 409. |
| S2 | Code expired | P0 | Resend inline. Already handled. |
| S3 | Attempts exhausted | P0 | Resend-gated. Already handled. |
| S4 | Email did not arrive | P0 | Resend endpoint. Already handled. |
| S5 | Signed up, closed the tab | P1 | Returning user can resume verification via resend. |

### Classroom (`/classroom/[id]`)
| # | State | Priority | Notes |
|---|---|---|---|
| C1 | Join failed / token expired | P0 | Token is 2h — handle expiry with a re-mint prompt. |
| C2 | Camera or mic denied | P0 | **Critical.** Must degrade to audio-only, never a dead room. |
| C3 | Network degraded, packet loss | P0 | Show a warning; suggest audio-only. |
| C4 | Host left mid-session | P0 | Tell participants the host ended it. |
| C5 | Reconnecting after drop | P0 | Persistent banner, never a silent stall. |

### Payments
| # | State | Priority | Notes |
|---|---|---|---|
| P1 | Abandoned checkout, returned later | P0 | Reconcile + resume. Built and verified. |
| P2 | Paid, webhook missed | P0 | Reconcile on return. Built and verified. |
| P3 | Underpaid | P0 | Never silently credit. Built and verified. |
| P4 | Trainer has not released payout | P0 | Show "pending" with the actual date, not a failure. |
| P5 | Payment provider unreachable | P0 | Retry with backoff; never lose a paid transaction. |

### Certificates (`/me/certificates`)
| # | State | Priority | Notes |
|---|---|---|---|
| R1 | Eligible, not yet issued | P0 | Show "you're eligible" — a reason to return. |
| R2 | Not yet eligible | P1 | Show exactly what is missing and how much is left. |
| R3 | PDF generation failed | P0 | Retry, and keep the record visible. |
| R4 | Certificate revoked | P1 | State plainly who revoked it and why. |

### Admin (`/admin`)
| # | State | Priority | Notes |
|---|---|---|---|
| D1 | Review queue empty | P1 | "Nothing needs review" — a healthy state, not an error. |
| D2 | ID document access logged | P0 | Trainer ID docs are sensitive; access must be visible and attributable. |
| D3 | Action requires a reason | P0 | Suspend/revoke must capture a reason before it commits. |

---

## Definition of Done (amended)

A feature is **not** done until:

1. The happy path works
2. Every applicable state in this file is handled or explicitly waived with a reason
3. It is instrumented — we can see if users hit the failure state
4. It works on a mid-range Android phone over a poor network

Point 4 is not optional. Our users are on mobile data, not office wifi.