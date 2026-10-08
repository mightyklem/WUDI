'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LiveKitRoom, useRoomContext, useTracks, useLocalParticipant,
  VideoTrack, AudioTrack,
} from '@livekit/components-react';
import { RoomEvent, Track } from 'livekit-client';
import { getAccess } from '@/lib/client-auth';

type Role = 'trainer' | 'moderator' | 'participant';
type ChatMsg = { from: string; text: string; at: number };
type Poll = { id: string; question: string; options: string[]; open: boolean; votes: Record<number, number>; seen: Set<string> };

const enc = new TextEncoder();
const dec = new TextDecoder();

function Tiles({ lowData }: { lowData: boolean }) {
  const tracks = useTracks(
    lowData
      ? [{ source: Track.Source.Microphone, withPlaceholder: true }]
      : [
          { source: Track.Source.Camera, withPlaceholder: true },
          { source: Track.Source.ScreenShare, withPlaceholder: false },
          { source: Track.Source.Microphone, withPlaceholder: true },
        ],
  );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
      {tracks.map((t) => (
        <div key={t.participant.identity + t.source} style={{ border: '1.5px solid var(--line)', borderRadius: 12, overflow: 'hidden', minHeight: 140, background: '#0B1F14', color: '#fff', position: 'relative' }}>
          {t.publication?.kind === 'video' ? (
            <VideoTrack trackRef={t as never} style={{ width: '100%' }} />
          ) : t.publication?.kind === 'audio' ? (
            <AudioTrack trackRef={t as never} />
          ) : null}
          <span style={{ position: 'absolute', left: 8, bottom: 6, fontSize: 12, background: 'rgba(0,0,0,.6)', padding: '2px 8px', borderRadius: 8 }}>
            {t.participant.name || t.participant.identity}
          </span>
        </div>
      ))}
      {tracks.length === 0 && <p className="muted">Waiting for others to join…</p>}
    </div>
  );
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
    const onData = (payload: Uint8Array, participant?: { identity: string }, _kind?: unknown, topic?: string) => {
      try {
        const m = JSON.parse(dec.decode(payload));
        const from = participant?.identity || 'unknown';
        if (topic === 'chat' && m.text) setChat((c) => [...c.slice(-99), { from, text: String(m.text).slice(0, 500), at: Date.now() }]);
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
      {hands.size > 0 && <p className="muted">✋ Hands up: {[...hands].join(', ')}</p>}
      <div style={{ marginTop: 14 }}><Tiles lowData={lowData} /></div>

      <h2 className="sec">Chat</h2>
      <div className="card">
        <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 10 }}>
          {chat.length === 0 && <p className="muted">No messages yet — works on 2G (data channel).</p>}
          {chat.map((c, i) => <p key={i} style={{ margin: '4px 0' }}><b>{c.from}:</b> {c.text}</p>)}
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
              {p.name || p.identity}
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
      <p className="muted">Room: {creds.room} · you are <b>{creds.role}</b></p>
      <RoomBody sessionId={sessionId} role={creds.role} myId={creds.myId} lowData={lowData} onLowData={setLowData} />
    </LiveKitRoom>
  );
}
