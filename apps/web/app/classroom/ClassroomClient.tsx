'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getAccess } from '@/lib/client-auth';
import { useRoomConnection } from './client/useClassroom';
import type { Role } from './client/model';
import Lobby from './client/Lobby';
import ClassSheet, { type Intro } from './client/ClassSheet';
import ClassroomRoom from './client/ClassroomRoom';
import './client/classroom.css';

type Phase = 'landing' | 'lobby' | 'joining' | 'in' | 'left';
type Pass = { token: string; url: string; room: string; role: Role };

/** Same short human span the intro page shows, for the room header. */
function spanLabel(intro: Intro): string {
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  const s = new Date(intro.startsAtUtc).toLocaleTimeString(undefined, opts);
  const e = new Date(intro.endsAtUtc).toLocaleTimeString(undefined, opts);
  return `${s} – ${e} WAT`;
}

/**
 * The classroom shell: webinar intro page, then a device check, then the room.
 *
 * Nothing connects until the person chooses to join. The previous version fetched
 * a room pass on mount and opened the camera the instant the page loaded, so a
 * learner who only ever wanted to listen was prompted for permissions and shown a
 * room they had not agreed to enter.
 */
export default function ClassroomClient({
  sessionId,
  intro,
}: {
  sessionId: string;
  intro: Intro;
}) {
  const [phase, setPhase] = useState<Phase>('landing');
  const [pass, setPass] = useState<Pass | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fatal, setFatal] = useState<{ title: string; detail: string } | null>(null);
  const [myId, setMyId] = useState('me');
  const [intent, setIntent] = useState<{ mic: boolean; cam: boolean }>({ mic: false, cam: false });
  const appliedFor = useRef<string | null>(null);
  // Whether the viewer owns this training decides if the attach-a-product grid is
  // shown at all. A learner should never be offered a form they cannot use. The
  // token lives in localStorage, so this has to be settled in the browser.
const [viewerId, setViewerId] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  useEffect(() => {
    const access = getAccess();
    if (!access) return;
    let dead = false;
    fetch('/api/me', { headers: { authorization: `Bearer ${access}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!dead && j?.user?.id) setViewerId(j.user.id); })
      .catch(() => {});
    return () => { dead = true; };
  }, []);

  // What role would I have in this room? Asked before anyone clicks Join, because
  // the lobby needs it to offer a camera check to a trainer rather than a
  // listener's "you will join muted" notice -- and to a learner rather than a
  // camera check they will never be allowed to use.
  useEffect(() => {
    const access = getAccess();
    if (!access) return;
    let dead = false;
    fetch(`/api/sessions/${sessionId}/token`, {
      method: 'GET',
      headers: { authorization: `Bearer ${access}` },
      cache: 'no-store',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!dead && j?.role) setRole(j.role as Role); })
      .catch(() => {});
    return () => { dead = true; };
  }, [sessionId]);


  const subtitle = `${intro.hostName} · ${spanLabel(intro)}`;

  const fetchPass = useCallback(async () => {
    const access = getAccess();
    if (!access) {
      setErr('Log in first, then join from your training page.');
      return null;
    }
    const r = await fetch(`/api/sessions/${sessionId}/token`, {
      method: 'POST',
      headers: { authorization: `Bearer ${access}` },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      // The server's wording is specific -- "you did not register for this day",
      // "this session has finished" -- and it is the only thing that tells a
      // learner what to do next, so it is never replaced with a generic failure.
      setErr([j.error || `Could not join (HTTP ${r.status})`, j.detail].filter(Boolean).join(' '));
      return null;
    }
    const p: Pass = { token: j.token, url: j.url, room: j.room, role: j.role };
    try {
      const c = JSON.parse(atob(j.token.split('.')[1])) as { sub?: string };
      if (c.sub) setMyId(c.sub);
    } catch { /* a missing sub only costs a nicer display name */ }
    setPass(p);
    return p;
  }, [sessionId]);

  const { room, state, quality, retryIn, retryNow } = useRoomConnection({
    url: pass?.url ?? null,
    token: pass?.token ?? null,
    enabled: phase === 'joining' || phase === 'in',
    onFatal: (f) => { setFatal(f); setPhase('left'); },
  });

  // Apply the lobby's device choices once the room exists, not before. Learners
  // always start muted: this is a taught class, and appearing on camera before the
  // trainer grants permission is exactly what the hand-raise flow prevents.
  useEffect(() => {
    if (!room || state !== 'connected' || appliedFor.current === pass?.token) return;
    appliedFor.current = pass?.token ?? null;
    const wantMic = pass?.role !== 'participant' && intent.mic;
    const wantCam = pass?.role !== 'participant' && intent.cam;
    (async () => {
      try {
        if (wantMic) await room.localParticipant.setMicrophoneEnabled(true);
        if (wantCam) await room.localParticipant.setCameraEnabled(true);
      } catch { /* a refused device must not stop them joining to listen */ }
    })();
  }, [room, state, pass, intent]);

  useEffect(() => {
    if (state === 'connected' && phase === 'joining') setPhase('in');
  }, [state, phase]);

  const join = useCallback(async () => {
    setErr(null);
    setFatal(null);
    setPhase('joining');
    appliedFor.current = null;
    const p = await fetchPass();
    if (!p) setPhase('lobby');
  }, [fetchPass]);

  const leave = useCallback(() => {
    room?.disconnect();
    setPass(null);
    appliedFor.current = null;
    setPhase('left');
  }, [room]);

  const renderRoom = () => {
    if (!room) return null;
    return (
      <ClassroomRoom
        room={room}
        sessionId={sessionId}
        sessionTitle={intro.title}
        subtitle={subtitle}
        role={pass?.role ?? 'participant'}
        myId={myId}
        state={state}
        quality={quality}
        retryIn={retryIn}
        retryNow={retryNow}
        onLeave={leave}
        onEnd={leave}
      />
    );
  };

  /* ------------------------- fatal connection ------------------------- */

  if (fatal) {
    return (
      <div className="card" style={{ padding: 'var(--s-5)' }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>{fatal.title}</h2>
        <p className="muted" style={{ margin: '0 0 14px' }}>{fatal.detail}</p>
        <div className="btnrow">
          <button type="button" className="btn primary" onClick={() => { setFatal(null); setPhase('lobby'); }}>
            Back to the device check
          </button>
        </div>
      </div>
    );
  }

  /* ----------------------------- landing ----------------------------- */

  if (phase === 'landing') {
    return (
      <ClassSheet
        intro={intro}
        viewerId={viewerId}
        joining={false}
        error={err}
        onJoin={() => setPhase('lobby')}
      />
    );
  }

  /* ----------------------------- in room ----------------------------- */

  if (phase === 'in' || (phase === 'joining' && room)) {
    return renderRoom();
  }

  /* ----------------------------- joining ----------------------------- */

  if (phase === 'joining') {
    return (
      <div className="croom-lobby">
        <div className="croom-lobby-stage">
          <div className="croom-waiting"><p>Joining the room…</p></div>
        </div>
      </div>
    );
  }

  /* ------------------------------ lobby ------------------------------ */

if (phase === 'lobby') {
    return (
      <Lobby
        role={role ?? 'participant'}
        joining={false}
        error={err}
        onJoin={({ mic, cam }) => {
          setIntent({ mic, cam });
          void join();
        }}
      />
    );
  }

  /* ------------------------------ left ------------------------------- */

  return (
    <ClassSheet
      intro={intro}
      viewerId={viewerId}
      joining={false}
      error={err ?? 'You left the room. Rejoin whenever you are ready.'}
      onJoin={() => setPhase('lobby')}
    />
  );
}