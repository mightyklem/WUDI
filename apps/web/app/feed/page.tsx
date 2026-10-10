'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAccess } from '@/lib/client-auth';
import { QuoteStrip } from './QuoteStrip';
import { formatNgn } from '@learnovize/shared';
import { lagosWhenLabel } from '@/lib/lagos';
import SiteNav from '../components/SiteNav';

type Post = {
  id: string; type: string; mediaUrl: string; likeCount: number;
  liked: boolean; saved: boolean;
  kind: string;
  title: string | null;
  body: string | null;
  isAd: boolean;
  adTargetType: string | null;
  isOfficial: boolean;
  organization: { name: string; slug: string; logoUrl: string | null } | null;
  // Null for official content, announcements and ads — those are not classes.
  training: {
    id: string; title: string; slug: string; trainer: string; topic: string | null;
    accessType: string; tier: string | null; pricePerDayNgn: number | null;
    certMode: string; status: string;
    seatsLeft: number; cap: number; seatsTaken: number; firstSession: string | null;
  } | null;
};

export default function Feed() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [topic, setTopic] = useState('');
  const [cert, setCert] = useState('any');
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  // Following used to have no view at all — it only sent an email. Now it filters.
  const [following, setFollowing] = useState(false);
  const [followingEmpty, setFollowingEmpty] = useState(false);

  function load() {
    const access = getAccess();
    const sp = new URLSearchParams();
    if (topic) sp.set('topic', topic);
    if (cert !== 'any') sp.set('cert', cert);
    if (q) sp.set('q', q);
    if (following) sp.set('following', '1');
    fetch(`/api/feed?${sp.toString()}`, { headers: access ? { authorization: `Bearer ${access}` } : {} })
      .then((r) => r.json())
      .then((j) => {
        setPosts(j.posts || []);
        setFollowingEmpty(!!j.followingEmpty);
      })
      .catch(() => setPosts([]));
  }
  useEffect(load, [following]);

  // Distinguish "your filters hid everything" from "the platform is empty".
  const filtered = Boolean(q || topic || cert !== 'any' || following);

  async function authed(path: string, opts: RequestInit = {}) {
    const access = getAccess();
    if (!access) { setMsg('Log in first.'); return null; }
    const r = await fetch(path, { ...opts, headers: { ...(opts.headers || {}), authorization: `Bearer ${access}` } });
    if (!r.ok) setMsg('Action failed.');
    return r.ok ? r.json().catch(() => ({})) : null;
  }

  // Registration moved to /t/[slug]/register, which carries the consent checkbox.
// Nothing on the feed registers directly any more.

  return (
    <div className="wrap">
      <SiteNav />
      <h1>Explore.</h1>
      <p className="sub">Upcoming live trainings — watch, follow, save, register.</p>

      <QuoteStrip />

      <div className="card" style={{ marginTop: 16 }}>
        <div className="btnrow" style={{ marginTop: 0, marginBottom: 12 }}>
          <button
            type="button"
            className={following ? 'btn primary' : 'btn'}
            aria-pressed={following}
            onClick={() => setFollowing((v) => !v)}
          >
            {following ? '✓ Following' : 'Following'}
          </button>
          <Link className="btn" href="/classes">Browse classes</Link>
        </div>
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
          <div style={{ fontSize: 30, marginBottom: 8 }} aria-hidden>{followingEmpty ? '🤝' : '◎'}</div>
          <p style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>
            {followingEmpty
              ? 'You are not following anyone yet'
              : filtered ? 'Nothing matches those filters' : 'No sessions announced yet'}
          </p>
          <p className="muted" style={{ margin: '8px auto 0', maxWidth: 460 }}>
            {followingEmpty
              ? 'Following a trainer puts everything they post and every class they open in this tab. Follow someone to fill it up.'
              : filtered
                ? 'Try widening your search, or clear the filters to see everything that is live.'
                : 'Trainers are being onboarded now. Follow the ones you like and you will be notified the moment they go live.'}
          </p>
          <div className="btnrow" style={{ justifyContent: 'center' }}>
            {followingEmpty ? (
              <>
                <Link className="btn primary" href="/trainers">Browse trainers</Link>
                <button className="btn" onClick={() => setFollowing(false)}>See everything</button>
              </>
            ) : filtered ? (
              <>
                <button className="btn primary" onClick={() => { setQ(''); setTopic(''); setCert('any'); setFollowing(false); }}>Clear filters</button>
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
          const full = p.training?.status === 'full';
          return (
          <div className="card" key={p.id} style={{ padding: 20 }}>
            {p.isOfficial && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                <span className="badge ok">✓ Verified</span>
                {p.kind === 'ad' && <span className="badge">Sponsored</span>}
                {p.organization && <b style={{ fontSize: 14 }}>{p.organization.name}</b>}
              </div>
            )}
            {p.kind !== 'training' && (
              <>
                {p.title && <h3 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800 }}>{p.title}</h3>}
                {p.body && <p className="muted" style={{ margin: '0 0 12px', fontSize: 14 }}>{p.body}</p>}
              </>
            )}
            {/* Official and ad posts are content, not classes — no seat or price row. */}
            {p.training && (
              <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <b>{p.training.trainer}</b>
              {p.training.topic && <span className="badge">{p.training.topic}</span>}
              {full && <span className="badge rev">Full</span>}
            </div>
            <h3 style={{ margin: '10px 0 4px', fontSize: 20, fontWeight: 800 }}>{p.training.title}</h3>
            <p className="muted" style={{ margin: '0 0 14px', fontSize: 14 }}>
              {p.training.firstSession ? lagosWhenLabel(p.training.firstSession) : 'Date to be announced'}
              {' · '}
              {p.training.accessType === 'paid'
                ? `${formatNgn(p.training.pricePerDayNgn ?? 0)}/day`
                : 'Free'}
              {' · '}
              {full ? 'Full' : `${p.training.seatsLeft} seat${p.training.seatsLeft === 1 ? '' : 's'} left`}
            </p>
              </>
            )}
            {p.type === 'video' ? (
              <video src={p.mediaUrl} controls preload="metadata" style={{ width: '100%', borderRadius: 14, maxHeight: 380 }} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.mediaUrl} alt={p.title || p.training?.title || ''} style={{ width: '100%', borderRadius: 14 }} loading="lazy" />
            )}
            {/* Save and Register only make sense for actual classes. */}
            {p.training && (
            <div className="btnrow">
              <button className="btn" onClick={async () => { const j = await authed(`/api/posts/${p.id}/like`, { method: 'POST' }); if (j) load(); }}>
                {p.liked ? '♥' : '♡'} {p.likeCount}
              </button>
              <button className="btn" onClick={async () => { const j = await authed(`/api/trainings/${p.training!.id}/save`, { method: 'POST' }); if (j) load(); }}>
                {p.saved ? '⧉ Saved' : '⧉ Save'}
              </button>
              {/* Sends to the registration page rather than registering inline. This button used
                  to POST certConsentPublic:true straight from the feed, publishing
                  everyone who tapped it with no consent shown. The register page
                  carries the day picker, the price and the consent checkbox. */}
              <Link className="btn primary" href={`/t/${p.training!.slug}/register`}>
                {full ? 'Full' : `Register · ${p.training!.seatsLeft} left`}
              </Link>
              <Link className="btn link" href={`/t/${p.training!.slug}/register`}>Details →</Link>
            </div>
            )}
            <div className="btnrow">
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
