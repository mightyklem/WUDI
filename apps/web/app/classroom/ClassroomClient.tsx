'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LiveKitRoom, useRoomContext, useTracks, useLocalParticipant,
  VideoTrack, RoomAudioRenderer,
} from '@livekit/components-react';
import { RoomEvent, Track } from 'livekit-client';
import { getAccess } from '@/lib/client-auth';

type Role = 'trainer' | 'moderator' | 'participant';
type ChatMsg = { from: string; who: string; text: string; at: number };
type Poll = { id: string; question: string; options: string[]; open: boolean; votes: Record<number, number>; seen: Set<string> };

const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * Chat and the hand list arrive keyed on participant identity, which is a database
 * id like cmuyynvyr0000uk8sssz6hj9d. Show something a person recognises: the
 * email local part, falling back to the full address and then the id.
 */
function displayName(p?: { identity: string; name?: string }): string {
  const raw = p?.name || p?.identity || 'someone';
  const local = raw.split('@')[0];
  return (local || raw).trim();
}

/**
 * One main stage plus a picture-in-picture round of cameras.
 *
 * A screen share always takes the stage when someone is sharing. Otherwise the
 * stage goes to whoever is speaking, falling back to the first camera. The round
 * keeps every camera visible without the duplicate feeds the grid used to produce.
 */
