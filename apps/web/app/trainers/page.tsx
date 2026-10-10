'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAccess } from '@/lib/client-auth';
import SiteNav from '../components/SiteNav';

type Trainer = { userId: string; displayName: string; bio: string | null; topics: string[] };

export default function Trainers() {
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/trainers').then((r) => r.json()).then((j) => setTrainers(j.trainers || []));
  }, []);

  async function follow(id: string) {
    const access = getAccess();
    if (!access) return setMsg('Log in first to follow trainers.');
    const r = await fetch(`/api/trainers/${id}/follow`, {
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
      <div className="grid2" style={{ marginTop: 18 }}>
        {trainers.length === 0 && (
          <div className="course"><span className="status">Empty</span><span className="ctitle">No trainers yet</span>
          <span className="cmeta">Be the first — complete your profile.</span>
          <span className="cfoot"><Link href="/onboarding">Become a trainer →</Link></span></div>
        )}
        {trainers.map((t) => (
          <div className="course" key={t.userId}>
            <span className="status">{t.topics.join(' · ') || 'Trainer'}</span>
            <span className="ctitle">{t.displayName}</span>
            <span className="cmeta">{t.bio || 'Live classes only.'}</span>
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
