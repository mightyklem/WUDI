import { useCallback, useState } from 'react';
import { ScrollView, Text, View, Image, useWindowDimensions } from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import { s, Btn, TopBar } from '../../lib/ui';
import { api, FeedPost } from '../../lib/api';

export default function Explore() {
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { width } = useWindowDimensions();

  const load = useCallback(() => {
    api.feed().then((j) => { setPosts(j.posts); setErr(null); }).catch((e) => setErr(e.message));
  }, []);
  useFocusEffect(load);

  async function act(fn: () => Promise<unknown>) {
    try { await fn(); load(); } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); }
  }

  return (
    <ScrollView style={{ backgroundColor: '#fff' }} contentContainerStyle={s.wrap}>
      <TopBar />
      <Text style={s.h1}>Explore.</Text>
      <Text style={s.sub}>Upcoming live trainings.</Text>
      {err && <Text style={{ color: '#8F1D1D', marginTop: 8 }}>{err}</Text>}
      {posts === null && <Text style={s.muted}>Loading… (point the app at your PC's LAN URL, not localhost)</Text>}
      {posts?.map((p) => (
        <View key={p.id} style={s.card}>
          <Text style={s.muted}>{p.training.trainer} · {p.training.certMode === 'none' ? 'Free' : `${p.training.certMode} cert`}</Text>
          <Text style={s.bigtitle}>{p.training.title}</Text>
          {p.type === 'video' ? (
            <Text style={s.muted}>🎬 Video promo — watch on the web feed for now.</Text>
          ) : (
            <Image source={{ uri: p.mediaUrl }} style={{ width: width - 76, height: 220, borderRadius: 12, marginTop: 8 }} resizeMode="cover" />
          )}
          <Text style={s.meta}>{p.training.status === 'full' ? 'FULL' : `${p.training.seatsLeft} seats left`}</Text>
          <View style={s.row}>
            <Btn title={p.liked ? `♥ ${p.likeCount}` : `♡ ${p.likeCount}`} onPress={() => act(() => api.like(p.id))} />
            <Btn title={p.saved ? '⧉ Saved' : '⧉ Save'} onPress={() => act(() => api.save(p.training.id))} />
            <Link href={`/training/${p.training.id}`} asChild><Btn title="Open" primary onPress={() => {}} /></Link>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
