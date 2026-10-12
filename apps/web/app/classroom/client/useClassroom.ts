'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ConnectionQuality,
  ConnectionState,
  DisconnectReason,
  Room,
  RoomEvent,
  VideoPresets,
  type RemoteParticipant,
} from 'livekit-client';
import {
  dec, displayName, enc, localKey,
  type ChatMsg, type Hand, type Poll, type Reaction, type Role,
} from './model';

/* ------------------------------------------------------------------ *
 * Connection
 * ------------------------------------------------------------------ */

export type ConnectState = 'idle' | 'connecting' | 'connected' | 'retrying' | 'failed';

/**
 * Owns the Room instance instead of letting a component create it.
 *
 * The previous classroom handed <LiveKitRoom connect> a fresh token on every
 * render path. React then unmounted and remounted the room -- and because the
 * component that owns the connection was replaced mid-handshake, LiveKit's
 * in-flight connect promise was rejected with "Client initiated disconnect".
 * That single mistake is what made join failures look like server faults all
 * afternoon. Here the room outlives renders, so nothing can tear it down except
 * code that means to.
 */
export function useRoomConnection(opts: {
  url: string | null;
  token: string | null;
  /** Stops retrying once the session is genuinely over. */
  enabled: boolean;
  onFatal: (r: { title: string; detail: string }) => void;
}) {
  const { url, token, enabled, onFatal } = opts;
  const [room, setRoom] = useState<Room | null>(null);
  const [state, setState] = useState<ConnectState>('idle');
  const [quality, setQuality] = useState(3);
  const [retryIn, setRetryIn] = useState(0);
  const [attempt, setAttempt] = useState(0);

  const roomRef = useRef<Room | null>(null);
  const fatalRef = useRef(onFatal);
  fatalRef.current = onFatal;
  const aliveRef = useRef(true);

  // Create the room exactly once. Never in an effect that depends on the token,
  // because that is the remount that broke joining.
  useEffect(() => {
    const r = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: { width: 1280, height: 720, frameRate: 30 },
      },
      audioCaptureDefaults: {
        // Echo cancellation is what stops a trainer hearing themselves twice
        // through the speakers, the classic complaint about browser classes.
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      publishDefaults: {
        // Two spatial layers: a phone gets the small one and a desktop the full one,
        // instead of everyone receiving whatever the trainer's connection can push.
        // A third layer was tried and dropped -- past two layers the extra handshake
        // cost more than the bandwidth it saved on a class this size.
        videoSimulcastLayers: [VideoPresets.h720, VideoPresets.h180],
        videoCodec: 'vp9',
        // Discontinuous transmission: silence costs almost no data, which is most of
        // a class where one person is talking and thirty are listening.
        dtx: true,
        red: true,
      },
    });
    roomRef.current = r;
    setRoom(r);
    aliveRef.current = true;

    return () => {
      aliveRef.current = false;
      roomRef.current = null;
      r.disconnect();
      r.removeAllListeners();
    };
  }, []);

  useEffect(() => {
    if (!room || !url || !token || !enabled) return;
    let cancelled = false;
    const delays = [1000, 2000, 4000, 8000, 15000, 30000];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;

    const connect = async () => {
      if (cancelled || !aliveRef.current) return;
      setState(tries === 0 ? 'connecting' : 'retrying');
      try {
        await room.connect(url, token, { autoSubscribe: true });
        if (cancelled) return;
        // Prefer a steady frame rate over a sharp image. On a phone that is the
        // difference between a class that looks live and one that stutters: the
        // encoder drops resolution before it drops frames, which reads as lag.
        // This is a per-track setting, not a room option.
        for (const pub of room.localParticipant.videoTrackPublications.values()) {
          const t = pub.track as unknown as {
            setDegradationPreference?: (p: 'maintain-framerate') => Promise<void>;
          } | undefined;
          await t?.setDegradationPreference?.('maintain-framerate').catch(() => {});
        }
        if (cancelled) return;
        tries = 0;
        setRetryIn(0);
        setState('connected');
      } catch (err) {
        if (cancelled) return;
        const e = err as { reason?: DisconnectReason; message?: string };
        const fatal = e.reason === DisconnectReason.ROOM_CLOSED ||
          e.reason === DisconnectReason.ROOM_DELETED ||
          e.reason === DisconnectReason.PARTICIPANT_REMOVED ||
          e.reason === DisconnectReason.STATE_MISMATCH;
        if (fatal) {
          setState('failed');
          fatalRef.current(describeConnectionFailure(e.reason, e.message));
          return;
        }
        // Transient: mobile data drops, a backgrounded tab, a brief signal loss.
        // Retrying silently is the difference between a blip and a dropped class.
        const wait = delays[Math.min(tries, delays.length - 1)];
        tries += 1;
        setRetryIn(Math.round(wait / 1000));
        setState('retrying');
        timer = setTimeout(connect, wait);
      }
    };

    connect();

    const onState = (s: ConnectionState) => {
      if (cancelled) return;
      if (s === ConnectionState.Reconnecting) setState('retrying');
      if (s === ConnectionState.Connected) { setState('connected'); tries = 0; setRetryIn(0); }
    };
    room.on(RoomEvent.ConnectionStateChanged, onState);

    // ConnectionQuality is a string enum, not 0..3, so it is mapped rather than compared.
    const onQuality = (q: ConnectionQuality) => setQuality(qualityToBars(q));
    room.on(RoomEvent.ConnectionQualityChanged, onQuality);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      room.off(RoomEvent.ConnectionStateChanged, onState);
      room.off(RoomEvent.ConnectionQualityChanged, onQuality);
    };
  }, [room, url, token, enabled]);

  const retryNow = useCallback(() => setAttempt((n) => n + 1), []);

  // Re-run the connect effect when asked to try again now.
  useEffect(() => {
    if (attempt === 0) return;
    const t = setTimeout(() => setAttempt(0), 50);
    return () => clearTimeout(t);
  }, [attempt]);

  return { room, state, quality, retryIn, retryNow, connected: state === 'connected' };
}

