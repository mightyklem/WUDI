'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import SiteNav from '../../components/SiteNav';
import VerifiedBadge from '../../components/VerifiedBadge';
import Avatar from '../../components/Avatar';
import ShareButton from '../../components/ShareButton';
import Tabs from '../../components/Tabs';
import Icon from '@/components/Icon';
import { TrainerMaterials } from '../../components/Materials';
import { authFetch, getAccess } from '@/lib/client-auth';
import { formatNgn } from '@learnovize/shared';

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

/**
 * A trainer's page reads as a small digital store, not a form.
 *
 * One glance tells you who they are (picture, name, proof), one row of
 * symbol buttons does everything (＋ follow, ✉ message, ⇪ share), and
 * everything they sell or teach sits behind three tabs — so the shop, the
 * classes and what learners said are each one tap away instead of three
 * screens of scrolling.
 */
export default function TrainerProfile({ params }: { params: Promise<{ id: string }> }) {
  // Next hands dynamic params in as a promise; use() unwraps it on the client the same
  // way `await params` does in a server component.
  const { id } = use(params);
  const [data, setData] = useState<Data | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [tab, setTab] = useState<'shop' | 'classes' | 'reviews' | 'about'>('shop');
  // Sessions of this trainer the viewer attended but has not reviewed yet.
  // Attended-and-unreviewed is the only state that can act, so it is the only
  // one fetched: anything else would be a button that leads nowhere.
  const [toReview, setToReview] = useState<{ sessionId: string }[] | null>(null);

  useEffect(() => {
    authFetch(`/api/trainers/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j ? setData(j) : setMissing(true)));
    if (getAccess()) {
      authFetch('/api/me/reviews')
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          const sessions: { sessionId: string; trainerId: string; myRating: number | null }[] = j?.sessions || [];
          setToReview(
            sessions.filter((s) => s.trainerId === id && s.myRating === null).map((s) => ({ sessionId: s.sessionId })),
          );
        })
        .catch(() => setToReview([]));
    } else {
      setToReview([]);
    }
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
  const classes = data.classes || [];

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

      {/* Storefront header: the face, the name, the proof — one row. */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 6 }}>
        <Avatar
          name={trainer.displayName}
          photoUrl={trainer.personPhotoUrl || trainer.photoUrl}
          size={64}
          seed={trainer.userId}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: 0, fontSize: 'var(--t-xl)' }}>
            {trainer.displayName}
            <VerifiedBadge state={trainer.badge} />
          </h1>
          <p className="sub" style={{ margin: '2px 0 0' }}>
            {trainer.topics.join(' · ') || 'Trainer'}
            {trainer.followerCount > 0 && ` · ${trainer.followerCount} following`}
            {reviews.average !== null && ` · ★ ${reviews.average} (${reviews.count})`}
          </p>
        </div>
      </div>

      {/* The only three things you do with a person you found: keep them,
          ask them something, pass them on. Icons alone, in the brand set, so
          the row reads at a glance in any language; names survive on tooltips
          and screen readers. */}
      {trainer.isMe ? (
        <div className="btnrow" style={{ marginTop: 14 }}>
          <Link className="btn primary" href="/me/profile">✎ Edit your store</Link>
        </div>
      ) : (
        <div className="btnrow" style={{ marginTop: 14 }}>
          <button
            className={trainer.isFollowing ? 'btn primary' : 'btn'}
            onClick={toggleFollow}
            disabled={busy}
            aria-pressed={trainer.isFollowing}
            aria-label={trainer.isFollowing ? 'Unfollow this trainer' : 'Follow this trainer'}
            title={trainer.isFollowing ? 'Following' : 'Follow'}
            style={{ minWidth: 48, justifyContent: 'center' }}
          >
            <Icon name={trainer.isFollowing ? 'check' : 'people'} size={20} />
          </button>
          <Link
            className="btn"
            href={`/messages/${trainer.userId}`}
            aria-label={`Message ${trainer.displayName}`}
            title="Message"
            style={{ minWidth: 48, justifyContent: 'center' }}
          >
            <Icon name="chat" size={20} />
          </Link>
          <ShareButton
            url={`/trainers/${trainer.userId}`}
            title={trainer.displayName}
            label={<Icon name="share" size={20} />}
            ariaLabel="Share this trainer"
            titleAttr="Share"
          />
        </div>
      )}
      {note && <p className="muted" style={{ fontSize: 'var(--t-sm)' }}>{note}</p>}

      {/* Shop, classes, word-of-mouth, story — one tap each, no scrolling
          past the things you are not looking for. */}
      <div style={{ marginTop: 16 }}>
        <Tabs
          tabs={[
            { key: 'shop', label: 'Shop' },
            { key: 'classes', label: 'Classes', count: classes.length },
            { key: 'reviews', label: 'Reviews', count: reviews.count },
            { key: 'about', label: 'About' },
          ]}
          value={tab}
          onChange={(k) => setTab(k as 'shop' | 'classes' | 'reviews' | 'about')}
        />

        <div style={{ marginTop: 14 }}>
          {tab === 'shop' && <TrainerMaterials trainerId={trainer.userId} />}

          {tab === 'classes' && (
            classes.length === 0 ? (
              <p className="muted">No classes open right now.</p>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {classes.map((c) => (
                  <div key={c.id} className="card" style={{ padding: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <p style={{ margin: 0, fontWeight: 800 }}>{c.title}</p>
                      <p className="muted" style={{ margin: '4px 0 0', fontSize: 'var(--t-xs)' }}>
                        {c.accessType === 'paid' ? formatNgn(c.pricePerDayNgn ?? 0) + '/day' : 'Free'}
                      </p>
                    </div>
                    <Link className="btn primary" href={`/t/${c.slug}/register`}>Register</Link>
                  </div>
                ))}
              </div>
            )
          )}

          {tab === 'reviews' && (
            reviews.count > 0 ? (
              <>
                {(toReview?.length || 0) > 0 && (
                  <div className="card" style={{ padding: 14, marginBottom: 12, borderLeft: '4px solid var(--leaf)' }}>
                    <p className="u-h" style={{ margin: 0 }}>You attended — say how it went</p>
                    <p className="muted u-sub" style={{ margin: '4px 0 10px' }}>
                      {toReview!.length} class{toReview!.length === 1 ? '' : 'es'} waiting for your rating.
                    </p>
                    <Link className="btn primary" href="/me/reviews">★ Leave a review</Link>
                  </div>
                )}                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontSize: 'var(--t-2xl)', fontWeight: 800 }}>{reviews.average}</span>
                  <span className="badge ok" style={{ fontSize: 'var(--t-base)' }}>
                    {'★'.repeat(Math.round(reviews.average!))}
                  </span>
                  <span className="muted">from {reviews.count} review{reviews.count === 1 ? '' : 's'}</span>
                </div>
                <p className="muted" style={{ fontSize: 'var(--t-sm)' }}>
                  Only people who attended the class can leave a review.
                </p>
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
            ) : (toReview?.length || 0) > 0 ? (
              <div className="card" style={{ padding: 16 }}>
                <p className="u-h" style={{ margin: 0 }}>No reviews yet — yours can be the first</p>
                <p className="muted u-sub" style={{ margin: '4px 0 12px' }}>
                  You attended this trainer&apos;s class, so your rating counts.
                </p>
                <Link className="btn primary" href="/me/reviews">★ Leave the first review</Link>
              </div>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                No reviews yet. Only learners who actually attended can leave the first one.
              </p>
            )
          )}

          {tab === 'about' && (
            trainer.bio ? <p style={{ margin: 0 }}>{trainer.bio}</p> : <p className="muted" style={{ margin: 0 }}>Nothing here yet.</p>
          )}
        </div>
      </div>

      <p style={{ marginTop: 22 }}>
        <Link className="btn link" href="/trainers">← All trainers</Link>
      </p>
    </div>
  );
}
