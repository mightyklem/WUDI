'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LiveKitRoom, useRoomContext, useTracks, useLocalParticipant,
  VideoTrack, RoomAudioRenderer,
} from '@livekit/components-react';
import { RoomEvent, Track } from 'livekit-client';
import { getAccess } from '@/lib/client-auth';

type Role = 'trainer' | 'moderator' | 'participant';
type ChatMsg = { key: string; from: string; who: string; text: string; at: number; reactions: Record<string, string[]> };
type Poll = { id: string; question: string; options: string[]; open: boolean; votes: Record<number, number>; seen: Set<string> };
type Reaction = { key: string; emoji: string; who: string; x: number };
const REACTION_CHOICES = ['👏', '❤️', '😂', '💡', '🙋'];

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
 *
 * The controls and reactions ride on the stage itself rather than sitting below
 * it, so the person speaking can see a raised hand without looking away from the
 * lesson, and the presenter can act on it in one place.
 */
function StageAndRound({ overlay, reactions }: { overlay?: React.ReactNode; reactions: Reaction[] }) {
  const room = useRoomContext();
  const [big, setBig] = useState(false);

  const screens = useTracks([{ source: Track.Source.ScreenShare, withPlaceholder: false }]);
  const cameras = useTracks([{ source: Track.Source.Camera, withPlaceholder: false }]);

  const share = screens[0] ?? null;
  const speaking = cameras.find((t) => t.participant.isSpeaking) ?? null;
  const stage = share ?? speaking ?? cameras[0] ?? null;
  // Everyone not already on the stage, so nobody appears twice.
  const round = cameras.filter((t) => t !== stage);

  return (
    <div style={{ position: big ? 'fixed' : 'relative', inset: big ? 0 : undefined, zIndex: big ? 50 : undefined }}>
      <div
        style={{
          position: 'relative',
          background: '#0B1F14',
          borderRadius: big ? 0 : 'var(--r-md)',
          overflow: 'hidden',
          border: '1.5px solid var(--line)',
          // Landscape by default. A portrait stage wastes most of the frame and makes
          // a shared slide impossible to read.
          aspectRatio: '16 / 9',
          width: '100%',
        }}
      >
        {stage ? (
          <VideoTrack
            trackRef={stage as never}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p className="muted" style={{ color: '#fff' }}>Waiting for the trainer to start…</p>
          </div>
        )}

        <span style={{ position: 'absolute', left: 10, top: 10, background: 'rgba(0,0,0,.65)', color: '#fff', padding: '4px 10px', borderRadius: 999, fontSize: 13 }}>
          {share ? `🖥 ${displayName(stage.participant)} is presenting` : stage ? displayName(stage.participant) : ''}
        </span>

        <button
          type="button"
          className="btn ghost"
          onClick={() => setBig((v) => !v)}
          style={{ position: 'absolute', right: 10, top: 10, minHeight: 0, padding: '7px 13px', fontSize: 13 }}
        >
          {big ? '⤡ Exit full screen' : '⤢ Full screen'}
        </button>

        {/* Reactions float up across the stage so they read as part of the lesson. */}
        {reactions.map((r) => (
          <span
            key={r.key}
            aria-hidden
            style={{
              position: 'absolute', left: `${r.x}%`, bottom: '18%',
              fontSize: 30, pointerEvents: 'none',
              animation: `floatUp 2.4s var(--ease) forwards`,
            }}
          >
            {r.emoji}
          </span>
        ))}

        {/* Controls live on the stage, so "ask to speak" is where the lesson is. */}
        {overlay && (
          <div
            className="glass"
            style={{
              position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 12,
              padding: '7px 9px', borderRadius: 'var(--r-full)', maxWidth: 'calc(100% - 20px)',
              overflowX: 'auto', background: 'rgba(255,255,255,.86)',
            }}
          >
            {overlay}
          </div>
        )}
      </div>

      {round.length > 0 && (
        <div
          style={{
            display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10,
            ...(big ? { position: 'fixed', right: 16, bottom: 16, zIndex: 51, marginTop: 0 } : {}),
          }}
        >
          {round.map((t) => (
            <div
              key={t.participant.identity}
              style={{
                width: 96, height: 96, borderRadius: '50%', overflow: 'hidden',
                border: `2px solid ${t.participant.isSpeaking ? 'var(--accent)' : 'var(--line)'}`,
                background: '#0B1F14', position: 'relative',
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
  const [reactions, setReactions] = useState<Reaction[]>([]);
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
        if (topic === 'chat' && m.text) {
          setChat((c) => {
            // The sender carries the key, so a reaction points at the same message
            // in everyone's view instead of a second copy.
            const key = typeof m.key === 'string' ? m.key : `${from}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            return [...c.slice(-99), { key, from, who, text: String(m.text).slice(0, 500), at: Date.now(), reactions: {} }];
          });
        }
        // A reaction on a message, keyed by its own id so everyone sees the same bubble.
        if (topic === 'react' && m.msgKey && m.emoji) {
          setChat((c) => c.map((x) => {
            if (x.key !== m.msgKey) return x;
            const mine = x.reactions[m.emoji] || [];
            if (mine.includes(who)) return x; // one reaction per person per emoji
            return { ...x, reactions: { ...x.reactions, [m.emoji]: [...mine, who] } };
          }));
        }
        // A free-floating reaction, shown on the stage so the speaker notices.
        if (topic === 'reaction' && m.emoji) {
          const key = `${from}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          setReactions((r) => [...r.slice(-19), { key, emoji: String(m.emoji).slice(0, 4), who, x: 12 + Math.random() * 76 }]);
          setTimeout(() => setReactions((r) => r.filter((x) => x.key !== key)), 2600);
        }
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

  /**
   * LiveKit delivers data messages to everyone EXCEPT the sender. Without an
   * explicit local echo, a person types a message, it reaches everyone else, and
   * it never appears in their own chat — which reads as the room being broken.
   * Everything sent is therefore also applied locally at once.
   */
  const say = useCallback(async (text: string) => {
    const clean = text.trim().slice(0, 500);
    if (!clean) return;
    const key = `${myId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setChat((c) => [...c.slice(-99), { key, from: myId, who: displayName({ identity: myId, name: myId }), text: clean, at: Date.now(), reactions: {} }]);
    await send('chat', { text: clean, key });
  }, [myId, send]);

  /** Add a reaction to a message locally, then broadcast it. */
  const reactTo = useCallback(async (msgKey: string, emoji: string) => {
    const me = displayName({ identity: myId, name: myId });
    setChat((c) => c.map((x) => {
      if (x.key !== msgKey) return x;
      const mine = x.reactions[emoji] || [];
      if (mine.includes(me)) return x;
      return { ...x, reactions: { ...x.reactions, [emoji]: [...mine, me] } };
    }));
    await send('react', { msgKey, emoji });
  }, [myId, send]);

  /** Float a reaction on the stage locally, then broadcast it. */
  const popReaction = useCallback(async (emoji: string) => {
    const key = `${myId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const push = () => {
      setReactions((r) => [...r.slice(-19), { key, emoji, who: myId, x: 12 + Math.random() * 76 }]);
      setTimeout(() => setReactions((r) => r.filter((x) => x.key !== key)), 2600);
    };
    push();
    await send('reaction', { emoji });
  }, [myId, send]);

  const totalVotes = useMemo(() => Object.values(poll?.votes || {}).reduce((a, b) => a + b, 0), [poll]);
  const canMod = role === 'trainer' || role === 'moderator';
  const mayPublish = role !== 'participant' || canSpeak;
  // Hands that have not yet been granted speech, in the order they were raised.
// Bumped whenever a participant's permissions change. Without it the memo below never
// re-runs after an Allow, so a learner kept showing as "waiting" after being granted
// speech -- the queue disagreed with the room.
const [permVersion, setPermVersion] = useState(0);
useEffect(() => {
  const bump = () => setPermVersion((v) => v + 1);
  room.on(RoomEvent.ParticipantPermissionsChanged, bump);
  return () => { room.off(RoomEvent.ParticipantPermissionsChanged, bump); };
}, [room]);

// Only count a hand from someone actually in the room. An identity that has left has no
// participant record, so it cannot be resolved and would sit in the queue forever.
const waiting = useMemo(
  () => [...hands].filter((id) => {
    const p = room.getParticipantByIdentity(id);
    return !!p && !p.permissions?.canPublish;
  }),
  [hands, room, permVersion],
);

  // People currently holding speech. Mute has to act on these, not on the waiting queue:
  // a learner who has not been granted speech cannot publish, so muting them is a no-op.
  const [speakable, setSpeakable] = useState<string[]>([]);
  useEffect(() => {
    const refresh = () => {
      const ids: string[] = [];
      room.remoteParticipants.forEach((p) => {
        if (p.permissions?.canPublish) ids.push(p.identity);
      });
      setSpeakable(ids);
    };
    refresh();
    room.on(RoomEvent.ParticipantPermissionsChanged, refresh);
    room.on(RoomEvent.TrackMuted, refresh);
    room.on(RoomEvent.TrackUnmuted, refresh);
    return () => {
      room.off(RoomEvent.ParticipantPermissionsChanged, refresh);
      room.off(RoomEvent.TrackMuted, refresh);
      room.off(RoomEvent.TrackUnmuted, refresh);
    };
  }, [room]);

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
        <p className="muted" style={{ fontSize: 14, marginTop: 0, marginBottom: 10 }}>
          You are listening. Raise your hand and the trainer will let you speak.
        </p>
      )}
      {mayPublish && role === 'participant' && (
        <p className="muted" style={{ fontSize: 14, marginTop: 0, marginBottom: 10 }}>
          The trainer has let you speak. Turn your mic or camera on below.
        </p>
      )}
      {/* Controls render onto the stage itself, so "ask to speak" sits where the
          lesson is rather than in a bar the speaker has to look away from. */}
      <div style={{ marginTop: 12 }}>
        <StageAndRound
          reactions={reactions}
          overlay={
            <>
              <button
                className="btn"
                disabled={!mayPublish}
                style={{ minHeight: 0, padding: '8px 14px', fontSize: 14 }}
                onClick={() => localParticipant.setMicrophoneEnabled(!localParticipant.isMicrophoneEnabled)}
              >
                {localParticipant.isMicrophoneEnabled ? '🎙 Mute' : '🎙 Unmute'}
              </button>
              {!lowData && (
                <button
                  className="btn"
                  disabled={!mayPublish}
                  style={{ minHeight: 0, padding: '8px 14px', fontSize: 14 }}
                  onClick={() => localParticipant.setCameraEnabled(!localParticipant.isCameraEnabled)}
                >
                  {localParticipant.isCameraEnabled ? '📷 Cam off' : '📷 Cam on'}
                </button>
              )}
              <button
                className="btn"
                disabled={!mayPublish}
                style={{ minHeight: 0, padding: '8px 14px', fontSize: 14 }}
                onClick={() => localParticipant.setScreenShareEnabled(!localParticipant.isScreenShareEnabled)}
              >
                🖥 Share
              </button>
              {!mayPublish && (
                <button className="btn paid" style={{ minHeight: 0, padding: '8px 16px', fontSize: 14 }}
                  onClick={async () => {
                    // Local echo too, or your own hand never appears in the queue.
                    setHands((h) => new Set(h).add(myId));
                    await send('hand', { up: true });
                  }}>
                  ✋ Ask to speak
                </button>
              )}
              {mayPublish && (
                <button className="btn" style={{ minHeight: 0, padding: '8px 14px', fontSize: 14 }}
                  onClick={async () => {
                    const up = !hands.has(myId);
                    setHands((h) => { const n = new Set(h); if (up) n.add(myId); else n.delete(myId); return n; });
                    await send('hand', { up });
                  }}>
                  ✋ {hands.has(myId) ? 'Lower hand' : 'Raise hand'}
                </button>
              )}
              {/* Free-floating reactions: they surface on the stage so a speaker
                  notices an answer without watching the chat. */}
              {REACTION_CHOICES.map((e) => (
                <button key={e} className="btn" aria-label={`React ${e}`}
                  style={{ minHeight: 0, padding: '6px 9px', fontSize: 16, borderRadius: 'var(--r-full)' }}
                  onClick={() => popReaction(e)}>
                  {e}
                </button>
              ))}
              <label style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={lowData} onChange={(e) => onLowData(e.target.checked)} /> Low-data
              </label>
              {role === 'trainer' && (
                <button className="btn primary" style={{ minHeight: 0, padding: '8px 16px', fontSize: 14 }}
                  onClick={() => moderate('end')}>⏻ End</button>
              )}
            </>
          }
        />
      </div>

      {/* Raised hands surface on the stage, not down the page. A trainer acting on a
          question has to be looking at the lesson, not scrolling to find a button. */}
      {canMod && waiting.length > 0 && (
        <div
          className="rise"
          style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            marginTop: 12, padding: '10px 14px', borderRadius: 'var(--r-md)',
            background: 'var(--gold-soft)', border: '1px solid #EBD9B4',
            boxShadow: 'var(--sh-1)',
          }}
        >
          <span className="tile-icon tint-gold" aria-hidden
            style={{ width: 36, height: 36, borderRadius: 'var(--r-sm)', fontSize: 17 }}>✋</span>
          <b style={{ fontSize: 14 }}>
            {waiting.length} waiting to speak
          </b>
          {waiting.map((id) => (
            <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13 }}>{nameOf(room, id)}</span>
              <button className="btn primary" style={{ minHeight: 0, padding: '5px 12px', fontSize: 13 }}
                onClick={() => moderate('allowSpeak', id)}>
                Allow
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Mute lives beside Allow rather than in a roster at the foot of the page. It only
          appears for someone who has actually been granted speech, because muting a learner
          who cannot publish yet would do nothing and read as a broken button. */}
      {canMod && speakable.length > 0 && (
        <div
          className="rise"
          style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            marginTop: 12, padding: '10px 14px', borderRadius: 'var(--r-md)',
            background: 'var(--surface-2, #F7F4EF)', border: '1px solid var(--line-2, #E7E0D5)',
          }}
        >
          <span className="tile-icon tint-accent" aria-hidden
            style={{ width: 36, height: 36, borderRadius: 'var(--r-sm)', fontSize: 17 }}>🎙</span>
          <b style={{ fontSize: 14 }}>Can speak</b>
          {speakable.map((id) => (
            <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13 }}>{nameOf(room, id)}</span>
              <button className="btn" style={{ minHeight: 0, padding: '5px 12px', fontSize: 13 }}
                onClick={() => moderate('mute', id)}>
                Mute
              </button>
              {hands.has(id) && (
                <button className="btn" style={{ minHeight: 0, padding: '5px 12px', fontSize: 13 }}
                  onClick={() => moderate('allowSpeak', id)}>
                  Allow again
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {hands.size > 0 && (
        <p className="muted" style={{ fontSize: 14 }}>
          ✋ Waiting to speak: {[...hands].map((id) => nameOf(room, id)).join(', ')}
        </p>
      )}
      <h2 className="sec">Chat</h2>
      {/* Chat reads as a conversation: who said it, which side it sat on, and what
          people thought of it. Your own messages sit apart so you can follow the thread. */}
      <div className="card">
        <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 10, display: 'grid', gap: 10 }}>
          {chat.length === 0 && (
            <p className="muted" style={{ margin: 0 }}>No messages yet — this runs on the data channel, so it works on 2G.</p>
          )}
          {chat.map((c) => {
            const mine = c.from === myId;
            const total = Object.values(c.reactions).reduce((n, v) => n + v.length, 0);
            return (
              <div key={c.key} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                {!mine && (
                  <span className="muted" style={{ fontSize: 12, marginBottom: 3 }}>{c.who}</span>
                )}
                <div
                  style={{
                    background: mine ? 'var(--accent)' : 'var(--pill)',
                    color: mine ? '#fff' : 'var(--ink)',
                    padding: '9px 13px',
                    borderRadius: mine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    maxWidth: '82%',
                    fontSize: 15,
                    boxShadow: 'var(--sh-1)',
                  }}
                >
                  {c.text}
                </div>
                <div style={{ display: 'flex', gap: 5, marginTop: 4, flexWrap: 'wrap', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                  {/* Reactions already on this message, counted per person. */}
                  {Object.entries(c.reactions).map(([emoji, who]) => (
                    <button
                      key={emoji}
                      className="btn"
                      aria-label={`${emoji} ${who.length}`}
                      onClick={() => reactTo(c.key, emoji)}
                      style={{
                        minHeight: 0, padding: '2px 8px', fontSize: 12, borderRadius: 999,
                        background: who.includes(displayName({ identity: c.from, name: c.from })) ? 'var(--accent-soft)' : '#fff',
                      }}
                    >
                      {emoji} {who.length}
                    </button>
                  ))}
                  {['👏', '❤️', '💡'].map((e) => (
                    <button
                      key={'add-' + e}
                      className="btn link"
                      aria-label={`React ${e}`}
                      onClick={() => reactTo(c.key, e)}
                      style={{ minHeight: 0, padding: '2px 6px', fontSize: 12 }}
                    >
                      {e}
                    </button>
                  ))}
                  {total > 0 && <span className="muted" style={{ fontSize: 11, alignSelf: 'center' }}>{total}</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="btnrow" style={{ marginTop: 0 }}>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { say(draft); setDraft(''); }
            }}
            placeholder="Message everyone…"
            style={{ maxWidth: 320 }}
          />
          <button className="btn primary" onClick={() => { say(draft); setDraft(''); }}>
            Send
          </button>
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
      {canMod && <RemoteRoster hands={hands} />}
    </div>
  );
}

function RemoteRoster({ hands }: { hands: Set<string> }) {
  const room = useRoomContext();
  const remotes = [...room.remoteParticipants.values()];
  if (!remotes.length) return null;
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <p className="eyebrow" style={{ marginBottom: 8 }}>
        Learners · no one is ever removed from a session
      </p>
      {/* Read-only on purpose. Allow and Mute both live under the stage now, where the
          trainer is already looking; a second copy down here meant two buttons for the
          same action, and the wrong one being pressed looked like it did nothing. */}
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
