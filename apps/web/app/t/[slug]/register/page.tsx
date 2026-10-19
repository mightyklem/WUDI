import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import DayPicker from '../../../trainings/DayPicker';
import RegisterButton from '../../../trainings/RegisterButton';
import { formatNgn, tierLabel } from '@learnovize/shared';
import SiteNav from '../../../components/SiteNav';

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

  // A class whose last session has passed is over, whatever the training's status still says.
  // The trainer may never have closed it, and a shared link to a finished class should not
  // offer a seat that cannot happen -- or take money for it.
  const nowMs = Date.now();
  const lastEnd = t.sessions.length
    ? Math.max(...t.sessions.map((s) => new Date(s.endsAtUtc).getTime()))
    : null;
  const hasEnded = lastEnd !== null && lastEnd <= nowMs;

  return (
    <div className="wrap">
      <SiteNav />
      <div className="card" style={{ marginTop: 8 }}>
        <p className="eyebrow">You&apos;re invited · {t.trainer.displayName}</p>
        <p className="bigtitle">{t.title}</p>
        <p className="meta">{t.description}</p>
        <p className="meta">
          <b>{full ? 'FULL' : `${left} / ${t.cap} seats left`}</b> ·{' '}
          {t.format === 'audio' ? 'Audio-only (low data)' : 'Video + audio'} ·{' '}
          {paid ? `${tierLabel(t.tier)} class` : 'Free class'}
        </p>

        {/* A finished class says so, plainly, and offers nothing to click. This is the link
            people share, so it is where somebody arrives after the class has run and finds
            a Register button that would take their money for a session they cannot attend. */}
        {hasEnded && (
          <div className="card" style={{ marginTop: 16, background: 'var(--warn-soft)', borderLeft: '4px solid var(--warn)' }}>
            <p className="u-h" style={{ margin: 0 }}>This class has ended</p>
            <p className="muted u-sub" style={{ margin: '4px 0 0' }}>
              It ran on {t.sessions.length ? new Date(lastEnd!).toUTCString().slice(0, 16) : 'its scheduled date'}.
              Registration is closed.
            </p>
          </div>
        )}

        {!hasEnded && (
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
        )}
      </div>
      <p className="muted">Invite pages load fast and open directly from shared links — no app install needed.</p>
    </div>
  );
}