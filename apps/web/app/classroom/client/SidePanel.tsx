'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Room } from 'livekit-client';
import { displayName, initials, type Role } from './model';
import type { useClassroomData, useModeration } from './useClassroom';
import GiveawayPanel from './GiveawayPanel';

type Tab = 'chat' | 'people' | 'polls' | 'giveaway';
type Data = ReturnType<typeof useClassroomData>;
type Mod = ReturnType<typeof useModeration>;

/**
 * One drawer, three tabs -- Meet's pattern rather than a page that scrolls under
 * the video. Everything that used to sit below the stage lives here now, which is
 * what keeps the stage clear.
 *
 * The room data is created once by the parent and passed in. Each tab building its
 * own subscription would give chat, people and polls three disagreeing copies of
 * the same room.
 */
export default function SidePanel({
  room,
  sessionId,
  role,
  myId,
  tab,
  onTab,
  onClose,
  d,
  mod,
}: {
  room: Room;
  sessionId: string;
  role: Role;
  myId: string;
  tab: Tab | null;
  onTab: (t: Tab | null) => void;
  onClose: () => void;
  d: Data;
  mod: Mod;
}) {
  if (!tab) return null;
  return (
    <aside className="croom-side" aria-label="Classroom panel">
      <div className="croom-tabs" role="tablist">
        {(['chat', 'people', 'polls'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            className="croom-tab"
            aria-selected={tab === t}
            onClick={() => onTab(t)}
          >
            {t === 'chat' ? 'Chat' : t === 'people' ? 'People' : t === 'giveaway' ? 'Giveaway' : 'Polls'}
          </button>
        ))}
        <button type="button" className="croom-tab" aria-label="Close panel" onClick={onClose}>
          ✕
        </button>
      </div>
      {tab === 'chat' && <Chat d={d} myId={myId} />}
      {tab === 'people' && <People room={room} role={role} d={d} mod={mod} />}
      {tab === 'polls' && <Polls room={room} role={role} d={d} />}
      {tab === 'giveaway' && (
        <GiveawayPanel sessionId={sessionId} isTrainer={role === 'trainer'} />
      )}
    </aside>
  );
}

/* ------------------------------- chat ------------------------------- */

