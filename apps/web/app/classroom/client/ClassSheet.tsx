'use client';
import { useMemo, useState } from 'react';
import ProductTypeGrid, { type ProductType } from './ProductTypeGrid';
import { authFetch } from '@/lib/client-auth';

export type Intro = {
  title: string;
  hostName: string;
  startsAtUtc: string;
  endsAtUtc: string;
  opensAtUtc: string | null;
  admittedAtUtc: string | null;
  /**
   * When the trainer pressed End. Separate from admittedAtUtc because that is a latch: it
   * stays set forever, because a class that opened at 3pm did open at 3pm. Treating it as
   * "still open" after End means a closed room still invites people in.
   */
  endedAtUtc?: string | null;
  agenda: string | null;
  description: string | null;
  showcaseName: string | null;
  showcaseUrl: string | null;
  showcaseNote: string | null;
  showcaseImageUrl: string | null;
  registered: number;
  cap: number;
  accessType: string;
  pricePerDayNgn: number | null;
  /** The programme's certificate threshold. Shown live in the room, not on this screen. */
  minPct: number;
  /** The trainer who owns this training. Not secret: their name is already shown. */
  ownerId: string;
};

/**
 * The class page, laid out as a sheet: title, three figures, a description you
 * can expand, then what the class covers.
 *
 * The three figures are the ones a person actually decides on -- who is going,
 * when it starts, whether there is room. Vanity counts are deliberately absent;
 * a class with 12 registered learners is not improved by also telling them it
 * has 9 views.
 */
