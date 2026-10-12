'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getAccess } from '@/lib/client-auth';
import { useRoomConnection, describeConnectionFailure } from './client/useClassroom';
import type { Role } from './client/model';
import Lobby from './client/Lobby';
import ClassroomRoom from './client/ClassroomRoom';
import './client/classroom.css';

type Phase = 'landing' | 'lobby' | 'joining' | 'in' | 'left';

type Pass = { token: string; url: string; room: string; role: Role };

/**
 * The classroom shell: landing, then a device check, then the room.
 *
 * Nothing connects until the person chooses to join. The previous version fetched
 * a room pass on mount and opened the camera the instant the page loaded, so a
 * learner who only ever wanted to listen was prompted for permissions and shown
 * a room they had not agreed to enter.
 */
export default function ClassroomClient({
  sessionId,
  title,
  subtitle,
}: {
  sessionId: string;
  title: string;
  subtitle: string;
}) {
  const [phase, setPhase] = useState<Phase>('landing');
  const [pass, setPass] = useState<Pass | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fatal, setFatal] = useState<{ title: string; detail: string } | null>(null);
  const [myId, setMyId] = useState('me');
  const [intent, setIntent] = useState<{ mic: boolean; cam: boolean }>({ mic: false, cam: false });

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
    } catch { /* a missing sub only costs a nicer name */ }
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
  // always start muted: this is a taught class, and appearing on camera before
  // the trainer grants permission is exactly what the hand-raise flow prevents.
  const appliedFor = useRef<string | null>(null);
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
    if (state === 'connected' && (phase === 'joining')) setPhase('in');
  }, [state, phase]);

  const join = useCallback(async () => {
    setErr(null);
    setFatal(null);
    setPhase('joining');
    const p = await fetchPass();
    if (!p) { setPhase('lobby'); return; }
    appliedFor.current = null;
  }, [fetchPass]);

  const leave = useCallback(() => {
    room?.disconnect();
    setPass(null);
    appliedFor.current = null;
    setPhase('left');
  }, [room]);

  /* ----------------------------- landing ----------------------------- */

  if (phase === 'landing' || (phase === 'left' && !fatal)) {
    return (
      <div className="card" style={{ padding: 'var(--s-5)' }}>
        <p className="eyebrow">Live classroom</p>
        <h2 style={{ margin: '0 0 6px', fontSize: 20 }}>{title}</h2>
        <p className="muted" style={{ margin: '0 0 14px', fontSize: 14 }}>{subtitle}</p>
        <div className="btnrow">
          <button type="button" className="btn primary lg" onClick={() => setPhase('lobby')}>
            Check camera and join
          </button>
          {phase === 'left' && <span className="muted">You left the room.</span>}
        </div>
        {err && <div className="err">{err}</div>}
        <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
          Learners join muted. Raise your hand when you want to speak and the trainer will let you in.
        </p>
      </div>
    );
  }

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

  /* ------------------------------ lobby ------------------------------ */

  if (phase === 'lobby' || phase === 'joining') {
    // The room must exist before the lobby hands over, otherwise joining is a
    // flash of empty stage while the socket opens.
    if (phase === 'joining' && room) {
      return (
        <ClassroomRoom
          room={room}
          sessionId={sessionId}
          sessionTitle={title}
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
    }
    if (phase === 'joining') {
      return (
        <div className="croom-lobby">
          <div className="croom-lobby-stage">
            <div className="croom-waiting"><p>Joining the room…</p></div>
          </div>
        </div>
      );
    }
    return (
      <Lobby
        role={pass?.role ?? 'participant'}
        joining={false}
        error={err}
        onJoin={({ mic, cam }) => {
          setIntent({ mic, cam });
          void join();
        }}
      />
    );
  }

  /* ------------------------------- room ------------------------------- */

  if (phase === 'in' && room) {
    return (
      <ClassroomRoom
        room={room}
        sessionId={sessionId}
        sessionTitle={title}
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
  }

  return null;
}