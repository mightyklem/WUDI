import { randomBytes } from 'crypto';
import { clampMinPct, PLAN_CAPS } from '@wudi/shared';

/** URL-safe slug: title-slug + 6 random chars, e.g. solar-101-4f8k2q */
export function makeSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'training';
  return `${base}-${randomBytes(4).toString('base64url').slice(0, 6).toLowerCase()}`;
}

export type TrainingInput = {
  title?: string;
  description?: string;
  topic?: string;
  format?: string;
  certMode?: string;
  certPriceNgn?: number | null;
  minPct?: number;
  cap?: number;
  sessions?: { startsAtUtc: string; endsAtUtc: string }[];
};

/** Validate create/update input. Returns { ok, data } or { ok: false, error }. */
export function validateTrainingInput(body: TrainingInput, isPaidApproved = false) {
  const title = (body.title || '').trim();
  if (title.length < 3 || title.length > 120) return { ok: false as const, error: 'Title must be 3–120 chars' };
  const format = body.format === 'audio' ? 'audio' : 'video';
  const certMode = body.certMode === 'paid' || body.certMode === 'free' ? body.certMode : 'none';
  if (certMode === 'paid' && !isPaidApproved) {
    return { ok: false as const, error: 'Paid certification needs admin approval (Phase 6 flow)' };
  }
  const certPriceNgn = certMode === 'paid' ? Math.round(Number(body.certPriceNgn)) : null;
  if (certMode === 'paid' && (!Number.isFinite(certPriceNgn!) || certPriceNgn! <= 0)) {
    return { ok: false as const, error: 'Paid certification needs a price in NGN' };
  }
  const cap = body.cap === undefined ? PLAN_CAPS.free : Math.round(Number(body.cap));
  if (!Number.isInteger(cap) || cap < 1 || cap > PLAN_CAPS.business) {
    return { ok: false as const, error: `Cap must be 1–${PLAN_CAPS.business}` };
  }
  const sessions = Array.isArray(body.sessions) ? body.sessions : [];
  if (sessions.length < 1 || sessions.length > 30) {
    return { ok: false as const, error: 'Provide 1–30 sessions with start/end times (UTC ISO)' };
  }
  for (const s of sessions) {
    const a = new Date(s.startsAtUtc).getTime();
    const b = new Date(s.endsAtUtc).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) {
      return { ok: false as const, error: 'Each session needs valid start < end (UTC ISO)' };
    }
  }
  return {
    ok: true as const,
    data: {
      title,
      description: (body.description || '').slice(0, 2000) || null,
      topic: (body.topic || '').slice(0, 60) || null,
      format,
      certMode,
      certPriceNgn,
      minPct: clampMinPct(body.minPct),
      cap,
      sessions: sessions.map((s) => ({
        startsAtUtc: new Date(s.startsAtUtc),
        endsAtUtc: new Date(s.endsAtUtc),
      })),
    },
  };
}

/** Plain-words certification rule for the registration page (FR-7.6). */
export function certRuleText(minPct: number): string {
  return `Attend at least ${minPct}% of the sessions to earn your certificate.`;
}