function Chat({ d, myId }: { d: Data; myId: string }) {
  const [draft, setDraft] = useState('');
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [d.chat.length]);

  const submit = () => {
    const t = draft.trim();
    if (!t) return;
    setDraft('');
    void d.say(t);
  };

  return (
    <div className="croom-panel-body">
      <div className="croom-chat-log" ref={logRef}>
        {d.chat.length === 0 && (
          <p style={{ color: 'var(--croom-dim)', fontSize: 13.5, margin: 0 }}>
            No messages yet. Chat runs on the data channel, so it still works on a weak connection.
          </p>
        )}
        {d.chat.map((c) => {
          const mine = c.from === myId;
          return (
            <div key={c.key} className="croom-msg" data-mine={mine}>
              {!mine && <span className="croom-msg-who">{c.who}</span>}
              <div className="croom-msg-bubble">{c.text}</div>
              <div className="croom-msg-acts">
                {Object.entries(c.reactions).map(([emoji, who]) => (
                  <button
                    key={emoji}
                    type="button"
                    className="croom-chip-btn"
                    aria-label={`${emoji} ${who.length}`}
                    onClick={() => void d.reactTo(c.key, emoji)}
                  >
                    {emoji} {who.length}
                  </button>
                ))}
                {(['👏', '❤️', '💡'] as const).map((e) => (
                  <button
                    key={`add-${e}`}
                    type="button"
                    className="croom-chip-btn"
                    aria-label={`React ${e}`}
                    onClick={() => void d.reactTo(c.key, e)}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="croom-compose">
        <input
          className="croom-input"
          value={draft}
          placeholder="Message everyone…"
          aria-label="Message"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        />
        <button type="button" className="croom-send" onClick={submit}>Send</button>
      </div>
    </div>
  );
}

/* ------------------------------ people ------------------------------ */

function People({ room, role, d, mod }: { room: Room; role: Role; d: Data; mod: Mod }) {
  const canMod = role === 'trainer' || role === 'moderator' || role === 'admin';
  const selfId = room.localParticipant.identity;
  const selfName = displayName({ identity: selfId, name: room.localParticipant.name });

  // Presence, not enrolment. The previous roster listed every registered learner
  // as though they had joined, so an empty room looked full and a real problem --
  // nobody could connect -- looked like a busy class.
  const rows = useMemo(() => {
    const self = {
      key: 'self',
      identity: selfId,
      name: selfName,
      hand: false,
      canSpeak: !!room.localParticipant.permissions?.canPublish,
      isSelf: true,
    };
    const others = d.remotes.map((p) => ({
      key: p.identity,
      identity: p.identity,
      name: displayName(p),
      hand: d.hands.has(p.identity),
      canSpeak: !!p.permissions?.canPublish,
      isSelf: false,
    }));
    return [self, ...others];
  }, [d.remotes, d.hands, room, selfId, selfName]);

  const count = rows.length;

  return (
    <div className="croom-panel-body">
      <p style={{ margin: 0, color: 'var(--croom-dim)', fontSize: 13 }}>
        {count} in the room
      </p>

      {d.admins.length > 0 && (
        <p className="croom-notice">
          🛡 An administrator is observing this session{d.admins.length > 1 ? ` (${d.admins.length})` : ''}.
        </p>
      )}

      {canMod && d.waiting.length > 0 && (
        <>
          <p className="eyebrow" style={{ color: 'var(--croom-dim)' }}>✋ Waiting to speak</p>
          {d.waiting.map((h) => (
            <div key={h.identity} className="croom-person">
              <span className="croom-person-name">
                {room.getParticipantByIdentity(h.identity)
                  ? displayName(room.getParticipantByIdentity(h.identity)!)
                  : h.identity}
              </span>
              <span style={{ flex: 1 }} />
              <button
                type="button"
                className="croom-mini primary"
                disabled={mod.busy}
                onClick={() => void mod.act('allowSpeak', h.identity)}
              >
                Allow
              </button>
            </div>
          ))}
        </>
      )}

      <p className="eyebrow" style={{ color: 'var(--croom-dim)' }}>In the room</p>
      {rows.map((r) => (
        <div key={r.key} className="croom-person">
          <span
            className="croom-avatar"
            style={{ position: 'static', width: 34, height: 34, borderRadius: '50%', fontSize: 13, flex: '0 0 auto' }}
            aria-hidden
          >
            {initials(r.name)}
          </span>
          <span className="croom-person-name">{r.isSelf ? 'You' : r.name}</span>
          <span style={{ flex: 1 }} />
          {r.hand && !r.canSpeak && <span className="croom-person-tag" data-kind="hand">✋ raised</span>}
          {r.canSpeak && <span className="croom-person-tag" data-kind="speaking">can speak</span>}
          {canMod && !r.isSelf && r.canSpeak && (
            <button
              type="button"
              className="croom-mini"
              disabled={mod.busy}
              onClick={() => void mod.act('mute', r.identity)}
            >
              Mute
            </button>
          )}
        </div>
      ))}

      {mod.feedback && (
        <p
          className="croom-notice"
          style={mod.feedback.ok ? undefined : { background: 'rgba(180,85,47,.16)', borderColor: 'rgba(180,85,47,.45)', color: '#ffd9c9' }}
        >
          {mod.feedback.text}
        </p>
      )}
    </div>
  );
}

/* ------------------------------- polls ------------------------------- */

function Polls({ room, role, d }: { room: Room; role: Role; d: Data }) {
  const [q, setQ] = useState('Which topic next?');
  const [opts, setOpts] = useState('Pricing, Wiring, Safety');
  const [err, setErr] = useState<string | null>(null);
  const canMod = role === 'trainer' || role === 'moderator' || role === 'admin';
  const meId = room.localParticipant.identity;
  const iVoted = !!d.poll && d.poll.seen.has(meId);

  const open = () => {
    const options = opts.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 6);
    if (!q.trim() || options.length < 2) {
      setErr('A poll needs a question and at least two options.');
      return;
    }
    setErr(null);
    void d.openPoll(q.trim(), options);
  };

  return (
    <div className="croom-panel-body">
      {d.poll ? (
        <>
          <p style={{ margin: 0, fontWeight: 650 }}>{d.poll.question}</p>
          {d.poll.options.map((o, i) => {
            const v = d.poll!.votes[i] || 0;
            const pct = d.totalVotes ? Math.round((v / d.totalVotes) * 100) : 0;
            const showPct = !d.poll!.open;
            return (
              <button
                key={i}
                type="button"
                className="croom-poll-opt"
                disabled={!d.poll!.open || iVoted}
                onClick={() => void d.vote(i)}
              >
                <span className="croom-poll-fill" style={{ width: showPct ? `${pct}%` : 0 }} />
                <span>
                  <b>{o}</b>
                  {showPct && <em style={{ fontStyle: 'normal', color: 'var(--croom-dim)' }}>{v} · {pct}%</em>}
                </span>
              </button>
            );
          })}
          {d.poll.open && (
            <p style={{ margin: 0, color: 'var(--croom-dim)', fontSize: 12.5 }}>
              {iVoted ? 'You have voted.' : 'Pick one.'} Results stay hidden until the poll closes.
            </p>
          )}
          {canMod && d.poll.open && (
            <button type="button" className="croom-mini primary" onClick={() => void d.closePoll()}>
              Close poll
            </button>
          )}
        </>
      ) : (
        <p style={{ margin: 0, color: 'var(--croom-dim)' }}>No active poll.</p>
      )}

      {canMod && (
        <>
          <p className="eyebrow" style={{ color: 'var(--croom-dim)', marginTop: 8 }}>New poll</p>
          <input
            className="croom-input"
            value={q}
            aria-label="Poll question"
            placeholder="Question"
            onChange={(e) => setQ(e.target.value)}
          />
          <input
            className="croom-input"
            value={opts}
            aria-label="Poll options"
            placeholder="Option A, Option B, Option C"
            onChange={(e) => setOpts(e.target.value)}
          />
          {err && <p style={{ color: '#ffb59b', fontSize: 13, margin: 0 }}>{err}</p>}
          <button type="button" className="croom-send" onClick={open}>Open poll</button>
        </>
      )}
    </div>
  );
}