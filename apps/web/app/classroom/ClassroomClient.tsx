'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authFetch, getAccess } from '@/lib/client-auth';
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
  intro: intro0,
}: {
  sessionId: string;
  intro: Intro;
}) {
  const [phase, setPhase] = useState<Phase>('landing');
  const [pass, setPass] = useState<Pass | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fatal, setFatal] = useState<{ title: string; detail: string } | null>(null);
  const [myId, setMyId] = useState('me');
  const [intent, setIntent] = useState<{ mic: boolean; cam: boolean; deviceId: string }>({ mic: false, cam: false, deviceId: '' });
  const appliedFor = useRef<string | null>(null);
  const [mediaIssue, setMediaIssue] = useState<string | null>(null);
  // Whether the viewer owns this training decides if the attach-a-product grid is
  // shown at all. A learner should never be offered a form they cannot use. The
  // token lives in localStorage, so this has to be settled in the browser.
const [viewerId, setViewerId] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  useEffect(() => {
    const access = getAccess();
    if (!access) return;
    let dead = false;
    authFetch('/api/me', { headers: { authorization: `Bearer ${access}` } })
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
    authFetch(`/api/sessions/${sessionId}/token`, {
      method: 'GET',
      headers: { authorization: `Bearer ${access}` },
      cache: 'no-store',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!dead && j?.role) setRole(j.role as Role); })
      .catch(() => {});
    return () => { dead = true; };
  }, [sessionId]);


  const subtitle = `${intro0.hostName} · ${spanLabel(intro0)}`;

  const fetchPass = useCallback(async () => {
    const access = getAccess();
    if (!access) {
      setErr('Log in first, then join from your training page.');
      return null;
    }
    const r = await authFetch(`/api/sessions/${sessionId}/token`, {
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

const [admitted, setAdmitted] = useState(false);
  const [canPublish, setCanPublish] = useState(false);
  const [liveIntro, setLiveIntro] = useState<Intro | null>(null);

  useEffect(() => {
    authFetch(`/api/sessions/${sessionId}/token`, {
      method: 'GET',
      headers: { authorization: `Bearer ${getAccess() ?? ''}` },
      cache: 'no-store',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return;
        if (j.role) setRole(j.role as Role);
        if (typeof j.admitted === 'boolean') setAdmitted(j.admitted);
        if (typeof j.startsWithMic === 'boolean') setCanPublish(j.startsWithMic);
      })
      .catch(() => {});
  }, [sessionId]);

  const intro = useMemo(
    () => (liveIntro
      ? { ...intro0, admittedAtUtc: liveIntro.admittedAtUtc, endedAtUtc: liveIntro.endedAtUtc }
      : intro0),
    [liveIntro, intro0],
  );

  // The room is told who it is looking at through the token, and this flag decides
  // whether the client switches the mic and camera on by itself. A trainer who
  // arrives muted because this was false cannot teach, and used to have no way to
  // tell that apart from a hardware fault.
  useEffect(() => {
    if (!room || state !== 'connected' || appliedFor.current === pass?.token) return;
    appliedFor.current = pass?.token ?? null;
    // Only ever for staff. A learner is muted on arrival because they cannot
    // publish until the trainer grants it, and auto-enabling would fight that.
    const staff = pass?.role === 'trainer' || pass?.role === 'moderator' || pass?.role === 'admin';
    const wantMic = staff && intent.mic;
    const wantCam = staff && intent.cam;
    (async () => {
      // Reported, not swallowed. A refused device used to fail silently, which is
      // indistinguishable from a muted microphone -- the one thing a trainer cannot
      // afford to misdiagnose while standing in front of a class.
      const fail = (what: string, e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        const denied = /permission|denied|notallowed|notfound|inuse/i.test(msg);
        setMediaIssue(
          denied
            ? `Your ${what} is blocked. Allow it in your browser's site settings, then reload.`
            : `Could not start your ${what}: ${msg}`,
        );
      };
      try {
        if (wantMic) await room.localParticipant.setMicrophoneEnabled(true);
      } catch (e) { fail('microphone', e); }
      try {
        // The device the person chose in the lobby has to actually be handed over here.
        // Calling setCameraEnabled(true) with no capture options asks LiveKit for the
        // default camera, which on a phone is the front one -- so somebody who deliberately
        // picked the rear camera in the lobby got the front one anyway, with nothing on
        // screen to say so. A selector that silently does not select is worse than none.
        if (wantCam) {
          await room.localParticipant.setCameraEnabled(
            true,
            intent.deviceId ? { deviceId: intent.deviceId } : undefined,
          );
        }
      } catch (e) { fail('camera', e); }
    })();
  }, [room, state, pass, intent]);

useEffect(() => {
    if (state === 'connected' && phase === 'joining') setPhase('in');
  }, [state, phase]);

  // The server has to learn that the trainer is here.
  //
  // It used to depend on the trainer pressing "Open the room" before teaching. Miss that
  // and nothing else recorded it, so once the scheduled end passed the page stopped saying
  // "waiting" and started saying "Finished" -- to the trainer and to every learner, while
  // the trainer was still standing there teaching. A button you must remember to press,
  // exactly when you are about to teach, is the wrong place for that knowledge.
  //
  // A live connection is the authoritative signal and cannot be forgotten. It goes through
  // the same trainer-only, audited endpoint the button used, so the permission model and
  // the audit trail are unchanged -- this only removes the step where the truth was optional.
  useEffect(() => {
    if (state !== 'connected' || !pass) return;
    if (pass.role !== 'trainer') return;
    let cancelled = false;
    authFetch(`/api/sessions/${sessionId}/moderate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${getAccess() ?? ''}` },
      body: JSON.stringify({ action: 'admit' }),
    })
      .then(async (r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((j) => {
        // 409 means the session was already ended. Surfaced rather than swallowed, because
        // a trainer who is teaching into an ended session is silently losing attendance.
        if (cancelled || !j) return;
        if (j.error) setErr(`This session has ended: ${j.error}`);
        else if (j.admittedAtUtc) setLiveIntro({ ...intro0, admittedAtUtc: j.admittedAtUtc });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [state, pass, sessionId, intro0]);

  // A learner already sitting on the page is the case the server-rendered intro cannot
  // cover: it was rendered when they arrived, so it is frozen at whatever the room was
  // then. Without this they watch "Waiting for the host" until the trainer opens, and then
  // keep watching, because nothing re-asks the server. Twenty seconds is often longer
  // than a learner will wait before concluding they were forgotten.
  //
  // Only while on the landing page -- no reason to keep asking once they are in the room,
  // and every unnecessary poll on a metered connection is one fewer reason to stay.
  useEffect(() => {
    if (phase !== 'landing') return;
    let stop = false;
    const check = async () => {
      try {
        const r = await authFetch(`/api/sessions/${sessionId}/live`, { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        if (stop) return;
        if (j.roomOpen && !liveIntro?.admittedAtUtc) {
          setLiveIntro({ ...intro0, admittedAtUtc: j.admittedAtUtc });
        }
        // End outranks the open latch, so a closed room stops inviting people in even
        // though it legitimately opened an hour ago.
        if (j.status === 'ended' && !liveIntro?.endedAtUtc) {
          setLiveIntro({ ...intro0, admittedAtUtc: j.admittedAtUtc ?? liveIntro?.admittedAtUtc ?? null, endedAtUtc: j.endedAtUtc });
          setErr('This session has ended. The trainer has closed the room.');
        }
      } catch { /* offline or mid-navigation; the next tick will say otherwise */ }
    };
    const id = setInterval(check, 20000);
    void check();
    return () => { stop = true; clearInterval(id); };
  }, [phase, sessionId, intro0, liveIntro?.admittedAtUtc, liveIntro?.endedAtUtc]);

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
        minPct={intro.minPct}
        introStartsAt={intro.startsAtUtc}
        introEndsAt={intro.endsAtUtc}
        role={pass?.role ?? 'participant'}
        myId={myId}
        trainerId={intro.ownerId}
        state={state}
        quality={quality}
        retryIn={retryIn}
        retryNow={retryNow}
        mediaIssue={mediaIssue}
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
        sessionId={sessionId}
        onAdmitted={() => {
          setAdmitted(true);
          setLiveIntro({ ...intro0, admittedAtUtc: new Date().toISOString() });
        }}
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
        onJoin={({ mic, cam, deviceId }) => {
          setIntent({ mic, cam, deviceId });
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
        sessionId={sessionId}
        onAdmitted={() => {
          setAdmitted(true);
          setLiveIntro({ ...intro0, admittedAtUtc: new Date().toISOString() });
        }}
        joining={false}
        error={err ?? 'You left the room. Rejoin whenever you are ready.'}
        onJoin={() => setPhase('lobby')}
      />
    );
}