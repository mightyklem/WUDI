import Link from 'next/link';
import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { formatNgn, tierLabel } from '@learnovize/shared';
import { lagosRangeLabel } from '@/lib/lagos';
import SiteNav from '../components/SiteNav';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Classes — Learnovize' };

type Search = { q?: string; topic?: string; type?: string; when?: string };

/**
 * The class catalogue.
 *
 * This queries trainings directly rather than the feed. Explore is a social
 * surface built from posts, so a class only appears there if its trainer also
 * wrote a post about it — which meant most published classes were undiscoverable.
 * A learner asking "what is on?" needs the class, not a social post.
 */
export default async function ClassesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const q = (sp.q || '').trim();
  const topic = (sp.topic || '').trim();
  const type = sp.type === 'free' || sp.type === 'paid' ? sp.type : '';
  const when = sp.when === 'today' || sp.when === 'week' ? sp.when : '';

  const now = new Date();
  // "Next 24 hours" is a window, not a threshold: starting between now and now+24h.
  // Filtering on gte alone would show sessions further out and hide the imminent ones.
  const windowEnd = when === 'today'
    ? new Date(now.getTime() + 24 * 3600 * 1000)
    : when === 'week'
      ? new Date(now.getTime() + 7 * 24 * 3600 * 1000)
      : null;

  const topics = await prisma.training.findMany({
    where: { status: { in: ['live', 'full'] }, topic: { not: null } },
    distinct: ['topic'],
    select: { topic: true },
    orderBy: { topic: 'asc' },
  });

  const trainings = await prisma.training.findMany({
    where: {
      status: { in: ['live', 'full'] },
      ...(q ? {
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { topic: { contains: q, mode: 'insensitive' } },
        ],
      } : {}),
      ...(topic ? { topic } : {}),
      ...(type ? { accessType: type } : {}),
      ...(windowEnd ? { sessions: { some: { startsAtUtc: { gte: now, lt: windowEnd }, status: { not: 'cancelled' } } } } : {}),
    },
    include: {
      trainer: { select: { displayName: true } },
      sessions: { where: { status: { not: 'cancelled' } }, orderBy: { startsAtUtc: 'asc' } },
      days: { orderBy: { dayIndex: 'asc' } },
    },
    take: 60,
  });

  // Soonest first, and drop anything that has already finished.
  const rows = trainings
    .map((t) => {
      const upcoming = t.sessions.filter((s) => s.endsAtUtc.getTime() > now.getTime());
      const next = upcoming[0] ?? null;
      const live = t.sessions.some((s) => s.startsAtUtc <= now && s.endsAtUtc > now);
      const perDay = t.days.length ? Math.max(...t.days.map((d) => d.priceNgn)) : 0;
      return { t, next, live, dayCount: t.days.length || t.sessions.length, perDay };
    })
    .filter((r) => r.next !== null || r.live)
    .sort((a, b) => {
      if (a.live !== b.live) return a.live ? -1 : 1;
      return (a.next?.startsAtUtc.getTime() ?? Infinity) - (b.next?.startsAtUtc.getTime() ?? Infinity);
    });

  const qs = (patch: Partial<Search>) => {
    const merged = { q, topic, type, when, ...patch };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/classes?${s}` : '/classes';
  };

  return (
    <div className="wrap">
      <SiteNav />

      <h1>Classes</h1>
      <p className="sub">Browse what is on and reserve a seat. Pick the days you will attend.</p>

      <form className="card" method="get" style={{ marginTop: 16, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            type="search" name="q" defaultValue={q} placeholder="Search classes or topics"
            aria-label="Search classes" style={{ flex: 1, minWidth: 180 }}
          />
          <select name="topic" defaultValue={topic} aria-label="Topic">
            <option value="">All topics</option>
            {topics.map((t) => (t.topic ? <option key={t.topic} value={t.topic}>{t.topic}</option> : null))}
          </select>
          <select name="type" defaultValue={type} aria-label="Price type">
            <option value="">Free and paid</option>
            <option value="free">Free only</option>
            <option value="paid">Paid only</option>
          </select>
          <select name="when" defaultValue={when} aria-label="When">
            <option value="">Any time</option>
            <option value="today">Next 24 hours</option>
            <option value="week">Next 7 days</option>
          </select>
          <button className="btn primary" type="submit">Search</button>
          {(q || topic || type || when) && <Link className="btn" href="/classes">Clear</Link>}
        </div>
      </form>

      <p className="muted" style={{ marginTop: 16 }}>
        {rows.length} class{rows.length === 1 ? '' : 'es'}
        {q ? ` matching "${q}"` : ''}
      </p>

      {rows.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 28 }} aria-hidden>◎</div>
          <p style={{ margin: '10px 0 0', fontWeight: 800, fontSize: 18 }}>Nothing matches yet</p>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>
            Try a wider search, or follow a trainer to hear when they open a class.
          </p>
          <div className="btnrow" style={{ justifyContent: 'center' }}>
            <Link className="btn primary" href="/classes">Clear filters</Link>
            <Link className="btn" href="/trainers">Browse trainers</Link>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
          {rows.map(({ t, next, live, dayCount, perDay }) => {
            const left = Math.max(0, t.cap - t.seatsTaken);
            const full = left <= 0 || t.status === 'full';
            return (
              <div key={t.id} className="card" style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="ibadge" style={{ background: '#EEF1F4', color: '#1C2430' }} aria-hidden>📘</span>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <b style={{ fontSize: 16 }}>{t.title}</b>
                    {live && <span className="badge ok">Live now</span>}
                    {full && <span className="badge rev">Full</span>}
                    {t.topic && <span className="badge">{t.topic}</span>}
                  </div>
                  <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                    {t.trainer.displayName}
                    {' · '}
                    {next ? lagosRangeLabel(next.startsAtUtc.toISOString(), next.endsAtUtc.toISOString()) : 'Live now'}
                    {' · '}
                    {dayCount} day{dayCount === 1 ? '' : 's'}
                  </p>
                  <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
                    {t.accessType === 'paid'
                      ? `${tierLabel(t.tier)} · ${formatNgn(perDay)} per day · certificate included`
                      : 'Free · no certificate, points earned'}
                    {' · '}
                    {full ? 'no seats left' : `${left} of ${t.cap} seats left`}
                  </p>
                </div>
                <Link className="btn primary" href={`/t/${t.slug}/register`}>
                  {full ? 'Full' : 'Reserve a seat'}
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}