'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAccess } from '@/lib/client-auth';
import { MOTTO, QuoteStrip } from './QuoteStrip';

type Post = {
  id: string; type: string; mediaUrl: string; likeCount: number;
  liked: boolean; saved: boolean;
  training: {
    id: string; title: string; slug: string; trainer: string; topic: string | null;
    certMode: string; certPriceNgn: number | null; status: string;
    seatsLeft: number; firstSession: string | null;
  };
};

export default function Feed() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [topic, setTopic] = useState('');
  const [cert, setCert] = useState('any');
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  function load() {
    const access = getAccess();
    const sp = new URLSearchParams();
    if (topic) sp.set('topic', topic);
    if (cert !== 'any') sp.set('cert', cert);
    if (q) sp.set('q', q);
    fetch(`/api/feed?${sp.toString()}`, { headers: access ? { authorization: `Bearer ${access}` } : {} })
      .then((r) => r.json())
      .then((j) => setPosts(j.posts || []));
  }
  useEffect(load, []);

  async function authed(path: string, opts: RequestInit = {}) {
    const access = getAccess();
    if (!access) { setMsg('Log in first.'); return null; }
    const r = await fetch(path, { ...opts, headers: { ...(opts.headers || {}), authorization: `Bearer ${access}` } });
    if (!r.ok) setMsg('Action failed.');
    return r.ok ? r.json().catch(() => ({})) : null;
  }

  async function register(trainingId: string) {
    const j = await authed(`/api/trainings/${trainingId}/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ certConsentPublic: true }),
    });
    if (j) { setMsg('Seat reserved!'); load(); }
  }

  return (
    <div className="wrap">
      <div className="topbar"><span className="logo">Learnovize</span>
        <nav><Link className="btn link" href="/">Home</Link><Link className="btn link" href="/me/registrations">My seats</Link></nav>
      </div>
      <h1>Explore.</h1>
      <p className="sub" style={{ fontSize: 16, color: '#1B7E8D', fontWeight: 600 }}>
        {MOTTO}
      </p>
      <p className="sub">Upcoming live trainings — watch, follow, save, register.</p>
      <QuoteStrip />
      <div className="card" style={{ marginTop: 12 }}>
        <div className="btnrow" style={{ marginTop: 0 }}>
          <input type="text" placeholder="Search trainings…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 220 }} />
          <input type="text" placeholder="Topic (e.g. energy)" value={topic} onChange={(e) => setTopic(e.target.value)} style={{ maxWidth: 180 }} />
          <select value={cert} onChange={(e) => setCert(e.target.value)}>
            <option value="any">Free + certified</option>
            <option value="free">Free only</option>
            <option value="certified">Certified</option>
          </select>
          <button className="btn primary" onClick={load}>Filter</button>
        </div>
      </div>
      {msg && <div className="okmsg">{msg}</div>}
      <div style={{ marginTop: 18, display: 'grid', gap: 16 }}>
        {posts === null && <p className="muted">Loading feed…</p>}
        {posts !== null && posts.length === 0 && <p className="muted">Nothing upcoming matches — try clearing filters.</p>}
        {posts?.map((p) => (
          <div className="card" key={p.id}>
            <div className="row" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <b>{p.training.trainer}</b>
              <span className="muted">· {p.training.firstSession ? new Date(p.training.firstSession).toUTCString().slice(0, 16) : ''}</span>
              <span className="muted">· {p.training.certMode === 'none' ? 'Free' : `${p.training.certMode} cert`}</span>
              {p.training.status === 'full' && <span className="badge">FULL</span>}
            </div>
            <h3 style={{ margin: '8px 0' }}>{p.training.title}</h3>
            {p.type === 'video' ? (
              <video src={p.mediaUrl} controls preload="metadata" style={{ width: '100%', borderRadius: 12, maxHeight: 380 }} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.mediaUrl} alt={p.training.title} style={{ width: '100%', borderRadius: 12 }} loading="lazy" />
            )}
            <div className="btnrow">
              <button className="btn" onClick={async () => { const j = await authed(`/api/posts/${p.id}/like`, { method: 'POST' }); if (j) load(); }}>
                {p.liked ? '♥' : '♡'} {p.likeCount}
              </button>
              <button className="btn" onClick={async () => { const j = await authed(`/api/trainings/${p.training.id}/save`, { method: 'POST' }); if (j) load(); }}>
                {p.saved ? '⧉ Saved' : '⧉ Save'}
              </button>
              <button className="btn primary" disabled={p.training.status === 'full'} onClick={() => register(p.training.id)}>
                {p.training.status === 'full' ? 'Full' : `Register · ${p.training.seatsLeft} left`}
              </button>
              <Link className="btn link" href={`/t/${p.training.slug}/register`}>Invite →</Link>
              <button className="btn link" onClick={async () => {
                const reason = prompt('Why are you reporting this post?') || '';
                if (!reason) return;
                await authed('/api/reports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ targetType: 'post', targetId: p.id, reason }) });
                setMsg('Reported — moderators will review.');
              }}>Report</button>
            </div>
          </div>
        ))}
      </div>
      <nav className="bottomnav"><div className="in">
        <Link href="/">🏠<br />Home</Link>
        <Link href="/feed" className="on">◎<br />Explore</Link>
        <Link href="/me/registrations">📚<br />Seats</Link>
        <Link href="/me/certificates">🏅<br />Certs</Link>
      </div></nav>
    </div>
  );
}
