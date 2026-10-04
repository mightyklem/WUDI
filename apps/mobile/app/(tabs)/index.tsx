import { ScrollView, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { s, Btn, TopBar } from '../../lib/ui';
import { useAuth } from '../../lib/auth';

export default function Home() {
  const { session } = useAuth();
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return (
    <ScrollView style={{ backgroundColor: '#fff' }} contentContainerStyle={s.wrap}>
      <TopBar />
      <Text style={s.h1}>{greet}{session ? `, ${session.email}` : ''}.</Text>
      <Text style={s.sub}>Live trainings with real attendance and verifiable certificates. Attendance is always free.</Text>
      <View style={s.card}>
        <Text style={s.eyebrow}>Up next · live only, no replays</Text>
        <Text style={s.bigtitle}>Find a live training</Text>
        <Text style={s.meta}>Browse the feed, follow trainers, reserve your seat.</Text>
        <View style={s.row}>
          <Link href="/explore" asChild><Btn title="Explore feed" primary onPress={() => {}} /></Link>
        </View>
      </View>
      <Text style={s.sec}>How it works</Text>
      {[
        ['1 · Register free', 'One invite link. Seats close automatically at the cap.'],
        ['2 · Attend live', 'Present means staying 75%+ of the session. Audio-only saves data.'],
        ['3 · Earn a certificate', 'Meet the minimum, get approved, verify online.'],
      ].map(([t, d]) => (
        <View key={t} style={s.card}>
          <Text style={s.eyebrow}>{t.split(' · ')[0]}</Text>
          <Text style={s.bigtitle}>{t.split(' · ')[1]}</Text>
          <Text style={s.meta}>{d}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
