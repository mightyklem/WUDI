'use client';
import { useEffect, useMemo, useState } from 'react';

export type Intro = {
  title: string;
  hostName: string;
  startsAtUtc: string;
  endsAtUtc: string;
  opensAtUtc: string | null;
  admittedAtUtc: string | null;
  agenda: string | null;
  showcaseName: string | null;
  showcaseUrl: string | null;
  showcaseNote: string | null;
  showcaseImageUrl: string | null;
  registered: number;
  cap: number;
};

/**
 * The page a person lands on before a webinar, in the shape Zoom and Teams use:
 * what it is, who is hosting, when it starts, and a countdown that makes waiting
 * bearable. It also states plainly whether the room is open yet, so nobody sits on
 * a "Join" button that silently does nothing.
 */
export default function WebinarIntro({
  intro,
  onJoin,
  joining,
  error,
}: {
  intro: Intro;
  onJoin: () => void;
  joining: boolean;
  error: string | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const start = new Date(intro.startsAtUtc).getTime();
  const open = new Date(intro.opensAtUtc ?? intro.startsAtUtc).getTime();
  const admitted = !!intro.admittedAtUtc;

  const phase = useMemo(() => {
    if (admitted) return { key: 'live', label: 'The room is open', tone: 'live' as const };
    if (now >= open && now < start + 12 * 3600_000) {
      return { key: 'waiting', label: 'Open now — waiting for the host', tone: 'waiting' as const };
    }
    if (now < start) return { key: 'soon', label: countLabel(start - now), tone: 'soon' as const };
    return { key: 'over', label: 'This session has finished', tone: 'over' as const };
  }, [now, open, start, admitted]);

  const canJoin = phase.key === 'live' || phase.key === 'waiting';
  const seatsLeft = Math.max(0, intro.cap - intro.registered);

  return (
    <div className="wb-intro">
      <div className="wb-intro-card">
        <div className="wb-badge" data-tone={phase.tone}>{phase.label}</div>
        <h1 className="wb-title">{intro.title}</h1>
        <p className="wb-host">
          Hosted by <b>{intro.hostName}</b>
          {' · '}
          {fmtRange(start, new Date(intro.endsAtUtc).getTime())}
        </p>

        {intro.agenda && (
          <div className="wb-agenda">
            <p className="wb-agenda-h">What you will see</p>
            <p className="wb-agenda-body">{intro.agenda}</p>
          </div>
        )}

        {intro.showcaseName && (
          <div className="wb-showcase">
            {intro.showcaseImageUrl && (
              // An external image, so it is a plain img with no layout assumptions.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={intro.showcaseImageUrl} alt="" className="wb-showcase-img" />
            )}
            <div>
              <p className="wb-showcase-tag">Featured product</p>
              <p className="wb-showcase-name">{intro.showcaseName}</p>
              {intro.showcaseNote && <p className="wb-showcase-note">{intro.showcaseNote}</p>}
              {intro.showcaseUrl && (
                <a className="wb-showcase-link" href={intro.showcaseUrl} target="_blank" rel="noreferrer noopener">
                  Open link
                </a>
              )}
            </div>
          </div>
        )}

        <div className="wb-meta">
          <span className="wb-chip">{intro.registered} registered</span>
          {seatsLeft > 0 ? (
            <span className="wb-chip">{seatsLeft} seats left</span>
          ) : (
            <span className="wb-chip" data-full>Class full</span>
          )}
        </div>

        <div className="wb-actions">
          <button
            type="button"
            className="wb-join"
            disabled={!canJoin || joining}
            onClick={onJoin}
          >
            {joining
              ? 'Opening…'
              : canJoin
                ? admitted ? 'Join the room' : 'Join the waiting room'
                : phase.key === 'over'
                  ? 'Session ended'
                  : 'Join when it opens'}
          </button>
          {!canJoin && phase.key === 'soon' && (
            <p className="wb-hint">
              The waiting room opens {countLabel(open - now)} before the start. You can
              check your camera and microphone then.
            </p>
          )}
          {phase.key === 'waiting' && (
            <p className="wb-hint">
              You will be admitted when the host starts the session.
            </p>
          )}
        </div>

        {error && <p className="wb-error">{error}</p>}

        <ul className="wb-notes">
          <li>Learners join muted. Raise your hand to be given the floor.</li>
          <li>Nothing is recorded, and there is no replay.</li>
          <li>Join on a stable connection for the smoothest audio.</li>
        </ul>
      </div>
    </div>
  );
}

function countLabel(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `in ${d}d ${h}h`;
  if (h > 0) return `in ${h}h ${m}m`;
  if (m > 0) return `in ${m}m ${sec}s`;
  return `in ${sec}s`;
}

function fmtRange(start: number, end: number): string {
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' };
  return `${new Date(start).toLocaleString(undefined, opts)} – ${new Date(end).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}