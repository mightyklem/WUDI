import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import RegisterButton from '../RegisterButton';

export const dynamic = 'force-dynamic';

export default async function TrainingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await prisma.training.findUnique({
    where: { id },
    include: {
      trainer: { select: { displayName: true } },
      sessions: { orderBy: { startsAtUtc: 'asc' } },
    },
  });
  if (!t) return notFound();
  const left = t.cap - t.seatsTaken;
  const full = left <= 0 || t.status === 'full';
  return (
    <div className="wrap">
      <div className="topbar"><span className="logo">Wudi 無敵</span>
        <nav><Link className="btn link" href="/">Home</Link><Link className="btn link" href={`/t/${t.slug}/register`}>Invite link</Link></nav>
      </div>
      <p className="eyebrow">{t.topic || 'Training'} · {t.format === 'audio' ? 'Audio-only' : 'Video + audio'} · {t.trainer.displayName}</p>
      <h1 style={{ color: 'var(--ink)' }}>{t.title}</h1>
      <p className="sub">{t.description}</p>
      <p className="sub">Attend at least {t.minPct}% of the sessions to earn your certificate. {t.certMode === 'none' ? 'No certificate.' : t.certMode === 'free' ? 'Free certificate.' : `Paid certificate · ₦${t.certPriceNgn}.`}</p>
      <div className="card" style={{ marginTop: 18 }}>
        <p className="eyebrow">{t.sessions.length} session{t.sessions.length === 1 ? '' : 's'} · {left} / {t.cap} seats left {full && '(FULL)'}</p>
        {t.sessions.map((s) => (
          <p key={s.id} className="meta">🗓 {s.startsAtUtc.toUTCString()} → {s.endsAtUtc.toUTCString()}</p>
        ))}
        <div className="btnrow"><RegisterButton trainingId={t.id} full={full || t.status !== 'live'} /></div>
      </div>
    </div>
  );
}
