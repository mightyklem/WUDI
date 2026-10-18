'use client';
import { useCallback, useEffect, useState } from 'react';
import { getAccess } from '@/lib/client-auth';

type Points = {
  points: number;
  rank: { key: string; label: string; icon: string };
  next: { key: string; label: string; icon: string; needed: number } | null;
  progress: { current: { label: string }; next: { label: string } | null; pct: number };
  recent: { id: string; points: number; reason: string; createdAt: string; trainingId: string | null }[];
};

/** The plain-language reason for each award. */
const REASON_COPY: Record<string, string> = {
  session_attended: 'Attended a class',
  session_taught: 'Taught a class someone attended',
  program_completed: 'Completed every day enrolled',
  certificate_earned: 'Earned a certificate',
  review_received: 'Received a review',
  manual_adjustment: 'Adjustment from Learnovize',
};

/**
 * Standing: balance, rank, and the record of how it was arrived at.
 *
 * One component, used by the learner dashboard and the trainer's earnings page, because
 * the rank ladder is meant to be a single definition of progress. Two hand-written copies
 * is how a badge ends up meaning two different things depending on which page you are on,
 * and nobody notices until a trainer points out their badge disagrees with their own.
 */
export default function StandingPanel({
  /** Whose standing. Null renders nothing rather than a broken shell. */
  title = 'Your standing',
  /**
   * Things the points sit next to: certificates held, seats taken, rewards.
   *
   * Rendered as part of this card rather than beside it. Standing on its own was a number
   * with nothing to do about it -- a person reading "620 points, 380 to Silver" had no
   * obvious next move, and no idea that certificates and discounts came from the same
   * attendance that scored the points. One panel, one answer to "what have I actually got".
   */
  related = [],
}: {
  title?: string;
  related?: { href: string; label: string; value: number | null; hint: string }[];
}) {
  const [data, setData] = useState<Points | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/me/points', {
        headers: { authorization: `Bearer ${getAccess() ?? ''}` },
        cache: 'no-store',
      });
      if (!r.ok) { setFailed(true); return; }
      setData(await r.json());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (failed) return null;
  if (!data) return null;

  return (
    <section className="card" style={{ marginTop: 14 }}>
      <h2 style={{ margin: '0 0 2px', fontSize: 16 }}>{title}</h2>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 10 }}>
        <span
          aria-hidden
          style={{
            background: 'var(--warn-soft)',
            color: 'var(--warn)',
            fontSize: 24,
            width: 52,
            height: 52,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 12,
          }}
        >
          {data.rank.icon}
        </span>
        <div style={{ flex: 1, minWidth: 170 }}>
          <p className="u-h" style={{ margin: 0 }}>
            <span className="sr-only">{data.rank.label}</span>
            {data.points} point{data.points === 1 ? '' : 's'}
          </p>
          <p className="muted u-sub" style={{ margin: '2px 0 0' }}>
            {data.next
              ? `${data.next.needed.toLocaleString()} to ${data.next.icon} ${data.next.label}`
              : `Top rank · ${data.rank.label}`}
          </p>
          <div
            style={{
              marginTop: 8, height: 8, borderRadius: 999,
              background: 'var(--line)', overflow: 'hidden', maxWidth: 280,
            }}
            role="progressbar"
            aria-valuenow={data.progress.pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Progress to ${data.next ? data.next.label : 'top rank'}`}
          >
            <div style={{ width: `${data.progress.pct}%`, height: '100%', background: 'var(--warn)' }} />
          </div>
        </div>
      </div>

      {/* The record. A number on its own is a score; the list of what produced it is what
          people actually feel loyalty towards, and it is the only part that explains an
          unexpected total. */}
      {data.recent.length > 0 && (
        <>
          <p className="eyebrow" style={{ marginTop: 18, marginBottom: 4 }}>Where these came from</p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {data.recent.map((e) => (
              <li
                key={e.id}
                style={{
                  display: 'flex', justifyContent: 'space-between', gap: 12,
                  padding: '7px 0', borderTop: '1px solid var(--line)', fontSize: 14,
                }}
              >
                <span>
                  {REASON_COPY[e.reason] ?? e.reason.replace(/_/g, ' ')}
                  <span className="muted" style={{ marginLeft: 8, fontSize: 12.5 }}>
                    {new Date(e.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  </span>
                </span>
                <span style={{ fontWeight: 700, color: e.points >= 0 ? 'var(--warn)' : 'var(--danger, #b42318)' }}>
                  {e.points >= 0 ? '+' : ''}{e.points}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Stacked here rather than as separate tiles further down, because they are the same
          story: the points are the score, and these are the things the score is for. */}
      {related.length > 0 && (
        <>
          <p className="eyebrow" style={{ marginTop: 18, marginBottom: 6 }}>What that gets you</p>
          <div style={{ display: 'grid', gap: 8 }}>
            {related.map((r) => (
              <a
                key={r.href}
                href={r.href}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '11px 13px', borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--line)', textDecoration: 'none', color: 'inherit',
                  background: 'var(--bg-soft, #fff)',
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="u-h-sm" style={{ display: 'block' }}>{r.label}</span>
                  <span className="muted" style={{ fontSize: 12.5 }}>{r.hint}</span>
                </span>
                {r.value !== null && (
                  <span style={{ fontWeight: 800, fontSize: 17 }}>{r.value}</span>
                )}
                <span className="muted" aria-hidden style={{ fontSize: 18 }}>›</span>
              </a>
            ))}
          </div>
        </>
      )}
    </section>
  );
}