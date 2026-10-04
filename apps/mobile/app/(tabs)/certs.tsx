import { useCallback, useState } from 'react';
import { ScrollView, Text, View, TextInput, Linking } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { s, Btn, TopBar } from '../../lib/ui';
import { api, Cert, VerifyResult } from '../../lib/api';
import { useAuth } from '../../lib/auth';

export default function Certs() {
  const { session } = useAuth();
  const [certs, setCerts] = useState<Cert[]>([]);
  const [num, setNum] = useState('');
  const [res, setRes] = useState<VerifyResult | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    api.myCerts().then((j) => setCerts(j.certificates)).catch(() => {});
  }, [session]);
  useFocusEffect(load);

  if (!session) return <View style={s.wrap}><TopBar /><Text style={s.muted}>Log in on the Account tab.</Text></View>;

  return (
    <ScrollView style={{ backgroundColor: '#fff' }} contentContainerStyle={s.wrap}>
      <TopBar />
      <Text style={s.h1}>Certificates.</Text>
      {certs.map((c) => (
        <View key={c.id} style={s.card}>
          <Text style={s.bigtitle}>{c.training.title}</Text>
          <Text style={s.meta}>{c.number} · {c.training.trainer.displayName}</Text>
          <View style={s.row}>
            <Btn title="Open PDF" onPress={() => Linking.openURL(c.pdfUrl)} />
          </View>
        </View>
      ))}
      {certs.length === 0 && <Text style={s.muted}>None yet.</Text>}
      <Text style={s.sec}>Verify any number</Text>
      <TextInput value={num} onChangeText={setNum} placeholder="LEARNOVIZE-2026-XXXXXX" autoCapitalize="characters" style={s.input} />
      <View style={s.row}>
        <Btn
          title="Check" primary
          onPress={async () => {
            try { setRes(await api.verify(num.trim())); } catch { setRes({ status: 'not-found' }); }
          }}
        />
      </View>
      {res && (
        <View style={s.card}>
          {res.status === 'valid' && <Text>✓ VALID{res.participant ? ` — ${res.participant}` : ''} · {res.training} · {res.trainer}</Text>}
          {res.status === 'revoked' && <Text>REVOKED — no longer valid.</Text>}
          {res.status === 'not-found' && <Text>No certificate with this number.</Text>}
        </View>
      )}
    </ScrollView>
  );
}
