import { useEffect, useState } from 'react';
import { ScrollView, Text, View, Switch } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { LiveKitRoom, useTracks, registerGlobals } from '@livekit/react-native';
import { Track } from 'livekit-client';
import { s, Btn, TopBar } from '../../lib/ui';
import { api } from '../../lib/api';

registerGlobals();

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
    <View>
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

function Room({ url, token, room }: { url: string; token: string; room: string }) {
  // Audio-only by default (cellular-friendly); video is opt-in per session.
  const [audioOnly, setAudioOnly] = useState(true);
  return (
    <LiveKitRoom serverUrl={url} token={token} connect audio video={!audioOnly}>
      <View style={s.row}>
        <Text>Audio-only (saves data)</Text>
        <Switch value={audioOnly} onValueChange={setAudioOnly} />
      </View>
      <Text style={s.muted}>Room: {room}</Text>
      <Tiles audioOnly={audioOnly} />
      <Text style={s.muted}>Chat, polls, raise-hand and moderation ride the web classroom in Phase 3; native controls land with the dev-build milestone.</Text>
    </LiveKitRoom>
  );
}

export default function Classroom() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const [creds, setCreds] = useState<{ token: string; url: string; room: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.sessionToken(sessionId)
      .then((j) => setCreds(j))
      .catch((e) => setErr(e.message));
  }, [sessionId]);

  return (
    <ScrollView style={{ backgroundColor: '#fff' }} contentContainerStyle={s.wrap}>
      <TopBar />
      <Text style={s.h1ink}>Classroom.</Text>
      <Text style={s.muted}>Live only — not recorded.</Text>
      {err && <Text style={{ color: '#8F1D1D' }}>{err}</Text>}
      {!creds && !err && <Text style={s.muted}>Joining…</Text>}
      {creds && <Room url={creds.url} token={creds.token} room={creds.room} />}
      <View style={s.row}>
        <Btn title="Leave" onPress={() => setCreds(null)} />
      </View>
    </ScrollView>
  );
}
