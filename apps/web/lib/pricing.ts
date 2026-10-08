import { quote } from '@learnovize/shared';

type Quotable = {
  accessType: string;
  pricePerDayNgn: number | null;
  sessions: { startsAtUtc: Date | string }[];
};

/**
 * Price a training from its own sessions. Every caller — detail endpoint, checkout,
 * register page — goes through here so they can never disagree on the total.
 */
export function quoteFor(t: {
  accessType?: string | null;
  pricePerDayNgn?: number | null;
  sessions?: { startsAtUtc: Date | string }[];
}) {
  return quote({
    accessType: t.accessType || 'free',
    pricePerDayNgn: t.pricePerDayNgn ?? null,
    sessions: (t.sessions || []).map((s) => ({ startsAtUtc: new Date(s.startsAtUtc) })),
  });
}