'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAccess } from '@/lib/client-auth';
import { QuoteStrip } from './QuoteStrip';

type Post = {
  id: string; type: string; mediaUrl: string; likeCount: number;
  liked: boolean; saved: boolean;
  training: {
    id: string; title: string; slug: string; trainer: string; topic: string | null;
    certMode: string; certPriceNgn: number | null; status: string;
    seatsLeft: number; cap: number; seatsTaken: number; firstSession: string | null;
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

  // Distinguish "your filters hid everything" from "the platform is empty".
  const filtered = Boolean(q || topic || cert !== 'any');

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
      <p className="sub">Upcoming live trainings — watch, follow, save, register.</p>

      <QuoteStrip />

      <div className="card" style={{ marginTop: 16 }}>
        <div className="chips" style={{ marginBottom: 12 }}>
          {[
            { v: 'any', label: 'All' },
            { v: 'free', label: 'Free only' },
            { v: 'certified', label: 'Certified' },
          ].map((c) => (
            <button
              key={c.v}
              type="button"
              className={cert === c.v ? 'chip on' : 'chip'}
              onClick={() => { setCert(c.v); setTimeout(load, 0); }}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="btnrow" style={{ marginTop: 0 }}>
          <input type="text" placeholder="Search trainings…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 220 }} />
          <input type="text" placeholder="Topic (e.g. energy)" value={topic} onChange={(e) => setTopic(e.target.value)} style={{ maxWidth: 180 }} />
          <button className="btn primary" onClick={load}>Filter</button>
        </div>
      </div>
      {msg && <div className="okmsg">{msg}</div>}

      {posts !== null && posts.length === 0 && (
        // E1/E3 — a brand-new platform looks identical to "your filters hid everything".
        // Never leave a cold feed as a single dead sentence.
        <div className="card" style={{ marginTop: 16, textAlign: 'center', padding: 34 }}>
          <div style={{ fontSize: 30, marginBottom: 8 }} aria-hidden>◎</div>
          <p style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>
            {filtered ? 'Nothing matches those filters' : 'No sessions announced yet'}
          </p>
          <p className="muted" style={{ margin: '8px auto 0', maxWidth: 460 }}>
            {filtered
              ? 'Try widening your search, or clear the filters to see everything that is live.'
              : 'Trainers are being onboarded now. Follow the ones you like and you will be notified the moment they go live.'}
          </p>
          <div className="btnrow" style={{ justifyContent: 'center' }}>
            {filtered ? (
              <>
                <button className="btn primary" onClick={() => { setQ(''); setTopic(''); setCert('any'); }}>Clear filters</button>
                <button className="btn" onClick={load}>Try again</button>
              </>
            ) : (
              <>
                <Link className="btn primary" href="/trainers">Browse trainers</Link>
                <Link className="btn" href="/onboarding">Become a trainer</Link>
              </>
            )}
          </div>
        </div>
      )}

      <div style={{ marginTop: 18, display: 'grid', gap: 16 }}>
        {posts === null && <p className="muted">Loading feed…</p>}
        {posts?.map((p) => {
          const full = p.training.status === 'full';
          return (
          <div className="card" key={p.id} style={{ padding: 20 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <b>{p.training.trainer}</b>
              {p.training.topic && <span className="badge">{p.training.topic}</span>}
              {full && <span className="badge rev">Full</span>}
            </div>
            <h3 style={{ margin: '10px 0 4px', fontSize: 20, fontWeight: 800 }}>{p.training.title}</h3>
            <p className="muted" style={{ margin: '0 0 14px', fontSize: 14 }}>
              {p.training.firstSession ? new Date(p.training.firstSession).toUTCString().slice(0, 22) : 'Date to be announced'}
              {' · '}
              {p.training.certMode === 'paid'
                ? `Certificate ₦${p.training.certPriceNgn?.toLocaleString('en-NG')}`
                : p.training.certMode === 'free'
                  ? 'Free certificate'
                  : 'Attendance only'}
              {' · '}
              {full ? 'Full' : `${p.training.seatsLeft} seat${p.training.seatsLeft === 1 ? '' : 's'} left`}
            </p>
            {p.type === 'video' ? (
              <video src={p.mediaUrl} controls preload="metadata" style={{ width: '100%', borderRadius: 14, maxHeight: 380 }} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.mediaUrl} alt={p.training.title} style={{ width: '100%', borderRadius: 14 }} loading="lazy" />
            )}
            <div className="btnrow">
              <button className="btn" onClick={async () => { const j = await authed(`/api/posts/${p.id}/like`, { method: 'POST' }); if (j) load(); }}>
                {p.liked ? '♥' : '♡'} {p.likeCount}
              </button>
              <button className="btn" onClick={async () => { const j = await authed(`/api/trainings/${p.training.id}/save`, { method: 'POST' }); if (j) load(); }}>
                {p.saved ? '⧉ Saved' : '⧉ Save'}
              </button>
              <button className="btn primary" disabled={full} onClick={() => register(p.training.id)}>
                {full ? 'Full' : `Register · ${p.training.seatsLeft} left`}
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
          );
        })}
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