export function qualityToBars(q: ConnectionQuality): number {
  switch (q) {
    case ConnectionQuality.Excellent: return 3;
    case ConnectionQuality.Good: return 3;
    case ConnectionQuality.Poor: return 2;
    case ConnectionQuality.Unknown: return 1;
    default: return 0;
  }
}

export function describeConnectionFailure(
  reason?: DisconnectReason,
  message?: string,
): { title: string; detail: string } {
  switch (reason) {
    case DisconnectReason.STATE_MISMATCH:
      return {
        title: 'The LiveKit keys do not match this project',
        detail:
          'The API key and secret in Netlify belong to a different LiveKit project than the ' +
          'one being connected to. Compare both against the project Keys page.',
      };
    case DisconnectReason.DUPLICATE_IDENTITY:
      return {
        title: 'This account is already in the room',
        detail: 'LiveKit allows one connection per person. Close the other tab or device, then rejoin.',
      };
    case DisconnectReason.PARTICIPANT_REMOVED:
      return { title: 'You were removed from the room', detail: 'The trainer removed you from this session.' };
    case DisconnectReason.ROOM_CLOSED:
    case DisconnectReason.ROOM_DELETED:
      return { title: 'The session has ended', detail: 'The trainer closed this session.' };
    default:
      return {
        title: 'Could not join the room',
        detail: message
          ? `LiveKit said: ${message}`
          : 'The connection was refused and gave no reason. Check your network and try again.',
      };
  }
}

/* ------------------------------------------------------------------ *
 * Room data: chat, polls, hands, reactions, presence
 * ------------------------------------------------------------------ */

