import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma, safeDb } from '@/lib/db';
import RegisterButton from '../../../trainings/RegisterButton';

export const dynamic = 'force-dynamic';

async function bySlug(slug: string) {
  return safeDb(() =>
    prisma.training.findUnique({
      where: { slug },
      include: {
        trainer: { select: { displayName: true } },
        sessions: { orderBy: { startsAtUtc: 'asc' } },
      },
    }),
  null);
}

// SSR Open Graph preview for WhatsApp/X/Telegram (FR-4.2). No app required (PRD §5).
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = await bySlug(slug);
  if (!t) return { title: 'Learnovize — training not found' };
  const first = t.sessions[0]?.startsAtUtc.toUTCString() ?? '';
  return {
    title: `Learnovize — ${t.title}`,
    description: `${t.trainer.displayName} · ${first} · ${t.cap - t.seatsTaken} seats left · Attendance free`,
    openGraph: {
      title: t.title,
      description: `${t.trainer.displayName} · ${first}`,
      type: 'website',
    },
  };
}

export default async function InvitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await bySlug(slug);
  if (!t) return notFound();
  const left = t.cap - t.seatsTaken;
  const full = left <= 0 || t.status !== 'live';
  return (
    <div className="wrap">
      <div className="topbar"><span className="logo">Learnovize</span></div>
      <div className="card" style={{ marginTop: 8 }}>
        <p className="eyebrow">You&apos;re invited · {t.trainer.displayName}</p>
        <p className="bigtitle">{t.title}</p>
        <p className="meta">{t.description}</p>
        <p className="meta">🗓 {t.sessions.map((s) => s.startsAtUtc.toUTCString()).join(' · ')}</p>
        <p className="meta"><b>{full ? 'FULL' : `${left} / ${t.cap} seats left`}</b> · {t.format === 'audio' ? 'Audio-only (low data)' : 'Video + audio'} · Attendance free{t.certMode !== 'none' ? ` · ${t.certMode} certificate` : ''}</p>
        <p className="meta">Attend at least {t.minPct}% of the sessions to earn your certificate.</p>
        <div className="btnrow">
          <RegisterButton trainingId={t.id} full={full} label="Register free" />
        </div>
      </div>
      <p className="muted">Invite pages load fast and open directly from shared links — no app install needed.</p>
    </div>
  );
}
