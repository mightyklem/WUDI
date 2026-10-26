'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import SiteNav from '../../components/SiteNav';
import VerifiedBadge from '../../components/VerifiedBadge';
import Avatar from '../../components/Avatar';
import ShareButton from '../../components/ShareButton';
import { TrainerMaterials } from '../../components/Materials';
import { authFetch, getAccess } from '@/lib/client-auth';

type Data = {
  trainer: {
    userId: string; displayName: string; bio: string | null; topics: string[];
    photoUrl: string | null; personPhotoUrl: string | null;
    followerCount: number; isFollowing: boolean; isMe: boolean;
    badge: { verified: boolean; expired?: boolean; label: string | null; rating?: string | null };
  };
  reviews: {
    average: number | null; count: number;
    recent: { rating: number; body: string | null; createdAt: string }[];
  };
  classes?: { id: string; slug: string; title: string; accessType: string; pricePerDayNgn: number | null }[];
};

export default function TrainerProfile({ params }: { params: Promise<{ id: string }> }) {
  // Next hands dynamic params in as a promise; use() unwraps it on the client the same
  // way `await params` does in a server component.
  const { id } = use(params);
  const [data, setData] = useState<Data | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    authFetch(`/api/trainers/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j ? setData(j) : setMissing(true)));
  }, [id]);

  if (missing) {
    return (
      <div className="wrap">
        <SiteNav />
        <h1>Trainer not found.</h1>
        <p className="sub"><Link className="btn link" href="/trainers">→ All trainers</Link></p>
      </div>
    );
  }
  if (!data) return <div className="wrap"><p className="muted">Loading…</p></div>;

  const { trainer, reviews } = data;

  async function toggleFollow() {
    if (!data) return;
    setBusy(true);
    setNote(null);
    try {
      const access = getAccess();
      if (!access) {
        setNote('Sign in to follow.');
        return;
      }
      const was = data.trainer.isFollowing;
      const r = await authFetch(`/api/trainers/${id}/follow`, {
        method: was ? 'DELETE' : 'POST',
        headers: { authorization: `Bearer ${access}` },
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setNote(j.error || 'Could not follow.');
        return;
      }
      setData({
        ...data,
        trainer: {
          ...data.trainer,
          isFollowing: !was,
          followerCount: data.trainer.followerCount + (was ? -1 : 1),
        },
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <SiteNav />

      {/* The picture, the name, and what they teach -- together, so the page reads as
          a person rather than as a form with a heading. */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
        <Avatar
          name={trainer.displayName}
          photoUrl={trainer.personPhotoUrl || trainer.photoUrl}
          size={72}
          seed={trainer.userId}
        />
        <div style={{ minWidth: 0 }}>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: 0 }}>
            {trainer.displayName}
            <VerifiedBadge state={trainer.badge} />
          </h1>
          <p className="sub" style={{ margin: '4px 0 0' }}>
            {trainer.topics.join(' · ') || 'Trainer'}
            {trainer.followerCount > 0 && ` · ${trainer.followerCount} following`}
          </p>
        </div>
      </div>

      {/* Follow, message, share. The three things you do with a person you have found
          on a screen: keep them, ask them something, pass them on. */}
      {trainer.isMe ? (
        <div className="btnrow" style={{ marginTop: 16 }}>
          <Link className="btn primary" href="/me/profile">Edit your profile</Link>
        </div>
      ) : (
        <div className="btnrow" style={{ marginTop: 16 }}>
          <button className="btn primary" onClick={toggleFollow} disabled={busy}>
            {trainer.isFollowing ? 'Following' : 'Follow'}
          </button>
          <Link className="btn" href={`/messages/${trainer.userId}`}>Message</Link>
          <ShareButton
            url={`/trainers/${trainer.userId}`}
            title={trainer.displayName}
            label="Share"
          />
        </div>
      )}
      {note && <p className="muted" style={{ fontSize: 'var(--t-sm)' }}>{note}</p>}

      <div className="card" style={{ marginTop: 18 }}>

        {reviews.count > 0 ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 'var(--t-2xl)', fontWeight: 800 }}>{reviews.average}</span>
              <span className="badge ok" style={{ fontSize: 'var(--t-base)' }}>
                {'★'.repeat(Math.round(reviews.average!))}
              </span>
              <span className="muted">
                from {reviews.count} review{reviews.count === 1 ? '' : 's'}
              </span>
            </div>
            <p className="muted" style={{ fontSize: 'var(--t-sm)', marginBottom: 0 }}>
              Only people who attended the class can leave a review, and one person can rate
              each class once.
            </p>
          </>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            No reviews yet. Only learners who actually attended can leave the first one.
          </p>
        )}
      </div>

      {trainer.bio && (
        <div className="card" style={{ marginTop: 14 }}>
          <b>About</b>
          <p style={{ marginBottom: 0 }}>{trainer.bio}</p>
        </div>
      )}

      {/* Files the trainer sells or gives away: ebooks, slides, recordings. */}
      <TrainerMaterials trainerId={trainer.userId} />

      {reviews.recent.length > 0 && (
        <>
          <h2 className="sec">See what learners said</h2>
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            {reviews.recent.map((r, i) => (
              <div className="card" key={i} style={{ padding: 14 }}>
                <span className="badge ok">{'★'.repeat(r.rating)}</span>
                {r.body && <p style={{ margin: '8px 0 0' }}>{r.body}</p>}
                <div className="muted" style={{ fontSize: 'var(--t-xs)', marginTop: 6 }}>
                  {new Date(r.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <p style={{ marginTop: 22 }}>
        <Link className="btn link" href="/trainers">← All trainers</Link>
      </p>
    </div>
  );
}