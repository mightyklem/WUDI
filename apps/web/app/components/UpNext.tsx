'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch } from '@/lib/client-auth';
import { lagosWhenLabel, lagosCountdownLabel } from '@/lib/lagos';

type Row = {
  sessionId: string;
  title: string;
  startsAtUtc: string;
  endsAtUtc: string;
  path: string;
  live: boolean;
  over: boolean;
};
type Payload = { now: Row[]; next: Row[]; counts: { live: number; upcoming: number } };

/**
 * "What is my next class, and when?"
 *
 * This is the shortest path between paying and turning up, and it is the step most likely
 * to be lost. A learner who has reserved a seat and then cannot find the time, or cannot
 * find the room, does not attend -- and an empty room is the whole business not happening
 * that day.
 *
 * So the time is written out in Lagos, in words, with a countdown, rather than a date
 * string and a calendar. And a class already running is the loudest thing on the card,
 * because that is the moment a person is most likely to be scrolling their email instead of
 * a class they are late to.
 */
export default function UpNext() {
  const [data, setData] = useState<Payload | null>(null);
  // Re-read every minute so a countdown does not go stale while the tab is open.
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await authFetch('/api/me/upcoming');
      if (!r.ok) return;
      setData(await r.json());
    } catch { /* the rest of the dashboard is more important than this card */ }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => setTick((v) => v + 1), 60_000);
    return () => clearInterval(id);
  }, [load]);

  if (!data) return null;
  const live = data.now[0];
  const soon = data.next[0];
  if (!live && !soon) return null;

  return (
    <section className="card" style={{ marginTop: 14, borderLeft: '3px solid var(--accent)' }}>
      <h2 style={{ margin: '0 0 10px', fontSize: 16 }}>
        {/* Stable heading. It used to switch between "Join now" and "Your next class" depending
          on whether anything was live, so the section renamed itself every hour. The
          urgency belongs on the button inside, not on the heading above it. */}
        See what&rsquo;s next
      </h2>

      {live && (
        <div style={{ marginBottom: soon ? 14 : 0, paddingBottom: soon ? 14 : 0, borderBottom: soon ? '1px solid var(--line)' : 'none' }}>
          <p style={{ margin: '0 0 3px', fontWeight: 700, fontSize: 16 }}>{live.title}</p>
          <p style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--mut)' }}>
            {live.over ? 'Running over — the trainer has not ended it' : `Started ${lagosCountdownLabel(live.startsAtUtc)}`}
          </p>
          <Link className="btn primary" href={live.path}>Join the room</Link>
        </div>
      )}

      {soon && (
        <div>
          <p style={{ margin: '0 0 3px', fontWeight: 700, fontSize: 16 }}>{soon.title}</p>
          {/* The two facts, together, in one line: when it is, and how long until then.
              Requiring anybody to do that subtraction is where people stop turning up. */}
          <p style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--mut)' }}>
            {lagosWhenLabel(soon.startsAtUtc)} · {lagosCountdownLabel(soon.startsAtUtc)}
          </p>
          {data.counts.upcoming > 1 && (
            <p className="muted" style={{ margin: '0 0 10px', fontSize: 13 }}>
              {data.counts.upcoming - 1} more booked.
            </p>
          )}
          <Link className="btn" href={soon.path}>Open the room</Link>
        </div>
      )}
    </section>
  );
}