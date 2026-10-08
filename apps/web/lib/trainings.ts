import { randomBytes } from 'crypto';
import {
  clampMinPct,
  isTier,
  PLAN_CAPS,
  resolvesCertMode,
  validateDayPrice,
} from '@learnovize/shared';
import { planDays, validateDayPricing } from '@/lib/days';

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
  accessType?: string;
  tier?: string | null;
  pricePerDayNgn?: number | null;
  wantsCertificate?: boolean;
  minPct?: number;
  cap?: number;
  sessions?: { startsAtUtc: string; endsAtUtc: string }[];
  /** Per-day overrides keyed by the UTC date the day covers. */
  days?: { dateUtc?: string; topic?: string; accessType?: string; priceNgn?: number | null }[];
};

/** Validate create/update input. Returns { ok, data } or { ok: false, error }. */
export function validateTrainingInput(body: TrainingInput, isPaidApproved = false) {
  const title = (body.title || '').trim();
  if (title.length < 3 || title.length > 120) return { ok: false as const, error: 'Title must be 3–120 chars' };
  const format = body.format === 'audio' ? 'audio' : 'video';

  // Free or paid. Paid certification still needs the existing admin approval.
  const accessType = body.accessType === 'paid' ? 'paid' : 'free';
  if (accessType === 'paid' && !isPaidApproved) {
    return { ok: false as const, error: 'Paid classes need admin approval first' };
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

  // A free class cannot certify, so it never carries a tier or a price.
  let tier: string | null = null;
  let pricePerDayNgn: number | null = null;
  if (accessType === 'paid') {
    if (!isTier(body.tier)) {
      return { ok: false as const, error: 'Pick a category: Basic, Standard or Premium' };
    }
    const priced = validateDayPrice(body.tier, body.pricePerDayNgn);
    if (!priced.ok) return { ok: false as const, error: priced.error };
    tier = String(body.tier);
    pricePerDayNgn = Number(priced.price);
  }

  // Free classes issue no certificate; paid ones may include it.
  const certMode = resolvesCertMode({ accessType, wantsCertificate: !!body.wantsCertificate });

  const normalized = sessions.map((s) => ({
    startsAtUtc: new Date(s.startsAtUtc),
    endsAtUtc: new Date(s.endsAtUtc),
  }));
  const minPct = clampMinPct(body.minPct);

  // Apply any per-day overrides the trainer set, matched by the date each day covers.
  const basePlan = planDays(normalized, accessType === 'paid', pricePerDayNgn);
  const overrides = new Map((body.days ?? []).map((d) => [String(d.dateUtc || ''), d]));
  const dayPlan = basePlan.map((d) => {
    const o = overrides.get(d.dateUtc);
    if (!o) return d;
    const priced = validateDayPricing({
      tier,
      accessType: o.accessType ?? d.accessType,
      priceNgn: o.accessType === 'free' ? null : (o.priceNgn ?? d.priceNgn),
    });
    // A bad override is ignored rather than failing the whole create: the day
    // keeps its default price and the trainer can fix it on the days screen.
    if (!priced.ok) return d;
    return {
      ...d,
      topic: (o.topic ?? d.topic).slice(0, 80) || null,
      accessType: priced.accessType,
      priceNgn: priced.priceNgn,
    };
  });

  return {
    ok: true as const,
    data: {
      title,
      description: (body.description || '').slice(0, 2000) || null,
      topic: (body.topic || '').slice(0, 60) || null,
      format,
      accessType,
      tier,
      pricePerDayNgn,
      certMode,
      certPriceNgn: null,
      minPct,
      cap,
      sessions: normalized,
      days: dayPlan,
    },
  };
}

/** Plain-words attendance rule for the registration page (FR-7.6). */
export function certRuleText(minPct: number): string {
  return `Attend at least ${minPct}% of the sessions to earn your certificate.`;
}
