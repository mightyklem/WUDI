import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { s, Btn, TopBar } from '../../lib/ui';
import { api, TrainingDetail } from '../../lib/api';

export default function Training() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [t, setT] = useState<TrainingDetail | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [reserved, setReserved] = useState(false);
  const router = useRouter();

  useEffect(() => {
    api.training(id).then((j) => setT(j.training)).catch((e) => setMsg(e.message));
  }, [id]);
  if (!t) return <View style={s.wrap}><TopBar /><Text style={s.muted}>{msg || 'Loading…'}</Text></View>;

  const left = t.cap - t.seatsTaken;
  return (
    <ScrollView style={{ backgroundColor: '#fff' }} contentContainerStyle={s.wrap}>
      <TopBar />
      <Text style={s.eyebrow}>{t.trainer.displayName}</Text>
      <Text style={s.h1ink}>{t.title}</Text>
      <Text style={s.meta}>{t.description}</Text>
      <Text style={s.meta}>Attend at least {t.minPct}% to earn your certificate.</Text>
      <View style={s.card}>
        <Text style={s.eyebrow}>{left} / {t.cap} seats left</Text>
        {t.sessions.map((x) => (
          <View key={x.id} style={s.row}>
            <Text style={s.meta}>🗓 {new Date(x.startsAtUtc).toUTCString()}</Text>
            <Link href={`/classroom/${x.id}`} asChild><Btn title="Join" onPress={() => {}} /></Link>
          </View>
        ))}
        <View style={s.row}>
            <Btn
              title={left <= 0 ? 'Full' : reserved ? 'Joined' : 'Reserve seat'}
              primary disabled={left <= 0 || reserved}
              onPress={async () => {
                try {
                  const j = await api.register(t.id) as { registration: { id: string }; already?: boolean };
                  setMsg(j.already ? "You're already in — seat kept!" : 'Seat reserved!');
                  setReserved(true);
                } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed'); }
              }}
            />
            {reserved && (
              <View style={s.row}>
                <Btn title="Join class" onPress={() => router.push(`/classroom/${t.sessions[0]?.id}`)} />
              </View>
            )}
        </View>
        {msg && <Text style={s.muted}>{msg}</Text>}
      </View>
    </ScrollView>
  );
}
