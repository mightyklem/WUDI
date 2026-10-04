import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

const BASE =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  (Constants.expoConfig?.extra as { backendUrl?: string } | undefined)?.backendUrl ||
  'http://localhost:3000';

async function tokens() {
  const access = await SecureStore.getItemAsync('learnovize_access');
  const refresh = await SecureStore.getItemAsync('learnovize_refresh');
  return { access, refresh };
}

export async function saveSession(access: string, refresh: string) {
  await SecureStore.setItemAsync('learnovize_access', access);
  await SecureStore.setItemAsync('learnovize_refresh', refresh);
}

export async function clearSession() {
  await SecureStore.deleteItemAsync('learnovize_access');
  await SecureStore.deleteItemAsync('learnovize_refresh');
}

async function req(path: string, opts: RequestInit = {}, authed = true): Promise<unknown> {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...((opts.headers as Record<string, string>) || {}) };
  if (authed) {
    const { access } = await tokens();
    if (access) headers.authorization = `Bearer ${access}`;
  }
  const r = await fetch(`${BASE}${path}`, { ...opts, headers });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `Request failed (${r.status})`);
  return j;
}

export const api = {
  base: BASE,
  signup: (email: string, password: string) =>
    req('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password }) }, false) as Promise<{ user: { id: string }; access: string; refresh: string }>,
  login: (email: string, password: string) =>
    req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }, false) as Promise<{ user: { id: string }; access: string; refresh: string }>,
  me: () => req('/api/me') as Promise<{ user: { id: string; email: string; isTrainer: boolean } }>,
  trainers: () => req('/api/trainers', {}, false) as Promise<{ trainers: { userId: string; displayName: string; bio: string | null; topics: string[] }[] }>,
  follow: (id: string) => req(`/api/trainers/${id}/follow`, { method: 'POST' }) as Promise<{ following: boolean }>,
  saveTrainerProfile: (body: { displayName: string; bio: string; topics: string[] }) =>
    req('/api/trainer/profile', { method: 'PUT', body: JSON.stringify(body) }) as Promise<unknown>,
  feed: (q = '') => req(`/api/feed${q}`, {}, false) as Promise<{ posts: FeedPost[] }>,
  like: (id: string) => req(`/api/posts/${id}/like`, { method: 'POST' }) as Promise<{ liked: boolean }>,
  save: (id: string) => req(`/api/trainings/${id}/save`, { method: 'POST' }) as Promise<{ saved: boolean }>,
  training: (id: string) => req(`/api/trainings/${id}`, {}, false) as Promise<{ training: TrainingDetail }>,
  register: (id: string) =>
    req(`/api/trainings/${id}/register`, { method: 'POST', body: JSON.stringify({ certConsentPublic: true }) }) as Promise<{ registration: { id: string } }>,
  myRegs: () => req('/api/me/registrations') as Promise<{ registrations: Reg[] }>,
  cancelReg: (id: string) => req(`/api/registrations/${id}/cancel`, { method: 'POST' }) as Promise<{ ok: boolean }>,
  progress: (trainingId: string) =>
    req(`/api/me/attendance?trainingId=${trainingId}`) as Promise<Progress>,
  myCerts: () => req('/api/certificates/mine') as Promise<{ certificates: Cert[] }>,
  verify: (number: string) => req(`/api/verify/${encodeURIComponent(number)}`, {}, false) as Promise<VerifyResult>,
  sessionToken: (sessionId: string) =>
    req(`/api/sessions/${sessionId}/token`, { method: 'POST' }) as Promise<{ token: string; url: string; room: string; role: string }>,
};

export type FeedPost = {
  id: string; type: string; mediaUrl: string; likeCount: number; liked: boolean; saved: boolean;
  training: {
    id: string; title: string; slug: string; trainer: string; certMode: string;
    status: string; seatsLeft: number; firstSession: string | null;
  };
};

export type TrainingDetail = {
  id: string; slug: string; title: string; description: string | null; topic: string | null;
  format: string; certMode: string; certPriceNgn: number | null; minPct: number;
  cap: number; seatsTaken: number; status: string;
  trainer: { displayName: string };
  sessions: { id: string; startsAtUtc: string; endsAtUtc: string }[];
};

export type Reg = {
  id: string; certPaid: boolean;
  training: { id: string; title: string; certMode: string; certPriceNgn: number | null };
};

export type Progress = {
  presentCount: number; pct: number; remaining: number; atRisk: boolean; minMet: boolean;
  training: { minPct: number; total: number };
};

export type Cert = {
  id: string; number: string; pdfUrl: string;
  training: { title: string; trainer: { displayName: string } };
};

export type VerifyResult =
  | { status: 'valid'; number: string; participant: string | null; training: string; trainer: string; pdfUrl: string }
  | { status: 'revoked'; number: string }
  | { status: 'not-found' };

/** Register this device for push and send the token to the backend (Phase 7 wiring). */
export async function registerPushToken(): Promise<boolean> {
  if (!Device.isDevice || Platform.OS === 'web') return false;
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return false;
  const { access } = await tokens();
  if (!access) return false;
  const expoToken = (await Notifications.getExpoPushTokenAsync()).data;
  await req('/api/me/push-token', {
    method: 'POST',
    body: JSON.stringify({ token: expoToken, platform: Platform.OS }),
  });
  return true;
}
