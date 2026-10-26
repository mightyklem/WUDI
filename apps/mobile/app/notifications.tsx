import { useCallback, useState } from 'react';
import { ScrollView, Text, View, TouchableOpacity } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { s, Btn, TopBar } from '../lib/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

type Notification = {
  id: string; type: string; payload: any; readAt: string | null; createdAt: string;
};

export default function Notifications() {
  const { session } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    api.myNotifications()
      .then((j: { notifications: Notification[] }) => setNotifications(j.notifications))
      .catch((e: Error) => setMsg(e instanceof Error ? e.message : 'Failed to load notifications'));
  }, [session]);

  useFocusEffect(load);

  const markRead = useCallback(() => {
    api.markNotificationsRead().then(() => {
      setNotifications(notifications.map((n) => ({ ...n, readAt: new Date().toISOString() })));
    }).catch(() => {});
  }, [notifications]);

  const joinClass = (payload: any) => {
    const sessionId = payload?.sessionId;
    const trainingId = payload?.trainingId;
    if (sessionId) {
      router.push(`/classroom/${sessionId}`);
    } else if (trainingId) {
      router.push(`/training/${trainingId}`);
    }
  };

  if (!session) return <View style={s.wrap}><TopBar /><Text style={s.muted}>Log in on the Account tab.</Text></View>;

  return (
    <ScrollView style={{ backgroundColor: '#fff' }} contentContainerStyle={s.wrap}>
      <TopBar />
      <Text style={s.h1}>Notifications.</Text>
      {msg && <Text style={{ color: '#8F1D1D' }}>{msg}</Text>}
      {notifications.length === 0 && (
        <View style={s.card}><Text style={s.muted}>No notifications yet.</Text></View>
      )}
      {notifications.map((n) => (
        <View key={n.id} style={[s.card, { marginTop: 10 }]}>
          <View style={s.row}>
            <Text style={s.bigtitle}>{n.type === 'registration-confirmed' ? 'Seat reserved' : n.type}</Text>
            <Text style={s.meta}>{new Date(n.createdAt).toLocaleString()}</Text>
          </View>
          <Text style={s.meta}>{n.payload?.title || n.payload?.trainingId || ''}</Text>
          {n.type === 'registration-confirmed' && (
            <View style={s.row}>
              <Btn
                title="Join class now"
                primary
                onPress={() => { markRead(); joinClass(n.payload); }}
              />
            </View>
          )}
        </View>
      ))}
      {notifications.length > 0 && (
        <View style={s.row}><Btn title="Mark all read" onPress={markRead} /></View>
      )}
    </ScrollView>
  );
}
