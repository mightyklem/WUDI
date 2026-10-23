import { useEffect, useState, useCallback } from 'react';
import { ScrollView, Text, View, Switch, StyleSheet, Modal, TextInput, TouchableOpacity } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
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
  isLocal: boolean;
};

function Tiles({ audioOnly }: { audioOnly: boolean }) {
  const tracks = useTracks(
    audioOnly
      ? [{ source: Track.Source.Microphone, withPlaceholder: true }]
      : [
          { source: Track.Source.Camera, withPlaceholder: true },
          { source: Track.Source.Microphone, withPlaceholder: true },
        ],
  );
  if (!tracks.length) return <Text style={s.muted}>Waiting for others…</Text>;
  return (
    <View style={style.tileRow}>
      {tracks.map((t, i) => (
        <View key={i} style={[s.card, { backgroundColor: '#0B1F14' }]}>
          <Text style={{ color: '#fff' }}>
            {t.participant.name || t.participant.identity} · {t.source} {t.publication?.kind}
          </Text>
        </View>
      ))}
    </View>
  );
}

function LocalCameraTile({ mirror, onFlip }: { mirror: boolean; onFlip: () => void }) {
  const local = useLocalParticipant();
  const camTrack = local?.cameraTrack;
  if (!camTrack) return null;
  return (
    <View style={style.localTile}>
      <VideoTrack
        trackRef={{ publication: camTrack } as any}
        style={style.localVideo}
        mirror={mirror}
      />
      <TouchableOpacity style={style.flipBtn} onPress={onFlip} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Text style={style.flipText}>⟲</Text>
      </TouchableOpacity>
      <Text style={style.localLabel}>You</Text>
    </View>
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
}: {
  sessionId: string;
  participants: ParticipantView[];
}) {
  const [msg, setMsg] = useState<string | null>(null);

  const mod = useCallback(
    async (action: string, identity: string, source?: 'microphone' | 'camera') => {
      try {
        await api.moderateSession(sessionId, { action, identity, source });
        setMsg(null);
      } catch (e) {
        setMsg(e instanceof Error ? e.message : 'Failed');
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
      {participants.map((p) => (
        <View key={p.identity} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: '#eee' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={s.meta}>{p.name}</Text>
            {p.isLocal && <Text style={{ color: '#666', fontSize: 10 }}> (you)</Text>}
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {p.micTrack ? (
              <Btn
                title={p.micTrack.muted ? 'Unmute mic' : 'Mute mic'}
                onPress={() => {
                  const t = p.micTrack!;
                  mod(t.muted ? 'unmuteMic' : 'muteMic', p.identity);
                }}
                disabled={p.isLocal}
              />
            ) : (
              <Btn title="Grant mic" onPress={() => mod('allowSpeak', p.identity)} disabled={p.isLocal} />
            )}
            {p.camTrack ? (
              <Btn
                title={p.camTrack.muted ? 'Enable cam' : 'Disable cam'}
                onPress={() => {
                  const t = p.camTrack!;
                  mod(t.muted ? 'unmuteCamera' : 'muteCamera', p.identity);
                }}
                disabled={p.isLocal}
              />
            ) : (
              <Btn title="Enable cam" onPress={() => mod('allowSpeak', p.identity)} disabled={p.isLocal} />
            )}
            <Btn title="Ask to speak" onPress={() => request(p.identity)} disabled={p.isLocal} />
          </View>
        </View>
      ))}
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
  onReport,
  reportVisible,
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
  onReport: () => void;
  reportVisible: boolean;
}) {
  // Audio-only by default (cellular-friendly); video is opt-in per session.
  const [audioOnly, setAudioOnly] = useState(true);
  const [mirror, setMirror] = useState(true);
  const livekitRoom = useRoomContext();
  const remote = useParticipants();
  const isTrainerOrMod = role === 'trainer' || role === 'moderator' || role === 'admin';

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
      isLocal: false,
    };
  });

  // Apply the desired screen-share state to the local participant.
  useEffect(() => {
    if (!livekitRoom) return;
    livekitRoom.localParticipant.setScreenShareEnabled(shareOn).catch((e: Error) => {
      // Screen share may not be supported on this device/OS.
      console.error('Screen share failed:', e);
    });
  }, [livekitRoom, shareOn]);

  const dismissRequest = () => {
    onDismiss();
  };

  return (
    <LiveKitRoom serverUrl={url} token={token} connect audio video={!audioOnly}>
      <View style={s.row}>
        <Text>Audio-only (saves data)</Text>
        <Switch value={audioOnly} onValueChange={setAudioOnly} />
      </View>
      <Text style={s.muted}>Room: {room}</Text>

      {/* Main stage: screen share takes precedence when active. */}
      {activeShare ? (
        <ScreenShareView track={activeShare} />
      ) : (
        <View style={style.stage}>
          <LocalCameraTile mirror={mirror} onFlip={() => setMirror((m) => !m)} />
          <Tiles audioOnly={audioOnly} />
        </View>
      )}

      {speechRequest && (
        <SpeechRequestBanner
          sessionId={sessionId}
          requestedBy={speechRequest.requestedBy}
          onUnmute={() => {
            // The local participant unmutes their own mic client-side.
            livekitRoom?.localParticipant.setMicrophoneEnabled(true);
            dismissRequest();
          }}
          onDismiss={dismissRequest}
        />
      )}

      {isTrainerOrMod && <ModerationPanel sessionId={sessionId} participants={participants} />}

      <ReportModal
        visible={reportVisible}
        trainerId={trainerId}
        onDismiss={() => onDismiss()}
        onSent={() => onReport()}
      />

      <Text style={s.muted}>Chat, polls, raise-hand and moderation ride the web classroom in Phase 3; native controls land with the dev-build milestone.</Text>
    </LiveKitRoom>
  );
}

export default function Classroom() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const [creds, setCreds] = useState<{ token: string; url: string; room: string; role: string; trainerId: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [speechRequest, setSpeechRequest] = useState<{ requestedBy: string } | null>(null);
  const [shareOn, setShareOn] = useState(false);
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
    setShareOn((prev) => !prev);
  }, []);

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
          onReport={openReport}
          reportVisible={reportVisible}
        />
      )}
      <View style={s.row}>
        <Btn title={shareOn ? 'Stop share' : 'Share'} onPress={toggleShare} />
        <Btn title="More" onPress={openReport} />
        <Btn title="Leave" onPress={() => setCreds(null)} />
      </View>
    </ScrollView>
  );
}

const style = StyleSheet.create({
  tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 10, paddingVertical: 6 },
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
