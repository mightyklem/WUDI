import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { s, Btn, Field, TopBar } from '../../lib/ui';
import { useAuth } from '../../lib/auth';
import { api } from '../../lib/api';

export default function Account() {
  const { session, loading, login, signup, logout, refreshMe } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function go(fn: () => Promise<void>) {
    setErr(null); setOk(null);
    try { await fn(); setOk('Done.'); } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); }
  }

  if (loading) return <View style={s.wrap}><Text style={s.muted}>Loading…</Text></View>;

  return (
    <ScrollView style={{ backgroundColor: '#fff' }} contentContainerStyle={s.wrap}>
      <TopBar />
      <Text style={s.h1}>Account.</Text>
      {err && <Text style={{ color: '#8F1D1D', marginTop: 8 }}>{err}</Text>}
      {ok && <Text style={{ color: '#0B1F14', marginTop: 8 }}>{ok}</Text>}
      {!session ? (
        <View>
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
          <Field label="Password (8+ chars)" value={password} onChangeText={setPassword} secureTextEntry />
          <View style={s.row}>
            <Btn title="Log in" primary onPress={() => go(() => login(email, password))} />
            <Btn title="Sign up" onPress={() => go(() => signup(email, password))} />
          </View>
        </View>
      ) : (
        <View>
          <Text style={s.meta}>{session.email}{session.isTrainer ? ' · trainer' : ''}</Text>
          <View style={s.row}><Btn title="Log out" onPress={() => go(logout)} /></View>
          {!session.isTrainer && (
            <View style={s.card}>
              <Text style={s.eyebrow}>Become a trainer</Text>
              <Field label="Display name" value={name} onChangeText={setName} />
              <View style={s.row}>
                <Btn
                  title="Save trainer profile" primary
                  onPress={() => go(async () => {
                    await api.saveTrainerProfile({ displayName: name, bio: '', topics: [] });
                    await refreshMe();
                  })}
                />
              </View>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}