function StageAndRound() {
  const room = useRoomContext();
  const [big, setBig] = useState(false);

  const screens = useTracks([{ source: Track.Source.ScreenShare, withPlaceholder: false }]);
  const cameras = useTracks([{ source: Track.Source.Camera, withPlaceholder: false }]);

  const share = screens[0] ?? null;
  const speaking = cameras.find((t) => t.participant.isSpeaking) ?? null;
  const stage = share ?? speaking ?? cameras[0] ?? null;
  // Everyone not already on the stage, so nobody appears twice.
  const round = cameras.filter((t) => t !== stage);

  if (!stage) {
    return (
      <div style={{ border: '1.5px solid var(--line)', borderRadius: 14, minHeight: 260, background: '#0B1F14', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="muted" style={{ color: '#fff' }}>Waiting for the trainer to start…</p>
      </div>
    );
  }

  return (
    <div style={{ position: big ? 'fixed' : 'relative', inset: big ? 0 : undefined, zIndex: big ? 50 : undefined, background: big ? '#000' : undefined, borderRadius: big ? 0 : 14 }}>
      <div
        style={{
          position: 'relative',
          background: '#0B1F14',
          borderRadius: big ? 0 : 14,
          overflow: 'hidden',
          border: '1.5px solid var(--line)',
        }}
      >
        <VideoTrack trackRef={stage as never} style={{ width: '100%', maxHeight: big ? '100vh' : 460, display: 'block' }} />
        <span style={{ position: 'absolute', left: 10, top: 10, background: 'rgba(0,0,0,.65)', color: '#fff', padding: '4px 10px', borderRadius: 999, fontSize: 13 }}>
          {share ? `🖥 ${displayName(stage.participant)} is presenting` : displayName(stage.participant)}
        </span>
        <button
          type="button"
          className="btn"
          onClick={() => setBig((v) => !v)}
          style={{ position: 'absolute', right: 10, top: 10 }}
        >
          {big ? '⤡ Exit full screen' : '⤢ Full screen'}
        </button>
      </div>

      {round.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            marginTop: 10,
            ...(big ? { position: 'fixed', right: 16, bottom: 16, zIndex: 51, marginTop: 0 } : {}),
          }}
        >
          {round.map((t) => (
            <div
              key={t.participant.identity}
              style={{
                width: 96, height: 96, borderRadius: '50%', overflow: 'hidden',
                border: `2px solid ${t.participant.isSpeaking ? 'var(--accent)' : 'var(--line)'}`,
                background: '#0B1F14',
                position: 'relative',
              }}
            >
              <VideoTrack trackRef={t as never} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <span
                style={{
                  position: 'absolute', inset: 'auto 0 0 0', background: 'rgba(0,0,0,.6)',
                  color: '#fff', fontSize: 10, textAlign: 'center', padding: '2px 0',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
              >
                {displayName(t.participant)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Resolve a participant id to a display name via the room's roster. */
function nameOf(room: ReturnType<typeof useRoomContext>, identity: string): string {
  const p = room.getParticipantByIdentity(identity);
  return displayName(p ?? { identity });
}

function RoomBody({ sessionId, role, myId, lowData, onLowData }: { sessionId: string; role: Role; myId: string; lowData: boolean; onLowData: (v: boolean) => void }) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState('');
  const [poll, setPoll] = useState<Poll | null>(null);
  const [pq, setPq] = useState('Which topic next?');
  const [popts, setPopts] = useState('Pricing, Wiring, Safety');
  const [hands, setHands] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  // Learners are minted listen-only. This flips true only when the server grants
  // publish rights, which arrives as a real permission event rather than a
  // data-channel message a learner could forge for themselves.
  const [canSpeak, setCanSpeak] = useState(role !== 'participant');

  useEffect(() => {
    setCanSpeak(!!localParticipant.permissions?.canPublish);
    // ParticipantPermission is declared in @livekit/protocol but not re-exported from
    // livekit-client, so describe the slice of it we actually read.
    const onPerm = (_prev: unknown, who: { identity: string; permissions?: { canPublish?: boolean } }) => {
      if (who.identity === myId) setCanSpeak(!!who.permissions?.canPublish);
    };
    room.on(RoomEvent.ParticipantPermissionsChanged, onPerm);
    return () => { room.off(RoomEvent.ParticipantPermissionsChanged, onPerm); };
  }, [room, myId, localParticipant]);

  useEffect(() => {
    const onData = (payload: Uint8Array, participant?: { identity: string; name?: string }, _kind?: unknown, topic?: string) => {
      try {
        const m = JSON.parse(dec.decode(payload));
        const from = participant?.identity || 'unknown';
        // Keep the display name alongside the id: chat lines and the hand list
        // both read better with a name, but the id is what the trainer acts on.
        const who = displayName(participant);
        if (topic === 'chat' && m.text) setChat((c) => [...c.slice(-99), { from, who, text: String(m.text).slice(0, 500), at: Date.now() }]);
        if (topic === 'poll') {
          if (m.kind === 'open') setPoll({ id: m.id, question: m.question, options: m.options, open: true, votes: {}, seen: new Set() });
          if (m.kind === 'close') setPoll((p) => (p && p.id === m.id ? { ...p, open: false } : p));
          if (m.kind === 'vote') setPoll((p) => {
            if (!p || p.id !== m.id || !p.open || p.seen.has(from)) return p;
            const seen = new Set(p.seen); seen.add(from);
            return { ...p, seen, votes: { ...p.votes, [m.opt]: (p.votes[m.opt] || 0) + 1 } };
          });
        }
        if (topic === 'hand') setHands((h) => {
          const n = new Set(h);
          if (m.up) n.add(from); else n.delete(from);
          return n;
        });
      } catch { /* ignore malformed */ }
    };
    room.on('dataReceived', onData);
    return () => { room.off('dataReceived', onData); };
  }, [room]);

  const send = useCallback(async (topic: string, obj: unknown) => {
    await room.localParticipant.publishData(enc.encode(JSON.stringify(obj)), { reliable: true, topic });
  }, [room]);

  const totalVotes = useMemo(() => Object.values(poll?.votes || {}).reduce((a, b) => a + b, 0), [poll]);
  const canMod = role === 'trainer' || role === 'moderator';
  const mayPublish = role !== 'participant' || canSpeak;

  async function moderate(action: 'mute' | 'allowSpeak' | 'remove' | 'end', identity?: string) {
    const access = getAccess();
    const r = await fetch(`/api/sessions/${sessionId}/moderate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
      body: JSON.stringify({ action, identity }),
    });
    const j = await r.json().catch(() => ({}));
    const said = action === 'end' ? 'Session ended.' : action === 'allowSpeak' ? 'They can speak now.' : `${action} sent.`;
    setMsg(r.ok ? said : (j.error || 'Action failed'));
  }

  return (
    <div>
      {!mayPublish && (
        <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>
          You are listening. Raise your hand and the trainer will let you speak.
        </p>
      )}
      {mayPublish && role === 'participant' && (
        <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>
          The trainer has let you speak. Turn your mic or camera on below.
        </p>
      )}
      <div className="btnrow" style={{ marginTop: 0 }}>
        <button
          className="btn"
          disabled={!mayPublish}
          onClick={() => localParticipant.setMicrophoneEnabled(!localParticipant.isMicrophoneEnabled)}
        >
          {localParticipant.isMicrophoneEnabled ? '🎙 Mute me' : '🎙 Unmute'}
        </button>
        {!lowData && (
          <button
            className="btn"
            disabled={!mayPublish}
            onClick={() => localParticipant.setCameraEnabled(!localParticipant.isCameraEnabled)}
          >
            {localParticipant.isCameraEnabled ? '📷 Cam off' : '📷 Cam on'}
          </button>
        )}
        <button
          className="btn"
          disabled={!mayPublish}
          onClick={() => localParticipant.setScreenShareEnabled(!localParticipant.isScreenShareEnabled)}
        >
          🖥 Share
        </button>
        {!mayPublish && (
          <button className="btn" onClick={() => send('hand', { up: true })}>✋ Ask to speak</button>
        )}
        {mayPublish && (
          <button className="btn" onClick={() => send('hand', { up: !hands.has(myId) })}>
            ✋ {hands.has(myId) ? 'Lower hand' : 'Raise hand'}
          </button>
        )}
        <label style={{ fontSize: 14 }}><input type="checkbox" checked={lowData} onChange={(e) => onLowData(e.target.checked)} /> Low-data / audio-only</label>
        {role === 'trainer' && <button className="btn primary" onClick={() => moderate('end')}>⏻ End session</button>}
      </div>
      {hands.size > 0 && (
        <p className="muted">
          ✋ Waiting to speak: {[...hands].map((id) => nameOf(room, id)).join(', ')}
        </p>
      )}
      <div style={{ marginTop: 14 }}><StageAndRound /></div>

      <h2 className="sec">Chat</h2>
      <div className="card">
        <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 10 }}>
          {chat.length === 0 && <p className="muted">No messages yet — works on 2G (data channel).</p>}
          {chat.map((c, i) => <p key={i} style={{ margin: '4px 0' }}><b>{c.who}</b>: {c.text}</p>)}
        </div>
        <div className="btnrow" style={{ marginTop: 0 }}>
          <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Message everyone…" style={{ maxWidth: 320 }} />
          <button className="btn primary" onClick={() => { if (draft.trim()) { send('chat', { text: draft.trim() }); setDraft(''); } }}>Send</button>
        </div>
      </div>

      <h2 className="sec">Polls {poll && (poll.open ? '(live)' : '(closed)')}</h2>
      <div className="card">
        {poll ? (
          <div>
            <p><b>{poll.question}</b></p>
            {poll.options.map((o, i) => {
              const v = poll.votes[i] || 0;
              const pct = totalVotes ? Math.round((v / totalVotes) * 100) : 0;
              return (
                <div key={i} className="btnrow" style={{ marginTop: 8 }}>
                  <button className="btn" disabled={!poll.open} onClick={() => send('poll', { kind: 'vote', id: poll.id, opt: i })}>{o}</button>
                  <span className="muted">{v} votes · {pct}%</span>
                </div>
              );
            })}
            {canMod && poll.open && <div className="btnrow"><button className="btn" onClick={() => send('poll', { kind: 'close', id: poll.id })}>Close poll</button></div>}
          </div>
        ) : <p className="muted">No active poll.</p>}
        {canMod && (
          <div style={{ marginTop: 12 }}>
            <label className="fl">New poll</label>
            <input type="text" value={pq} onChange={(e) => setPq(e.target.value)} style={{ maxWidth: '100%' }} />
            <label className="fl">Options (comma separated)</label>
            <input type="text" value={popts} onChange={(e) => setPopts(e.target.value)} style={{ maxWidth: '100%' }} />
            <div className="btnrow">
              <button className="btn primary" onClick={() => {
                const options = popts.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 6);
                if (!pq.trim() || options.length < 2) return setMsg('Need a question + 2 options.');
                send('poll', { kind: 'open', id: `poll-${Date.now()}`, question: pq.trim(), options });
              }}>Open poll</button>
            </div>
          </div>
        )}
      </div>
      {msg && <div className="okmsg">{msg}</div>}
      {canMod && <p className="muted" style={{ fontSize: 13 }}>A learner can only speak once you allow it. Everyone else is listen-only.</p>}
      {canMod && (
        <RemoteRoster
          hands={hands}
          onAllow={(id) => moderate('allowSpeak', id)}
          onMute={(id) => moderate('mute', id)}
          onRemove={(id) => moderate('remove', id)}
        />
      )}
    </div>
  );
}

function RemoteRoster({
  hands,
  onAllow,
  onMute,
  onRemove,
}: {
  hands: Set<string>;
  onAllow: (id: string) => void;
  onMute: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const room = useRoomContext();
  const remotes = [...room.remoteParticipants.values()];
  if (!remotes.length) return null;
  return (
    <div className="card" style={{ marginTop: 12 }}>
      {remotes.map((p) => {
        const speaking = !!p.permissions?.canPublish;
        const raised = hands.has(p.identity);
        return (
          <div key={p.identity} className="btnrow" style={{ marginTop: 6, alignItems: 'center' }}>
            <span>
              {displayName(p)}
              {raised && !speaking ? ' ✋' : ''}
              {speaking ? ' 🎙' : ''}
            </span>
            {!speaking ? (
              <button className="btn primary" onClick={() => onAllow(p.identity)}>Allow speech</button>
            ) : (
              <button className="btn" onClick={() => onMute(p.identity)}>Mute</button>
            )}
            <button className="btn" onClick={() => onRemove(p.identity)}>Remove</button>
          </div>
        );
      })}
    </div>
  );
}

export default function ClassroomClient({ sessionId }: { sessionId: string }) {
  const [creds, setCreds] = useState<{ token: string; url: string; room: string; role: Role; myId: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lowData, setLowData] = useState(false);

  useEffect(() => {
    const access = getAccess();
    if (!access) return void setErr('Log in first, then join from your training page.');
    fetch(`/api/sessions/${sessionId}/token`, {
      method: 'POST', headers: { authorization: `Bearer ${access}` },
    }).then(async (r) => {
      const j = await r.json();
      if (!r.ok) return setErr(j.error || 'Could not join');
      let id = 'me';
      try { id = (JSON.parse(atob(j.token.split('.')[1])) as { sub?: string }).sub || 'me'; } catch { /* ignore */ }
      setCreds({ token: j.token, url: j.url, room: j.room, role: j.role, myId: id });
    }).catch(() => setErr('Network error joining room'));
  }, [sessionId]);

  if (err) return <div className="err">{err}</div>;
  if (!creds) return <p className="muted">Joining room…</p>;
  return (
    <LiveKitRoom
      serverUrl={creds.url} token={creds.token} connect
      video={!lowData} audio
      onDisconnected={() => setErr('Disconnected from the room.')}
    >
      <p className="muted" style={{ fontSize: 13 }}>you are <b>{creds.role}</b></p>
      {/* Renders every remote audio track and handles the browser autoplay block.
          Without it the learner hears nothing until they click something. */}
      <RoomAudioRenderer />
      <RoomBody sessionId={sessionId} role={creds.role} myId={creds.myId} lowData={lowData} onLowData={setLowData} />
    </LiveKitRoom>
  );
}
