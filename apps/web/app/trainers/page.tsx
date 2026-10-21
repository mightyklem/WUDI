'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch, getAccess } from '@/lib/client-auth';
import { SkeletonCard } from '../components/Skeleton';
import SiteNav from '../components/SiteNav';
import VerifiedBadge from '../components/VerifiedBadge';

type Trainer = {
  userId: string; displayName: string; bio: string | null; topics: string[];
  badge: { verified: boolean; expired?: boolean; label: string | null; rating?: string | null };
  reviewAverage: number | null; reviewCount: number;
};

export default function Trainers() {
  // null means loading, [] means genuinely no trainers. Initialised to [] the page rendered
  // "No trainers yet" the instant it mounted, then replaced it with the real list a moment
  // later -- so every visit flashed an empty state at somebody who does have trainers.
  const [trainers, setTrainers] = useState<Trainer[] | null>(null);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    authFetch('/api/trainers').then((r) => r.json()).then((j) => setTrainers(j.trainers || []));
  }, []);

  // Filtered on the client, because the whole list is already here and a round trip per
  // keystroke would make typing feel worse, not better. It also searches the topics, because
  // somebody looking for a solar installer is searching for "solar", not for a name.
  const term = q.trim().toLowerCase();
  const shown = (trainers ?? []).filter((t) => {
    if (!term) return true;
    return (
      t.displayName.toLowerCase().includes(term) ||
      (t.bio || '').toLowerCase().includes(term) ||
      t.topics.some((x) => x.toLowerCase().includes(term))
    );
  });

  async function follow(id: string) {
    const access = getAccess();
    if (!access) return setMsg('Log in first to follow trainers.');
    const r = await authFetch(`/api/trainers/${id}/follow`, {
      method: 'POST', headers: { authorization: `Bearer ${access}` },
    });
    if (!r.ok) return setMsg('Follow failed.');
    setFollowing(new Set(following).add(id));
  }

  return (
    <div className="wrap">
      <SiteNav />
      <h1>Trainers.</h1>
      <p className="sub">Follow trainers to hear about new trainings first.</p>
      {msg && <div className="err">{msg}</div>}

      {/* Search. The list is already on the page, so it filters locally and instantly. */}
      <div style={{ marginTop: 16, position: 'relative', maxWidth: 460 }}>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, topic or bio"
          aria-label="Search trainers"
          style={{ width: '100%', padding: '13px 44px 13px 14px', borderRadius: 12, border: '1px solid var(--line)', background: '#fff', fontSize: 'var(--t-base)' }}
        />
        {q && (
          <button
            type="button"
            className="btn link"
            onClick={() => setQ('')}
            aria-label="Clear search"
            style={{ position: 'absolute', right: 4, top: 2, minHeight: 44, padding: '0 10px' }}
          >✕</button>
        )}
      </div>

      <div className="grid2" style={{ marginTop: 18 }}>
        {/* Loading. Skeleton cards the same shape as the .course they stand in for, so the
            page does not reflow when the real ones arrive. */}
        {trainers === null && (
          <>
            <SkeletonCard height={148} />
            <SkeletonCard height={148} />
            <SkeletonCard height={148} />
            <SkeletonCard height={148} />
          </>
        )}
        {trainers !== null && trainers.length === 0 && (
          <div className="course"><span className="status">Empty</span><span className="ctitle">No trainers yet</span>
          <span className="cmeta">Be the first — complete your profile.</span>
          <span className="cfoot"><Link href="/onboarding">Become a trainer →</Link></span></div>
        )}
        {/* A search that matched nothing says so, rather than showing an empty grid that
            looks like the page failed to load. */}
        {trainers !== null && trainers.length > 0 && shown.length === 0 && (
          <div className="course"><span className="status">No match</span><span className="ctitle">Nobody matches “{q}”</span>
          <span className="cmeta">Try a different name or topic.</span>
          <span className="cfoot"><button className="btn" onClick={() => setQ('')}>Clear search</button></span></div>
        )}
        {shown.map((t) => (
          <div className="course" key={t.userId}>
            <span className="status">{t.topics.join(' · ') || 'Trainer'}</span>
            <span className="ctitle">
              <Link href={`/trainers/${t.userId}`} style={{ color: 'inherit' }}>{t.displayName}</Link>{' '}
              <VerifiedBadge state={t.badge} size="sm" />
            </span>
            <span className="cmeta">
              {t.reviewCount > 0 ? (
                <span className="badge ok" style={{ marginRight: 8 }}>★ {t.reviewAverage} ({t.reviewCount})</span>
              ) : null}
              {t.bio || 'Live classes only.'}
            </span>
            <span className="cfoot">
              {following.has(t.userId) ? '✓ Following' : (
                <button className="btn" onClick={() => follow(t.userId)}>Follow</button>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