export default function ClassSheet({
  intro,
  viewerId,
  sessionId,
  onJoin,
  onAdmitted,
  joining,
  error,
}: {
  intro: Intro;
  viewerId: string | null;
  sessionId: string;
  onJoin: () => void;
  onAdmitted?: () => void;
  joining: boolean;
  error: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [productType, setProductType] = useState<ProductType | null>(null);
  const [opening, setOpening] = useState(false);
  const canAttach = viewerId === intro.ownerId;

  const start = new Date(intro.startsAtUtc).getTime();
  const end = new Date(intro.endsAtUtc).getTime();
  const open = new Date(intro.opensAtUtc ?? intro.startsAtUtc).getTime();
  const now = Date.now();

  const isHost = !!viewerId && viewerId === intro.ownerId;

const state = useMemo(() => {
      // End is a decision, not a timestamp. It outranks everything below, including the
      // fact that the room opened -- otherwise closing a class would be indistinguishable
      // from never having opened one.
      if (intro.endedAtUtc) return { label: 'Finished', tone: 'over' as const, canJoin: false };

      if (isHost) {
        // The host is never waiting for themselves. Until they open the room it says
        // so plainly and offers the button that does it.
        return intro.admittedAtUtc
          ? { label: 'Room is open', tone: 'live' as const, canJoin: true }
          : { label: 'You are hosting', tone: 'waiting' as const, canJoin: true };
      }
      if (intro.admittedAtUtc) {
        // Past the scheduled end with the trainer still in the room, this is not over.
        // Real classes overrun, and telling someone the class finished while they can
        // plainly hear it happening is the sort of thing people stop trusting a platform
        // for. Said plainly so nobody thinks they have joined late.
        return now >= end
          ? { label: 'Running over', tone: 'live' as const, canJoin: true }
          : { label: 'Room is open', tone: 'live' as const, canJoin: true };
      }
      if (now >= open && now < end) return { label: 'Waiting for the host', tone: 'waiting' as const, canJoin: true };
      if (now < start) return { label: `Starts ${ago(start - now)}`, tone: 'soon' as const, canJoin: false };
      return { label: 'Finished', tone: 'over' as const, canJoin: false };
    }, [isHost, intro.admittedAtUtc, intro.endedAtUtc, now, open, start, end]);

  const seatsLeft = Math.max(0, intro.cap - intro.registered);
  const free = intro.accessType !== 'paid';
  const price = free ? 'Free' : intro.pricePerDayNgn
    ? `₦${intro.pricePerDayNgn.toLocaleString()}`
    : 'Paid';

  const blurb = intro.description?.trim() || `${intro.title}, live with ${intro.hostName}.`;
  // Two lines is roughly what fits on a phone; the rest waits behind See more.
  const long = blurb.length > 150;

  /**
   * Open the room for everyone. Until the trainer does this, a learner is told the
   * host has not arrived -- which was also being shown to the trainer themselves,
   * because nothing in the app ever set the admitted flag.
   */
  const openRoom = async () => {
    setOpening(true);
    try {
      const { getAccess } = await import('@/lib/client-auth');
      const r = await authFetch(`/api/sessions/${sessionId}/moderate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${getAccess()}` },
        body: JSON.stringify({ action: 'admit' }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) onAdmitted?.();
      else setErrorText(j.error || 'Could not open the room.');
    } catch {
      setErrorText('Could not reach the server.');
    } finally {
      setOpening(false);
    }
  };

  const [errorText, setErrorText] = useState<string | null>(null);

  return (
    <div className="cs">
      <div className="cs-head">
        <h1 className="cs-title">{intro.title}</h1>
        <p className="cs-sub">
          {intro.hostName} · {clock(start)}–{clock(end)} WAT
        </p>
        <span className="cs-state" data-tone={state.tone}>{state.label}</span>
      </div>

      <div className="cs-stats">
        <Stat value={price} label={free ? 'Access' : 'Per day'} />
        <Stat value={String(intro.registered)} label={intro.registered === 1 ? 'Registered' : 'Registered'} />
        <Stat
          value={seatsLeft > 0 ? String(seatsLeft) : 'Full'}
          label={seatsLeft > 0 ? 'Seats left' : 'Class full'}
        />
      </div>

      <section className="cs-desc">
        <p className={expanded ? 'cs-desc-body' : 'cs-desc-body cs-clamp'}>{blurb}</p>
        {intro.showcaseUrl && (
          <a className="cs-link" href={intro.showcaseUrl} target="_blank" rel="noreferrer noopener">
            {intro.showcaseName || 'Class link'} ↗
          </a>
        )}
        {long && (
          <button type="button" className="cs-more" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Show less' : 'See more'}
          </button>
        )}
      </section>

      {intro.showcaseName && (
        <div className="cs-feature">
          {intro.showcaseImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={intro.showcaseImageUrl} alt="" className="cs-feature-img" />
          )}
          <div>
            <p className="cs-feature-tag">Featured</p>
            <p className="cs-feature-name">{intro.showcaseName}</p>
            {intro.showcaseNote && <p className="cs-feature-note">{intro.showcaseNote}</p>}
          </div>
        </div>
      )}

      {intro.agenda && (
        <section className="cs-block">
          <h2 className="cs-h">What you will see</h2>
          <p className="cs-block-body">{intro.agenda}</p>
        </section>
      )}

      {canAttach && (
        <section className="cs-block">
          <h2 className="cs-h">Attach something to this class</h2>
          {productType ? (
            <div className="cs-attach">
              <p className="cs-attach-done">✓ {labelFor(productType)} selected</p>
              <button type="button" className="cs-ghost" onClick={() => setProductType(null)}>
                Change
              </button>
            </div>
          ) : (
            <ProductTypeGrid onPick={setProductType} />
          )}
        </section>
      )}

      <div className="cs-actions">
        {isHost && !intro.admittedAtUtc && (
          <button type="button" className="cs-open" disabled={opening} onClick={() => void openRoom()}>
            {opening ? 'Opening…' : 'Open the room for learners'}
          </button>
        )}
        <button
          type="button"
          className="cs-join"
          disabled={!state.canJoin || joining}
          onClick={onJoin}
        >
          {joining ? 'Opening…' : state.canJoin ? (isHost ? 'Enter your class' : 'Join the class') : state.label}
        </button>
        {isHost && !intro.admittedAtUtc && (
          <p className="cs-hint">Learners see “waiting for the host” until you open the room.</p>
        )}
        {!state.canJoin && state.tone === 'soon' && (
          <p className="cs-hint">The waiting room opens {ago(open - now)} before the start.</p>
        )}
      </div>

      {(errorText || error) && <p className="cs-error">{errorText || error}</p>}

      <ul className="cs-notes">
        <li>Learners join muted. Raise your hand to be given the floor.</li>
        <li>Nothing is recorded and there is no replay.</li>
      </ul>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="cs-stat">
      <p className="cs-stat-v">{value}</p>
      <p className="cs-stat-l">{label}</p>
    </div>
  );
}

/** Short relative time, in the "6h ago" shape the reference uses. */
function ago(ms: number): string {
  const m = Math.floor(ms / 60000);
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `in ${h}h`;
  const d = Math.floor(h / 24);
  return `in ${d}d`;
}

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
}

function labelFor(t: ProductType): string {
  return {
    digital: 'Digital product',
    coaching: 'Coaching call',
    course: 'eCourse',
    custom: 'Custom product',
    link: 'Link or media',
  }[t];
}