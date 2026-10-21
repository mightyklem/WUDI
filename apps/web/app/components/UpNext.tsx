'use client';
import { useCallback, useEffect, useState } from 'react';
import { authFetch } from '@/lib/client-auth';
import { lagosWhenLabel, lagosCountdownLabel } from '@/lib/lagos';
import { UxCard, UxCta } from './ux';

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
 *
 * It sits at the top of the dashboard for the same reason. The thing you must do comes
 * first; where you stand comes after it.
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

  // One loud call to action on the screen. While a class is running, that is the room
  // somebody has to get into, and the class after it is the quiet sibling.
  const liveWins = Boolean(live);

  return (
    <section aria-label="Your next class" style={{ display: 'grid', gap: 12, marginTop: 14 }}>
      {live && (
        <UxCard best bestLabel={live.over ? 'Still running' : 'Live now'}>
          <p className="u-h" style={{ marginTop: 10 }}>{live.title}</p>
          <p className="u-sub">
            {live.over
              ? 'Running over — the trainer has not ended it'
              : `Started ${lagosCountdownLabel(live.startsAtUtc)}`}
          </p>
          <div style={{ marginTop: 14 }}>
            <UxCta href={live.path}>Join the room</UxCta>
          </div>
        </UxCard>
      )}

      {soon && (
        <UxCard>
          {/* A stable label. It used to change between "Join now" and "Your next class"
              depending on whether anything was live, so the section renamed itself every
              hour. The urgency belongs on the button inside, not on the label above it. */}
          <p className="eyebrow" style={{ margin: 0 }}>See what&rsquo;s next</p>
          <p className="u-h" style={{ marginTop: 4 }}>{soon.title}</p>
          {/* The two facts, together, in one line: when it is, and how long until then.
              Requiring anybody to do that subtraction is where people stop turning up. */}
          <p className="u-sub">
            {lagosWhenLabel(soon.startsAtUtc)} · {lagosCountdownLabel(soon.startsAtUtc)}
          </p>
          {data.counts.upcoming > 1 && (
            <p className="u-sub-sm" style={{ marginTop: 6 }}>
              {data.counts.upcoming - 1} more booked.
            </p>
          )}
          <div style={{ marginTop: 14 }}>
            <UxCta quiet={liveWins} href={soon.path}>Open the room</UxCta>
          </div>
        </UxCard>
      )}
    </section>
  );
}
