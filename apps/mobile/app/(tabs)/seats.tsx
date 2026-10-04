import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { s, Btn, TopBar } from '../../lib/ui';
import { api, Reg, Progress } from '../../lib/api';
import { useAuth } from '../../lib/auth';

export default function Seats() {
  const { session } = useAuth();
  const [regs, setRegs] = useState<Reg[]>([]);
  const [prog, setProg] = useState<Record<string, Progress>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    api.myRegs()
      .then(async (j) => {
        setRegs(j.registrations);
        for (const r of j.registrations) {
          try {
            const p = await api.progress(r.training.id);
            setProg((prev) => ({ ...prev, [r.training.id]: p }));
          } catch { /* ignore */ }
        }
      })
      .catch((e) => setMsg(e.message));
  }, [session]);
  useFocusEffect(load);

  if (!session) return <View style={s.wrap}><TopBar /><Text style={s.muted}>Log in on the Account tab.</Text></View>;

  return (
    <ScrollView style={{ backgroundColor: '#fff' }} contentContainerStyle={s.wrap}>
      <TopBar />
      <Text style={s.h1}>My seats.</Text>
      {msg && <Text style={{ color: '#8F1D1D' }}>{msg}</Text>}
      {regs.length === 0 && <Text style={s.muted}>No seats yet.</Text>}
      {regs.map((r) => {
        const p = prog[r.training.id];
        return (
          <View key={r.id} style={s.card}>
            <Text style={s.bigtitle}>{r.training.title}</Text>
            {p && (
              <Text style={s.meta}>
                {p.presentCount} sessions · {p.pct}% — need {p.training.minPct}%
                {p.minMet ? ' ✓' : p.atRisk ? ' ⚠ at risk' : ''}
              </Text>
            )}
            <View style={s.row}>
              <Btn
                title="Cancel seat"
                onPress={async () => {
                  try { await api.cancelReg(r.id); load(); } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed'); }
                }}
              />
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}
