import { StyleSheet, Text, View, Pressable, TextInput } from 'react-native';
import { theme } from '../lib/theme';

export const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg, padding: 20 },
  h1: { fontSize: 28, fontWeight: '700', color: theme.mut, marginTop: 8 },
  h1ink: { fontSize: 28, fontWeight: '700', color: theme.ink, marginTop: 8 },
  sub: { fontSize: 15, marginTop: 4, color: theme.ink },
  sec: { fontSize: 20, fontWeight: '700', color: theme.mut, marginTop: 26, marginBottom: 10 },
  card: { borderWidth: 1.5, borderColor: theme.line, borderRadius: theme.radius, backgroundColor: '#fff', padding: 18, marginTop: 12 },
  eyebrow: { fontSize: 12, color: theme.mut, marginBottom: 6 },
  bigtitle: { fontSize: 22, fontWeight: '800', color: theme.ink },
  meta: { fontSize: 14, marginTop: 6, color: theme.ink },
  muted: { fontSize: 13, color: theme.mut },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 },
  btn: { borderWidth: 1.5, borderColor: theme.line, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 18, backgroundColor: '#fff' },
  btnPrimary: { backgroundColor: theme.ink, borderColor: theme.ink },
  btnText: { fontWeight: '600', fontSize: 15, color: theme.ink },
  btnTextPrimary: { color: '#fff' },
  input: { borderWidth: 1.5, borderColor: theme.line, borderRadius: 12, padding: 12, fontSize: 15, marginTop: 4, backgroundColor: '#fff' },
  label: { fontWeight: '600', fontSize: 13, marginTop: 12 },
  logo: { fontWeight: '900', fontSize: 20 },
});

export function Btn({ title, onPress, primary, disabled }: { title: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[s.btn, primary && s.btnPrimary, disabled && { opacity: 0.5 }]}>
      <Text style={[s.btnText, primary && s.btnTextPrimary]}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View>
      <Text style={s.label}>{label}</Text>
      <TextInput style={s.input} autoCapitalize="none" {...props} />
    </View>
  );
}

export function TopBar() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}>
      <Text style={s.logo}>Learnovize</Text>
    </View>
  );
}
