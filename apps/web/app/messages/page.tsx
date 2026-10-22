'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch, getAccess } from '@/lib/client-auth';
import SiteNav from '../components/SiteNav';
import Avatar from '../components/Avatar';

type Thread = {
  otherId: string;
  name: string;
  photoUrl: string | null;
  body: string;
  at: string;
  unread: boolean;
  mine: boolean;
};

export default function Messages() {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    const access = getAccess();
    if (!access) return;
    const r = await authFetch('/api/messages', { headers: { authorization: `Bearer ${access}` } });
    if (!r.ok) return;
    const j = await r.json();
    setThreads(j.threads || []);
    setUnread(j.unread || 0);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="wrap">
      <SiteNav />
      <h1>Messages.</h1>
      <p className="sub">
        {unread > 0
          ? `${unread} waiting for you.`
          : 'Your conversations with learners and trainers.'}
      </p>

      <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
        {threads === null && <p className="muted">Loading…</p>}
        {threads?.length === 0 && (
          <p className="muted">
            Nothing yet. A message is a way to ask a trainer a question before you join
            their class.
          </p>
        )}
        {threads?.map((t) => (
          <Link
            key={t.otherId}
            href={`/messages/${t.otherId}`}
            className="card"
            style={{ display: 'flex', gap: 12, alignItems: 'center', textDecoration: 'none', color: 'inherit' }}
          >
            <Avatar name={t.name} photoUrl={t.photoUrl} size={44} seed={t.otherId} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <b style={{ fontSize: 'var(--t-base)' }}>{t.name}</b>
                {t.unread && <span className="badge">New</span>}
                <span className="muted" style={{ fontSize: 'var(--t-xs)', marginLeft: 'auto' }}>
                  {new Date(t.at).toLocaleDateString()}
                </span>
              </div>
              <p
                className="muted"
                style={{
                  margin: '2px 0 0', fontSize: 'var(--t-sm)',
                  fontWeight: t.unread ? 700 : 400,
                }}
              >
                {t.mine ? 'You: ' : ''}{t.body}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
