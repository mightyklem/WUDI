'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch, getAccess } from '@/lib/client-auth';
import SiteNav from '../../components/SiteNav';
import Avatar from '../../components/Avatar';

type Msg = { id: string; mine: boolean; body: string; at: string };
type Other = { id: string; fullName: string | null; photoUrl: string | null } | null;

export default function Thread({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
  const [other, setOther] = useState<Other>(null);
  const [messages, setMessages] = useState<Msg[] | null>(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const access = getAccess();
    if (!access) return;
    const r = await authFetch(`/api/messages/${userId}`, {
      headers: { authorization: `Bearer ${access}` },
    });
    if (!r.ok) return;
    const j = await r.json();
    setOther(j.other);
    setMessages(j.messages || []);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setErr(null);
    try {
      const access = getAccess();
      const r = await authFetch(`/api/messages/${userId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
        body: JSON.stringify({ body }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j.error || 'That message could not be sent.');
        return;
      }
      setText('');
      load();
    } finally {
      setBusy(false);
    }
  }

  const name = other?.fullName || 'This person';

  return (
    <div className="wrap">
      <SiteNav />

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
        <Avatar name={other?.fullName} photoUrl={other?.photoUrl} size={44} seed={userId} />
        <div>
          <h1 style={{ margin: 0, fontSize: 'var(--t-xl)' }}>{name}</h1>
          <Link className="btn link" href={`/trainers/${userId}`} style={{ fontSize: 'var(--t-sm)' }}>
            See their profile
          </Link>
        </div>
      </div>

      <div style={{ marginTop: 18, display: 'grid', gap: 10, maxWidth: 640 }}>
        {messages === null && <p className="muted">Loading…</p>}
        {messages?.length === 0 && (
          <p className="muted">No messages yet. Say hello.</p>
        )}
        {messages?.map((m) => (
          <div
            key={m.id}
            style={{
              display: 'flex',
              justifyContent: m.mine ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              className="card"
              style={{
                maxWidth: '86%',
                padding: '12px 14px',
                background: m.mine ? 'var(--accent-soft)' : 'var(--card)',
                borderColor: m.mine ? 'var(--accent-mark)' : 'var(--line)',
              }}
            >
              <p style={{ margin: 0, fontSize: 'var(--t-base)', whiteSpace: 'pre-wrap' }}>{m.body}</p>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: 'var(--t-xs)' }}>
                {new Date(m.at).toLocaleString()}
              </p>
            </div>
          </div>
        ))}
      </div>

      {err && <p className="err" style={{ marginTop: 14 }}>{err}</p>}

      <div style={{ marginTop: 16, maxWidth: 640 }}>
        <label className="fl">Your message</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Ask ${name} something…`}
          rows={3}
          maxLength={2000}
          style={{
            width: '100%', font: 'inherit', fontSize: 'var(--t-base)', color: 'var(--ink)',
            background: 'var(--card)', border: '1px solid var(--line)',
            borderRadius: 'var(--r-sm)', padding: '10px 12px',
          }}
        />
        <div className="btnrow" style={{ marginTop: 10 }}>
          <button className="btn primary" onClick={send} disabled={busy || !text.trim()}>
            {busy ? 'Sending…' : 'Send'}
          </button>
          <span className="muted" style={{ fontSize: 'var(--t-xs)', alignSelf: 'center' }}>
            {text.length}/2000
          </span>
        </div>
      </div>
    </div>
  );
}
