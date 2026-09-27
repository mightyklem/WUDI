# Design System v0: Wudi

Status: Draft for review. No code or Figma exists yet — this is the starting point.
Preview: open `DOCS/design-preview.html` in a browser.

Principles (from PRD): Nigeria-first low-data, high trust, accessible, live-focused.

## Tokens

Colors:
- `--wudi-green-900: #0B1F14` (header/footer, certificate seal bg)
- `--wudi-green-700: #0E7A3D` (primary buttons, links, active states)
- `--wudi-green-100: #DFF2E5` (success bg, attendance ok)
- `--wudi-amber-500: #FFB020` (CTA accent, Register, cert badge)
- `--wudi-coral-600: #E5484D` (LIVE dot, danger, revoke)
- `--wudi-ink-900: #121212` (body text)
- `--wudi-ink-500: #5C5C5C` (secondary text)
- `--wudi-paper: #F7F7F5` (page bg)
- `--wudi-card: #FFFFFF` (cards)
- `--wudi-line: #E6E6E2` (borders)

Typography: Inter, system fallback. Base 16px. Scale: 12 / 14 / 16 / 20 / 24 / 32 / 40. Line-height 1.5 body, 1.2 headings. Minimum touch target 44px.

Spacing: 4pt grid (4, 8, 12, 16, 24, 32). Radius: 10px cards, 999px pills. Shadows: card `0 1px 2px rgba(0,0,0,.06)`, popover `0 8px 24px rgba(0,0,0,.12)`.

## Components (mapped to PRD)

1. Button: Primary (green), Accent (amber Register), Ghost, Danger. States: default/hover/disabled/loading.
2. Invite card (FR-4.1): cover, title, trainer + avatar, dates, seats-left pill, Register button.
3. Training card: title, topic chip, format icon (video/audio-only), free vs certified badge.
4. Feed post (FR-10.3): 60s video or e-card, trainer row, title/date, action bar (like/save/share/register/follow).
5. Classroom controls (FR-6.5): mic/cam/screen/hand/chat/poll/leave bar, role-based visibility, low-data toggle prominent.
6. Poll card: question, options with live % bars, vote button.
7. Attendance progress (FR-7.6): bar + "2 of 3 sessions, 67% — need 80%" + at-risk amber/red state.
8. Certificate: co-branded layout (trainer logo/signature + Wudi seal), number `WUDI-YYYY-XXXXXX`, non-accredited disclaimer footer.
9. Verify badge: Valid (green) / Revoked (red) / Not found (grey).
10. Form inputs, toasts, empty states, report dialog, admin flag row.

Accessibility: contrast ≥4.5:1 body, focus ring 2px green offset 2px, font scaling to 200% without breakage, color never sole signal (icons + text).

Low-data rules: no autoplay with sound, images lazy + blurred placeholder, video defaults 480p with 144p/audio-only switch, total invite page <500 KB.