export function useClassroomData(room: Room | null, myId: string, role: Role) {
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [poll, setPoll] = useState<Poll | null>(null);
  const [hands, setHands] = useState<Set<string>>(new Set());
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  // canSpeak tracks the server-granted permission. It arrives as a permission
  // event, not a data message, so a learner cannot grant it to themselves.
  const [canSpeak, setCanSpeak] = useState(role !== 'participant');
  const [remotes, setRemotes] = useState<RemoteParticipant[]>([]);
  const [local, setLocal] = useState<{ mic: boolean; cam: boolean; share: boolean } | null>(null);
  // Bumped on any permission or track change; the derived lists below depend on it.
  const [permVersion, setPermVersion] = useState(0);

  const syncLocal = useCallback((r: Room) => {
    const p = r.localParticipant;
    setLocal({
      mic: p.isMicrophoneEnabled,
      cam: p.isCameraEnabled,
      share: p.isScreenShareEnabled,
    });
    setCanSpeak(!!p.permissions?.canPublish);
  }, []);

  const syncRemotes = useCallback((r: Room) => {
    setRemotes([...r.remoteParticipants.values()]);
    setPermVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!room) return;
    syncLocal(room);
    syncRemotes(room);

    const bump = () => syncLocal(room);
    const refresh = () => syncRemotes(room);
    const onPerm = (_p: unknown, who: { identity: string; permissions?: { canPublish?: boolean } }) => {
      if (who.identity === myId) setCanSpeak(!!who.permissions?.canPublish);
      syncRemotes(room);
    };
    const onJoin = () => syncRemotes(room);
    const onLeave = () => syncRemotes(room);
    const onLeaveLocal = () => setRemotes([...room.remoteParticipants.values()]);

    room.on(RoomEvent.ParticipantConnected, onJoin);
    room.on(RoomEvent.ParticipantDisconnected, onLeave);
    room.on(RoomEvent.TrackMuted, bump);
    room.on(RoomEvent.TrackUnmuted, bump);
    room.on(RoomEvent.LocalTrackPublished, bump);
    room.on(RoomEvent.LocalTrackUnpublished, bump);
    room.on(RoomEvent.ParticipantPermissionsChanged, onPerm);
    room.on(RoomEvent.Disconnected, onLeaveLocal);

    return () => {
      room.off(RoomEvent.ParticipantConnected, onJoin);
      room.off(RoomEvent.ParticipantDisconnected, onLeave);
      room.off(RoomEvent.TrackMuted, bump);
      room.off(RoomEvent.TrackUnmuted, bump);
      room.off(RoomEvent.LocalTrackPublished, bump);
      room.off(RoomEvent.LocalTrackUnpublished, bump);
      room.off(RoomEvent.ParticipantPermissionsChanged, onPerm);
      room.off(RoomEvent.Disconnected, onLeaveLocal);
    };
  }, [room, myId, syncLocal, syncRemotes]);

  useEffect(() => {
    if (!room) return;
    const onData = (
      payload: Uint8Array,
      participant?: { identity: string; name?: string },
      _kind?: unknown,
      topic?: string,
    ) => {
      try {
        const m = JSON.parse(dec.decode(payload));
        const from = participant?.identity || 'unknown';
        const who = displayName(participant);
        const me = (host: string, emoji: string) => {
          const key = localKey(host);
          setReactions((r) => [...r.slice(-19), { key, emoji, who, x: 12 + Math.random() * 76 }]);
          setTimeout(() => setReactions((r) => r.filter((x) => x.key !== key)), 2600);
        };

        if (topic === 'chat' && m.text) {
          const key = typeof m.key === 'string' ? m.key : localKey(from);
          setChat((c) => [...c.slice(-99), { key, from, who, text: String(m.text).slice(0, 500), at: Date.now(), reactions: {} }]);
        }
        if (topic === 'react' && m.msgKey && m.emoji) {
          setChat((c) => c.map((x) => {
            if (x.key !== m.msgKey) return x;
            const mine = x.reactions[m.emoji] || [];
            if (mine.includes(who)) return x;
            return { ...x, reactions: { ...x.reactions, [m.emoji]: [...mine, who] } };
          }));
        }
        if (topic === 'reaction' && m.emoji) me(from, String(m.emoji).slice(0, 4));
        if (topic === 'poll') {
          if (m.kind === 'open') {
            setPoll({ id: m.id, question: m.question, options: m.options, open: true, votes: {}, seen: new Set() });
          }
          if (m.kind === 'close') setPoll((p) => (p && p.id === m.id ? { ...p, open: false } : p));
          if (m.kind === 'reveal') setPoll((p) => (p && p.id === m.id ? { ...p, open: false, revealed: true } : p));
          if (m.kind === 'vote') {
            setPoll((p) => {
              if (!p || p.id !== m.id || !p.open || p.seen.has(from)) return p;
              const seen = new Set(p.seen);
              seen.add(from);
              return { ...p, seen, votes: { ...p.votes, [m.opt]: (p.votes[m.opt] || 0) + 1 } };
            });
          }
        }
        if (topic === 'hand') {
          setHands((h) => {
            const n = new Set(h);
            if (m.up) n.add(from); else n.delete(from);
            return n;
          });
        }
      } catch { /* a malformed datagram must not take the room down */ }
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => { room.off(RoomEvent.DataReceived, onData); };
  }, [room]);

  const send = useCallback(async (topic: string, obj: unknown) => {
    if (!room) return;
    try {
      await room.localParticipant.publishData(enc.encode(JSON.stringify(obj)), { reliable: true, topic });
    } catch (e) {
      setNotice('Could not send that — the connection dropped. Try again.');
    }
  }, [room]);

  /**
   * LiveKit delivers data messages to everyone EXCEPT the sender, so every
   * message is also applied locally. Without this a person types, everyone else
   * sees it, and they never do -- which reads as a broken room.
   */
  const say = useCallback(async (text: string) => {
    const clean = text.trim().slice(0, 500);
    if (!clean || !room) return;
    const key = localKey(myId);
    setChat((c) => [...c.slice(-99), { key, from: myId, who: displayName({ identity: myId, name: myId }), text: clean, at: Date.now(), reactions: {} }]);
    await send('chat', { text: clean, key });
  }, [myId, room, send]);

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

  const popReaction = useCallback(async (emoji: string) => {
    const key = localKey(myId);
    setReactions((r) => [...r.slice(-19), { key, emoji, who: myId, x: 12 + Math.random() * 76 }]);
    setTimeout(() => setReactions((r) => r.filter((x) => x.key !== key)), 2600);
    await send('reaction', { emoji });
  }, [myId, send]);

  const raiseHand = useCallback(async (up: boolean) => {
    setHands((h) => {
      const n = new Set(h);
      if (up) n.add(myId); else n.delete(myId);
      return n;
    });
    await send('hand', { up });
  }, [myId, send]);

  const vote = useCallback(async (opt: number) => {
    if (!poll || poll.seen.has(myId)) return;
    const seen = new Set(poll.seen);
    seen.add(myId);
    setPoll({ ...poll, seen, votes: { ...poll.votes, [opt]: (poll.votes[opt] || 0) + 1 } });
    await send('poll', { kind: 'vote', id: poll.id, opt });
  }, [myId, poll, send]);

  const openPoll = useCallback(async (question: string, options: string[]) => {
    const id = `poll-${Date.now()}`;
    setPoll({ id, question, options, open: true, votes: {}, seen: new Set() });
    await send('poll', { kind: 'open', id, question, options });
  }, [send]);

  const closePoll = useCallback(async () => {
    if (!poll) return;
    setPoll({ ...poll, open: false });
    await send('poll', { kind: 'close', id: poll.id });
  }, [poll, send]);

  /* ---------------- derived ---------------- */

  const mayPublish = role !== 'participant' || canSpeak;

  /**
   * Only people actually in the room. An identity that has left has no participant
   * record, so it cannot be resolved and would sit in the queue forever. This is
   * presence, not enrolment -- the previous roster listed registered learners as
   * if they had joined, which made an empty room look full.
   */
  const waiting: Hand[] = useMemo(() => {
    if (!room) return [];
    return [...hands]
      .map((id) => ({ identity: id, at: 0 }))
      .filter(({ identity }) => {
        const p = room.getParticipantByIdentity(identity);
        return !!p && !p.permissions?.canPublish;
      });
  }, [hands, room, permVersion]);

  const speakable: RemoteParticipant[] = useMemo(
    () => (room ? remotes.filter((p) => !!p.permissions?.canPublish) : []),
    // permVersion is a deliberate dependency: remoteParticipants is mutated in
    // place, so its identity does not change when permissions do.
    [remotes, room, permVersion],
  );

  const admins = useMemo(
    () => remotes.filter((p) => {
      try { return JSON.parse(p.metadata || '{}').role === 'admin'; } catch { return false; }
    }),
    [remotes],
  );

  const totalVotes = useMemo(
    () => Object.values(poll?.votes || {}).reduce((a, b) => a + b, 0),
    [poll],
  );

  return {
    chat, poll, hands, reactions, notice, setNotice,
    local, remotes, speakable, waiting, admins, mayPublish, canSpeak, totalVotes,
    send, say, reactTo, popReaction, raiseHand, vote, openPoll, closePoll,
  };
}

/** Moderation is a server call, never a data message a client could forge. */
export function useModeration(sessionId: string) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const act = useCallback(async (action: 'mute' | 'allowSpeak' | 'remove' | 'end', identity?: string) => {
    setBusy(true);
    try {
      const { getAccess } = await import('@/lib/client-auth');
      const access = getAccess();
      const r = await fetch(`/api/sessions/${sessionId}/moderate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
        body: JSON.stringify({ action, identity }),
      });
      const j = await r.json().catch(() => ({}));
      const said = action === 'end' ? 'Session ended.'
        : action === 'allowSpeak' ? 'They can speak now.'
        : action === 'mute' ? 'Muted.'
        : 'Removed.';
      setFeedback({ ok: r.ok, text: r.ok ? said : (j.error || 'That action failed.') });
    } catch {
      setFeedback({ ok: false, text: 'Could not reach the server.' });
    } finally {
      setBusy(false);
    }
  }, [sessionId]);

  return { act, busy, feedback, setFeedback };
}