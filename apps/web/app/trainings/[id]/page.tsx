import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import ClassWorkspace from '../../components/ClassWorkspace';
import TrainerOnly from '../../components/TrainerOnly';
import { formatNgn, tierLabel } from '@learnovize/shared';
import { quoteFor } from '@/lib/pricing';
import { lagosSpanLabel } from '@/lib/lagos';
import SiteNav from '../../components/SiteNav';

export const dynamic = 'force-dynamic';

export default async function TrainingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await prisma.training.findUnique({
    where: { id },
    include: {
      trainer: { select: { displayName: true } },
      sessions: { orderBy: { startsAtUtc: 'asc' } },
      days: {
        orderBy: { dayIndex: 'asc' },
        include: {
          sessions: { select: { startsAtUtc: true } },
          // Only buyers who are still active count as having locked the day.
          _count: {
            select: { sessions: true, enrollments: { where: { registration: { status: 'active' } } } },
          },
        },
      },
      _count: { select: { registrations: { where: { status: 'active' } } } },
    },
  });
if (!t) return notFound();
  const price = quoteFor(t);
  // Absolute, not a path. The whole point of the copy button is that the trainer can
  // paste this straight into a message, and a relative /t/... is useless to whoever
  // receives it. NEXT_PUBLIC_APP_URL is the deployed origin.
  const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3100').replace(/\/$/, '');
  const inviteUrl = `${appOrigin}/t/${t.slug}/register`;
  // A class whose last session has passed is over, whatever its status still says. The
  // trainer may never have closed it, and this page should not pretend otherwise.
  const nowMs = Date.now();
  const hasEnded = t.sessions.length > 0 && t.sessions.every((s) => new Date(s.endsAtUtc).getTime() <= nowMs);
  const seatsLeft = t.cap - t.seatsTaken;

  return (
    <div className="wrap">
      <SiteNav />

      <p className="eyebrow" style={{ marginTop: 14 }}>
        {t.topic || 'Training'} · {t.format === 'audio' ? 'Audio-only' : 'Video + audio'} ·{' '}
        {t.trainer.displayName}
        {t.accessType === 'paid' ? ` · ${tierLabel(t.tier)}` : ' · Free'}
      </p>
      <h1 style={{ color: 'var(--ink)' }}>{t.title}</h1>

      {/* The trainer's own words, in their words. Nothing wrapped around it. */}
      {t.description && <p style={{ fontSize: 'var(--t-base)', lineHeight: 1.55, marginTop: 8 }}>{t.description}</p>}

      {/* The price as a figure. It was a sentence of prose explaining what a number already
          says, which is what pushed the actual answer below the fold on a phone. */}
      <p style={{ fontSize: 'var(--t-md)', fontWeight: 800, marginTop: 14 }}>
        {t.accessType === 'paid' ? (
          <>
            {formatNgn(price.totalNgn)}
            <span className="muted" style={{ fontSize: 'var(--t-base)', fontWeight: 600 }}>
              {' '}total · {formatNgn(price.pricePerDayNgn ?? 0)} × {price.days} day{price.days === 1 ? '' : 's'}
            </span>
          </>
        ) : (
          <>Free</>
        )}
      </p>
      <p className="muted" style={{ fontSize: 'var(--t-sm)', marginTop: 4 }}>
        {t.accessType === 'paid' && t.certMode === 'paid' ? 'Certificate included' : 'No certificate'} ·{' '}
        {t.minPct}% attendance needed
      </p>

      {/* When the class runs, as information. The Join button that used to sit here is gone
          -- a trainer gets into their room from Manage your classes or My sessions, and
          putting a second one here meant two ways to do the same thing on one screen. */}
      <p className="muted" style={{ fontSize: 'var(--t-sm)', marginTop: 6 }}>
        {t.sessions.length} session{t.sessions.length === 1 ? '' : 's'} · {seatsLeft} of {t.cap} seats left
        {t.sessions.length > 0 && (
          <> · {t.sessions.map((s) => lagosSpanLabel(s.startsAtUtc, s.endsAtUtc)).join('  ·  ')}</>
        )}
      </p>

      {hasEnded && (
        <div className="card" style={{ marginTop: 12, background: 'var(--warn-soft)', borderLeft: '4px solid var(--warn)' }}>
          <p className="u-h" style={{ margin: 0 }}>This class has ended</p>
          <p className="muted u-sub" style={{ margin: '4px 0 0' }}>
            Registration is closed and the share link no longer takes a seat.
          </p>
        </div>
      )}

      {/* The learner-facing controls are not on this page. Join and Reserve live on the
          shared link -- /t/<slug>/register -- which is where somebody who is not the
          trainer actually arrives, from the class list or from a shared message. Keeping
          them here meant a trainer's own class page had a Reserve seat button for a seat
          they did not need, and a consent checkbox for a document they were not signing.

          What is left is the trainer's side of the class: one tabbed workspace, five jobs. */}
      <TrainerOnly trainingId={t.id}>
        <section style={{ marginTop: 26 }}>
          <ClassWorkspace
            trainingId={t.id}
            inviteUrl={inviteUrl}
            tier={t.tier}
            accessType={t.accessType}
            certMode={t.certMode}
            minPct={t.minPct}
            days={t.days.map((d) => ({
              id: d.id,
              dayIndex: d.dayIndex,
              topic: d.topic,
              dateUtc: d.dateUtc,
              accessType: d.accessType,
              priceNgn: d.priceNgn,
              sessionCount: d._count.sessions,
              enrolled: d._count.enrollments,
              sold: d._count.enrollments,
              started: d.sessions.some((s) => new Date(s.startsAtUtc).getTime() <= Date.now()),
            }))}
          />
        </section>
      </TrainerOnly>
    </div>
  );
}
