import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import DayPicker from '../../../trainings/DayPicker';
import RegisterButton from '../../../trainings/RegisterButton';
import { formatNgn, tierLabel } from '@learnovize/shared';

export const dynamic = 'force-dynamic';

async function bySlug(slug: string) {
  return prisma.training.findUnique({
    where: { slug },
    include: {
      trainer: { select: { displayName: true } },
      sessions: { orderBy: { startsAtUtc: 'asc' } },
      days: { orderBy: { dayIndex: 'asc' } },
    },
  });
}

// SSR Open Graph preview for WhatsApp/X/Telegram (FR-4.2). No app required (PRD §5).
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = await bySlug(slug);
  if (!t) return { title: 'Learnovize — training not found' };
  const first = t.sessions[0]?.startsAtUtc.toUTCString() ?? '';
  const paidDays = t.days.filter((d) => d.accessType === 'paid');
  const priceLine = paidDays.length
    ? `from ${formatNgn(Math.min(...paidDays.map((d) => d.priceNgn)))} per day`
    : 'Free';
  return {
    title: `Learnovize — ${t.title}`,
    description: `${t.trainer.displayName} · ${first} · ${t.cap - t.seatsTaken} seats left · ${priceLine}`,
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
  const paid = t.accessType === 'paid';

  return (
    <div className="wrap">
      <div className="topbar"><span className="logo">Learnovize</span></div>
      <div className="card" style={{ marginTop: 8 }}>
        <p className="eyebrow">You&apos;re invited · {t.trainer.displayName}</p>
        <p className="bigtitle">{t.title}</p>
        <p className="meta">{t.description}</p>
        <p className="meta">
          <b>{full ? 'FULL' : `${left} / ${t.cap} seats left`}</b> ·{' '}
          {t.format === 'audio' ? 'Audio-only (low data)' : 'Video + audio'} ·{' '}
          {paid ? `${tierLabel(t.tier)} class` : 'Free class'}
        </p>

        <div style={{ marginTop: 18 }}>
          {t.days.length ? (
            <DayPicker
              trainingId={t.id}
              days={t.days.map((d) => ({
                id: d.id,
                dayIndex: d.dayIndex,
                topic: d.topic,
                dateUtc: d.dateUtc,
                accessType: d.accessType,
                priceNgn: d.priceNgn,
              }))}
              full={full}
              certMode={t.certMode}
              minPct={t.minPct}
              totalDays={t.days.length}
            />
          ) : (
            // Classes created before per-day pricing have no day rows. Rather than
            // block them, fall back to the old single-price flow.
            <>
              <p style={{ margin: '0 0 10px', fontWeight: 800, fontSize: 16 }}>
                {paid ? `${formatNgn(t.pricePerDayNgn ?? 0)} per day` : 'Free to attend'}
              </p>
              <div className="btnrow">
                <RegisterButton trainingId={t.id} full={full} label={paid ? 'Register' : 'Register free'} />
              </div>
            </>
          )}
        </div>
      </div>
      <p className="muted">Invite pages load fast and open directly from shared links — no app install needed.</p>
    </div>
  );
}