import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, clearSession, saveSession, registerPushToken } from './api';

type Session = { id: string; email: string; isTrainer: boolean } | null;

const Ctx = createContext<{
  session: Session;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}>({
  session: null, loading: true,
  login: async () => {}, signup: async () => {}, logout: async () => {}, refreshMe: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    try {
      const j = await api.me();
      setSession(j.user);
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshMe(); }, [refreshMe]);

  async function finish(access: string, refresh: string) {
    await saveSession(access, refresh);
    await refreshMe();
    registerPushToken().catch(() => {});
  }

  return (
    <Ctx.Provider
      value={{
        session, loading, refreshMe,
        login: async (e, p) => { const j = await api.login(e, p); await finish(j.access, j.refresh); },
        signup: async (e, p) => { const j = await api.signup(e, p); await finish(j.access, j.refresh); },
        logout: async () => { await clearSession(); setSession(null); },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
