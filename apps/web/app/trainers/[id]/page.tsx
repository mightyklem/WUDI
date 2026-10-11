'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import SiteNav from '../../components/SiteNav';
import VerifiedBadge from '../../components/VerifiedBadge';

type Data = {
  trainer: {
    userId: string; displayName: string; bio: string | null; topics: string[];
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

  useEffect(() => {
    fetch(`/api/trainers/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j ? setData(j) : setMissing(true)));
  }, [id]);

  if (missing) {
    return (
      <div className="wrap">
        <SiteNav />
        <h1>Trainer not found.</h1>
        <p className="sub"><Link className="btn link" href="/trainers">← All trainers</Link></p>
      </div>
    );
  }
  if (!data) return <div className="wrap"><p className="muted">Loading…</p></div>;

  const { trainer, reviews } = data;

  return (
    <div className="wrap">
      <SiteNav />
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {trainer.displayName}
        <VerifiedBadge state={trainer.badge} />
      </h1>
      <p className="sub">{trainer.topics.join(' · ') || 'Trainer'}</p>

      <div className="card" style={{ marginTop: 18 }}>
        {reviews.count > 0 ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 34, fontWeight: 800 }}>{reviews.average}</span>
              <span className="badge ok" style={{ fontSize: 15 }}>
                {'★'.repeat(Math.round(reviews.average!))}
              </span>
              <span className="muted">
                from {reviews.count} review{reviews.count === 1 ? '' : 's'}
              </span>
            </div>
            <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
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

      {reviews.recent.length > 0 && (
        <>
          <h2 className="sec">What learners said</h2>
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            {reviews.recent.map((r, i) => (
              <div className="card" key={i} style={{ padding: 14 }}>
                <span className="badge ok">{'★'.repeat(r.rating)}</span>
                {r.body && <p style={{ margin: '8px 0 0' }}>{r.body}</p>}
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
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