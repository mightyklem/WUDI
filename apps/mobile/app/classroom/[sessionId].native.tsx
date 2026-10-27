import { useEffect, useState, useCallback } from 'react';
import { ScrollView, Text, View, StyleSheet, Modal, TextInput, TouchableOpacity } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Constants from 'expo-constants';
import {
  LiveKitRoom,
  useTracks,
  useParticipants,
  useLocalParticipant,
  useRoomContext,
  VideoTrack,
  registerGlobals,
} from '@livekit/react-native';
import { Track } from 'livekit-client';
import { s, Btn, TopBar } from '../../lib/ui';
import { api } from '../../lib/api';

registerGlobals();

type ParticipantView = {
  identity: string;
  name: string;
  micTrack: { sid: string; muted: boolean } | null;
  camTrack: { sid: string; muted: boolean } | null;
  /** Raw camera publication, for pinning to stage. */
  camPub: any | null;
  isLocal: boolean;
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** The room as faces, not log lines: live video where there is any, an
    initialled tile where there is only audio. Tapping a tile pins it. */
function Tiles({
  participants,
  pinnedId,
  onPin,
}: {
  participants: ParticipantView[];
  pinnedId: string | null;
  onPin: (identity: string | null) => void;
}) {
  if (!participants.length) return <Text style={s.muted}>Waiting for others…</Text>;
  return (
    <View style={style.tileRow}>
      {participants.map((p) => {
        const pinned = pinnedId === p.identity;
        const live = p.camPub && !p.camTrack?.muted;
        return (
          <TouchableOpacity
            key={p.identity}
            style={[style.tile, pinned && style.tilePinned]}
            onPress={() => onPin(pinned ? null : p.identity)}
            disabled={!p.camPub}
            accessibilityLabel={pinned ? `Unpin ${p.name}` : `Pin ${p.name} to stage`}
          >
            {live ? (
              <VideoTrack trackRef={{ publication: p.camPub } as any} style={style.tileVideo} />
            ) : (
              <View style={style.tileAvatar}>
                <Text style={style.tileInitials}>{initialsOf(p.name)}</Text>
              </View>
            )}
            <Text style={style.tileName} numberOfLines={1}>
              {p.micTrack?.muted ? '🔇 ' : ''}{p.name}{pinned ? ' 📌' : ''}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function LocalCameraTile() {
  const local = useLocalParticipant();
  const camTrack = local?.cameraTrack;
  // Front camera by default, preview mirrored like any selfie app. The flip
  // button switches the physical camera and follows with the mirror, so the
  // back camera shows the room as the room sees itself.
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [flipping, setFlipping] = useState(false);
  if (!camTrack) return null;

  const flip = async () => {
    const track = (camTrack as any)?.track;
    if (!track?.restartTrack || flipping) return;
    const next = facing === 'user' ? 'environment' : 'user';
    setFlipping(true);
    try {
      await track.restartTrack({ facingMode: next });
      setFacing(next);
    } catch {
      // Device refused (e.g. single-camera phone): stay where we are.
    } finally {
      setFlipping(false);
    }
  };

  return (
    <View style={style.localTile}>
      <VideoTrack
        trackRef={{ publication: camTrack } as any}
        style={style.localVideo}
        mirror={facing === 'user'}
      />
      <TouchableOpacity
        style={style.flipBtn}
        onPress={flip}
        disabled={flipping}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityLabel="Switch camera"
      >
        <Text style={style.flipText}>{flipping ? '…' : '⟲'}</Text>
      </TouchableOpacity>
      <Text style={style.localLabel}>You</Text>
    </View>
  );
}

/** Lagos wall-clock "9:00 AM" from a UTC instant. Lagos is UTC+1 all year. */
function lagosClock(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 3600000);
  const h24 = d.getUTCHours();
  const m = d.getUTCMinutes();
  const suffix = h24 < 12 ? 'AM' : 'PM';
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** The room at a glance: what, whose, when, and who is here. */
function RoomHeader({
  title,
  trainerName,
  startsAtUtc,
  endsAtUtc,
  count,
}: {
  title: string;
  trainerName: string;
  startsAtUtc: string;
  endsAtUtc: string;
  count: number;
}) {
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={[s.bigtitle, { flex: 1 }]} numberOfLines={2}>{title}</Text>
        <View style={{ backgroundColor: '#0E7A3D', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 12, marginLeft: 8 }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>● Live</Text>
        </View>
      </View>
      <Text style={{ fontSize: 13, color: '#5C5C5C', marginTop: 2 }}>
        {trainerName} · {lagosClock(startsAtUtc)} – {lagosClock(endsAtUtc)} WAT · {count} in room
      </Text>
    </View>
  );
}

/** Labeled control buttons, one thumb's reach. Icon over label, like the
    platforms people already know — no guessing what a lone glyph does. */
function ControlBtn({
  glyph,
  label,
  onPress,
  on = false,
  danger = false,
  disabled = false,
}: {
  glyph: string;
  label: string;
  onPress: () => void;
  on?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 60,
        paddingVertical: 8,
        paddingHorizontal: 6,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: danger ? '#E5484D' : '#E6E6E2',
        backgroundColor: danger ? '#E5484D' : on ? '#0B1F14' : '#fff',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ fontSize: 20, color: danger || on ? '#fff' : '#121212' }}>{glyph}</Text>
      <Text style={{ fontSize: 11, marginTop: 2, color: danger || on ? '#fff' : '#121212' }}>{label}</Text>
    </TouchableOpacity>
  );
}

function ScreenShareView({ track }: { track: any }) {
  return (
    <View style={style.shareContainer}>
      <VideoTrack
        trackRef={{ publication: track } as any}
        style={style.shareVideo}
      />
      <Text style={style.shareLabel}>Screen sharing</Text>
    </View>
  );
}

function ModerationPanel({
  sessionId,
  participants,
  pinnedId,
  onPin,
}: {
  sessionId: string;
  participants: ParticipantView[];
  pinnedId: string | null;
  onPin: (identity: string | null) => void;
}) {
  const [msg, setMsg] = useState<string | null>(null);

  // The server answers 409 "has no microphone/camera track" when the learner
  // was granted speech but hasn't switched the device on yet. That is a
  // waiting state, not a failure — say so instead of printing the raw error.
  const friendly = (e: unknown, identity: string): string => {
    const raw = e instanceof Error ? e.message : String(e);
    const m = /has no (microphone|camera) track/.exec(raw);
    if (m) return `${identity} hasn't switched their ${m[1]} on yet — ask them to speak first.`;
    if (/no longer in the room/i.test(raw)) return `${identity} is no longer in the room.`;
    return raw || 'Failed';
  };

  const mod = useCallback(
    async (action: string, identity: string, source?: 'microphone' | 'camera') => {
      try {
        await api.moderateSession(sessionId, { action, identity, source });
        setMsg(null);
      } catch (e) {
        setMsg(friendly(e, identity));
      }
    },
    [sessionId],
  );

  const request = useCallback(
    async (identity: string) => {
      try {
        await api.requestSpeak(sessionId, identity);
        setMsg(null);
      } catch (e) {
        setMsg(e instanceof Error ? e.message : 'Failed');
      }
    },
    [sessionId],
  );

  return (
    <View style={s.card}>
      <Text style={s.sec}>Participants.</Text>
      {msg && <Text style={{ color: '#8F1D1D', marginBottom: 6 }}>{msg}</Text>}
      {participants.length === 0 && <Text style={s.muted}>No one else in the room.</Text>}
      {participants.map((p) => {
        const pinned = pinnedId === p.identity;
        return (
          <View key={p.identity} style={{ paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#eee' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={s.meta}>{p.name}</Text>
                {p.isLocal && <Text style={{ color: '#666', fontSize: 10 }}> (you)</Text>}
              </View>
              <Btn
                title={pinned ? 'Unpin' : 'Pin'}
                onPress={() => onPin(pinned ? null : p.identity)}
                disabled={p.isLocal || !p.camTrack}
              />
            </View>
            {/* One toggle per device, full stop. Mic and camera are silenced
                independently after speech is granted; there is no separate
                all-or-nothing mute here because that is what kept revoking the
                grant people had just been given. */}
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {p.micTrack ? (
                <Btn
                  title={p.micTrack.muted ? 'Unmute mic' : 'Mute mic'}
                  onPress={() => {
                    const t = p.micTrack!;
                    mod(t.muted ? 'unmuteMic' : 'muteMic', p.identity, 'microphone');
                  }}
                  disabled={p.isLocal}
                />
              ) : (
                <Btn title="Grant speech" onPress={() => mod('allowSpeak', p.identity)} disabled={p.isLocal} />
              )}
              {p.camTrack && (
                <Btn
                  title={p.camTrack.muted ? 'Unmute cam' : 'Mute cam'}
                  onPress={() => {
                    const t = p.camTrack!;
                    mod(t.muted ? 'unmuteCamera' : 'muteCamera', p.identity, 'camera');
                  }}
                  disabled={p.isLocal}
                />
              )}
              <Btn title="Ask to speak" onPress={() => request(p.identity)} disabled={p.isLocal} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function SpeechRequestBanner({
  sessionId,
  requestedBy,
  onUnmute,
  onDismiss,
}: {
  sessionId: string;
  requestedBy: string;
  onUnmute: () => void;
  onDismiss: () => void;
}) {
  return (
    <View style={[s.card, { backgroundColor: '#FFF3CD', borderColor: '#FFE08A' }]}>
      <Text style={{ color: '#856404', fontWeight: '600' }}>
        {requestedBy} wants you to speak
      </Text>
      <Text style={{ color: '#856404', fontSize: 13, marginTop: 4 }}>
        Your mic is off. Tap below to unmute and join the conversation.
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <Btn title="Unmute now" primary onPress={onUnmute} />
        <Btn title="Dismiss" onPress={onDismiss} />
      </View>
    </View>
  );
}

function ReportModal({
  visible,
  trainerId,
  onDismiss,
  onSent,
}: {
  visible: boolean;
  trainerId: string;
  onDismiss: () => void;
  onSent: () => void;
}) {
  const [type, setType] = useState<'problem' | 'abuse'>('problem');
  const [reason, setReason] = useState('');

  const submit = async () => {
    try {
      await api.report({
        targetType: 'trainer',
        targetId: trainerId,
        reason: `${type === 'abuse' ? 'Report abuse: ' : 'Report a problem: '}${reason.trim()}`,
      });
      setReason('');
      onSent();
    } catch {
      // swallow
    }
  };

  return (
    <Modal visible={visible} transparent={true} onRequestClose={onDismiss}>
      <View style={style.modalBackdrop} onTouchEnd={onDismiss}>
        <View style={style.modalCard} onTouchEnd={() => {}}>
          <Text style={s.sec}>Report</Text>
          <View style={style.typeRow}>
            <TouchableOpacity
              style={[s.btn, type === 'problem' && s.btnPrimary]}
              onPress={() => setType('problem')}
            >
              <Text style={[s.btnText, type === 'problem' && s.btnTextPrimary]}>Report a problem</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btn, type === 'abuse' && s.btnPrimary]}
              onPress={() => setType('abuse')}
            >
              <Text style={[s.btnText, type === 'abuse' && s.btnTextPrimary]}>Report abuse</Text>
            </TouchableOpacity>
          </View>
          <Field label="Details" value={reason} onChangeText={setReason} />
          <View style={s.row}>
            <Btn title="Cancel" onPress={onDismiss} />
            <Btn title="Send report" primary disabled={!reason.trim()} onPress={submit} />
          </View>
          <TouchableOpacity style={style.closeBtn} onPress={onDismiss}>
            <Text style={style.closeText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function Field({ label, value, onChangeText }: { label: string; value: string; onChangeText: (t: string) => void }) {
  return (
    <View style={style.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChangeText}
        multiline
        numberOfLines={4}
      />
    </View>
  );
}

function Room({
  url,
  token,
  room,
  role,
  sessionId,
  trainerId,
  speechRequest,
  onUnmute,
  onDismiss,
  onShareToggle,
  shareOn,
  onShareFailed,
  onReport,
  reportVisible,
  onLeave,
  trainingTitle,
  trainerName,
  startsAtUtc,
  endsAtUtc,
}: {
  url: string;
  token: string;
  room: string;
  role: string;
  sessionId: string;
  trainerId: string;
  speechRequest: { requestedBy: string } | null;
  onUnmute: () => void;
  onDismiss: () => void;
  onShareToggle: () => void;
  shareOn: boolean;
  onShareFailed: () => void;
  onReport: () => void;
  reportVisible: boolean;
  onLeave: () => void;
  trainingTitle: string;
  trainerName: string;
  startsAtUtc: string;
  endsAtUtc: string;
}) {
  // Audio-only by default (cellular-friendly); the Camera button below is the
  // real switch and it calls setCameraEnabled, so the two can never disagree.
  const [camOn, setCamOn] = useState(false);
  const [micOn, setMicOn] = useState(role !== 'participant');
  const [peopleOpen, setPeopleOpen] = useState(role === 'trainer' || role === 'moderator' || role === 'admin');
  const livekitRoom = useRoomContext();
  const remote = useParticipants();
  const isTrainerOrMod = role === 'trainer' || role === 'moderator' || role === 'admin';
  // Who the trainer pinned to the stage. Local decision, instant, reversible.
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [shareErr, setShareErr] = useState<string | null>(null);

  // Screen share tracks published by any participant (including local).
  const shareTracks = useTracks([{ source: Track.Source.ScreenShare, withPlaceholder: false }]);
  const activeShare = shareTracks[0] ?? null;

  // Build participant view models from remote participants' published tracks.
  const participants: ParticipantView[] = (remote as any[]).map((p) => {
    const tracks = p.tracks || [];
    const mic = tracks.find((t: any) => t.source === Track.Source.Microphone);
    const cam = tracks.find((t: any) => t.source === Track.Source.Camera);
    return {
      identity: p.identity,
      name: p.name || p.identity,
      micTrack: mic ? { sid: mic.sid, muted: mic.isMuted ?? false } : null,
      camTrack: cam ? { sid: cam.sid, muted: cam.isMuted ?? false } : null,
      camPub: cam ?? null,
      isLocal: false,
    };
  });

  // A pin that outlives its track is a pin on nothing: clear it.
  const pinned = participants.find((p) => p.identity === pinnedId && p.camPub && !p.camTrack?.muted) ?? null;

  // Apply the desired screen-share state to the local participant. Failures
  // surface in the room (not the console): on a phone this is usually the OS
  // refusing capture — Expo Go can't do it at all, and iOS needs a broadcast
  // extension that only ships in a store build.
  useEffect(() => {
    if (!livekitRoom) return;
    if (!shareOn) {
      setShareErr(null);
      return;
    }
    livekitRoom.localParticipant.setScreenShareEnabled(true).catch((e: Error) => {
      setShareErr(e instanceof Error ? e.message : 'Screen share is not available on this device.');
      onShareFailed();
    });
  }, [livekitRoom, shareOn]);

  const dismissRequest = () => {
    onDismiss();
  };

  const toggleMic = useCallback(async () => {
    const next = !micOn;
    setMicOn(next);
    try {
      await livekitRoom?.localParticipant.setMicrophoneEnabled(next);
    } catch {
      setMicOn(!next);
    }
  }, [livekitRoom, micOn]);

  const toggleCam = useCallback(async () => {
    const next = !camOn;
    setCamOn(next);
    try {
      await livekitRoom?.localParticipant.setCameraEnabled(next);
    } catch {
      setCamOn(!next);
    }
  }, [livekitRoom, camOn]);

  return (
    <LiveKitRoom serverUrl={url} token={token} connect audio video={false}>
      <RoomHeader
        title={trainingTitle}
        trainerName={trainerName}
        startsAtUtc={startsAtUtc}
        endsAtUtc={endsAtUtc}
        count={remote.length + 1}
      />

      {/* Main stage: screen share first, then the trainer's pin, then the room. */}
      {activeShare ? (
        <ScreenShareView track={activeShare} />
      ) : pinned ? (
        <View style={style.shareContainer}>
          <VideoTrack
            trackRef={{ publication: pinned.camPub } as any}
            style={style.shareVideo}
          />
          <Text style={style.shareLabel}>📌 {pinned.name}</Text>
        </View>
      ) : (
        <View style={style.stage}>
          {camOn && <LocalCameraTile />}
          <Tiles participants={participants} pinnedId={pinnedId} onPin={setPinnedId} />
        </View>
      )}
      {shareErr && <Text style={{ color: '#8F1D1D', marginTop: 6 }}>{shareErr}</Text>}

      {speechRequest && (
        <SpeechRequestBanner
          sessionId={sessionId}
          requestedBy={speechRequest.requestedBy}
          onUnmute={() => {
            // The local participant unmutes their own mic client-side.
            livekitRoom?.localParticipant.setMicrophoneEnabled(true);
            setMicOn(true);
            dismissRequest();
          }}
          onDismiss={dismissRequest}
        />
      )}

      {/* Labeled controls, one thumb's reach. */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <ControlBtn glyph={micOn ? '🎙' : '🔇'} label={micOn ? 'Mute' : 'Unmute'} on={micOn} onPress={toggleMic} />
        <ControlBtn glyph="📷" label="Camera" on={camOn} onPress={toggleCam} />
        <ControlBtn glyph="🖥" label={shareOn ? 'Stop' : 'Share'} on={shareOn} onPress={onShareToggle} />
        {isTrainerOrMod && (
          <ControlBtn glyph="👥" label="People" on={peopleOpen} onPress={() => setPeopleOpen((v) => !v)} />
        )}
        <ControlBtn glyph="⋯" label="More" onPress={onReport} />
        <ControlBtn glyph="⏻" label="Leave" danger onPress={onLeave} />
      </View>

      {isTrainerOrMod && peopleOpen && (
        <ModerationPanel sessionId={sessionId} participants={participants} pinnedId={pinnedId} onPin={setPinnedId} />
      )}

      <ReportModal
        visible={reportVisible}
        trainerId={trainerId}
        onDismiss={() => onDismiss()}
        onSent={() => onReport()}
      />
    </LiveKitRoom>
  );
}

export default function Classroom() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const [creds, setCreds] = useState<{
    token: string; url: string; room: string; role: string; trainerId: string;
    trainingTitle: string; trainerName: string; startsAtUtc: string; endsAtUtc: string;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [speechRequest, setSpeechRequest] = useState<{ requestedBy: string } | null>(null);
  const [shareOn, setShareOn] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [reportVisible, setReportVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.sessionToken(sessionId)
      .then(async (j) => {
        if (cancelled) return;
        setCreds(j);
        // Check for an unread speech request for this session.
        try {
          const notes = await api.myNotifications();
          const req = notes.notifications.find(
            (n) => n.type === 'speech-requested' && !n.readAt && n.payload?.sessionId === sessionId,
          );
          if (req) {
            setSpeechRequest({ requestedBy: req.payload?.requestedBy || 'The trainer' });
          }
        } catch { /* notifications optional */ }
      })
      .catch((e) => setErr(e.message));
    return () => { cancelled = true; };
  }, [sessionId]);

  const toggleShare = useCallback(async () => {
    // Expo Go has no screen-capture module at all; the button would only ever
    // fail. Say so up front instead of after a spinner. (iOS store builds need
    // a broadcast extension; Android dev builds work out of the box.)
    if (!shareOn && Constants.appOwnership === 'expo') {
      setShareNote('Screen share needs the Learnovize app build — Expo Go cannot capture the screen.');
      return;
    }
    setShareNote(null);
    setShareOn((prev) => !prev);
  }, [shareOn]);

  const openReport = () => setReportVisible(true);

  return (
    <ScrollView style={{ backgroundColor: '#fff' }} contentContainerStyle={s.wrap}>
      <TopBar />
      <Text style={s.h1ink}>Classroom.</Text>
      <Text style={s.muted}>Live only — not recorded.</Text>
      {err && <Text style={{ color: '#8F1D1D' }}>{err}</Text>}
      {!creds && !err && <Text style={s.muted}>Joining…</Text>}
      {creds && (
        <Room
          url={creds.url}
          token={creds.token}
          room={creds.room}
          role={creds.role}
          trainerId={creds.trainerId}
          sessionId={sessionId}
          speechRequest={speechRequest}
          onUnmute={() => setSpeechRequest(null)}
          onDismiss={() => setSpeechRequest(null)}
          onShareToggle={toggleShare}
          shareOn={shareOn}
          onShareFailed={() => setShareOn(false)}
          onReport={openReport}
          reportVisible={reportVisible}
          onLeave={() => setCreds(null)}
          trainingTitle={creds.trainingTitle}
          trainerName={creds.trainerName}
          startsAtUtc={creds.startsAtUtc}
          endsAtUtc={creds.endsAtUtc}
        />
      )}
      {shareNote && <Text style={{ color: '#8F1D1D', marginTop: 6 }}>{shareNote}</Text>}
    </ScrollView>
  );
}

const style = StyleSheet.create({
  tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 10, paddingVertical: 6 },
  tile: { width: '48%', aspectRatio: 0.75, backgroundColor: '#0B1F14', borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  tilePinned: { borderColor: '#FFB020' },
  tileVideo: { width: '100%', height: '100%' },
  tileAvatar: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0E7A3D' },
  tileInitials: { color: '#fff', fontSize: 28, fontWeight: '800' },
  tileName: { position: 'absolute', top: 6, left: 6, right: 6, color: '#fff', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, fontSize: 12, overflow: 'hidden' },
  stage: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  localTile: { position: 'absolute', bottom: 80, right: 16, width: 140, height: 180, backgroundColor: '#000', borderRadius: 12, overflow: 'hidden' },
  localVideo: { width: '100%', height: '100%' },
  flipBtn: { position: 'absolute', top: 6, right: 6, width: 28, height: 28, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  flipText: { fontSize: 16, color: '#333' },
  localLabel: { position: 'absolute', bottom: 6, left: 6, color: '#fff', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4, fontSize: 12 },
  shareContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  shareVideo: { flex: 1 },
  shareLabel: { position: 'absolute', bottom: 12, left: 12, color: '#fff', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { width: '88%', backgroundColor: '#fff', borderRadius: 12, padding: 18, elevation: 4 },
  closeBtn: { position: 'absolute', top: 10, right: 10, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 20, color: '#666' },
  field: { marginTop: 12 },
  typeRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
});
