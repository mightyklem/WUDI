import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import RegisterButton from '../RegisterButton';
import ModeratorInvite from '../ModeratorInvite';
import CopyInviteLink from '../CopyInviteLink';
import IssueCertificates from '../IssueCertificates';
import PostComposer from '../PostComposer';
import DayPricingEditor from '../DayPricingEditor';
import QuestionBox from '../../components/QuestionBox';
import CurriculumBuilder from '../../components/CurriculumBuilder';
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
  const left = t.cap - t.seatsTaken;
  // Absolute, not a path. The whole point of the copy button is that the trainer can
  // paste this straight into a message, and a relative /t/... is useless to whoever
  // receives it. NEXT_PUBLIC_APP_URL is the deployed origin.
  const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3100').replace(/\/$/, '');
  const inviteUrl = `${appOrigin}/t/${t.slug}/register`;
  const full = left <= 0 || t.status === 'full';
  // The next session that has not finished is the one somebody opening this page on
  // the day is actually here to attend. Everything else is a date they will come back for.
  const nowMs = Date.now();
  const nextSession =
    t.sessions.find((s) => new Date(s.endsAtUtc).getTime() > nowMs) ?? t.sessions[0] ?? null;
  const otherSessions = t.sessions.filter((s) => s.id !== nextSession?.id);

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
      {t.description && <p style={{ fontSize: 16, lineHeight: 1.55, marginTop: 8 }}>{t.description}</p>}

      {/* The price as a figure. It was a sentence of prose explaining what a number already
          says, which is what pushed the actual answer below the fold on a phone. */}
      <p style={{ fontSize: 19, fontWeight: 800, marginTop: 14 }}>
        {t.accessType === 'paid' ? (
          <>
            {formatNgn(price.totalNgn)}
            <span className="muted" style={{ fontSize: 15, fontWeight: 600 }}>
              {' '}total · {formatNgn(price.pricePerDayNgn ?? 0)} × {price.days} day{price.days === 1 ? '' : 's'}
            </span>
          </>
        ) : (
          <>Free</>
        )}
      </p>
      <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
        {t.accessType === 'paid' && t.certMode === 'paid' ? 'Certificate included' : 'No certificate'} ·{' '}
        {t.minPct}% attendance needed
      </p>

      {/* Join gets the emphasis. It was a faint link in a list the same size as the dates,
          on the one page where somebody may be trying to get to a class right now. */}
      <div className="card" style={{ marginTop: 16, padding: 16 }}>
        <p className="eyebrow" style={{ marginBottom: 10 }}>
          {t.sessions.length} session{t.sessions.length === 1 ? '' : 's'} · {left} of {t.cap} seats left
          {full && ' · FULL'}
        </p>

        {nextSession && (
          <div style={{ marginBottom: otherSessions.length ? 12 : 0 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
              {lagosSpanLabel(nextSession.startsAtUtc, nextSession.endsAtUtc)}
            </p>
            <div style={{ marginTop: 9 }}>
              <Link className="btn primary lg" href={`/classroom/${nextSession.id}`}>
                Join classroom
              </Link>
            </div>
          </div>
        )}

        {otherSessions.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {otherSessions.map((s) => (
              <li
                key={s.id}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  gap: 10, padding: '7px 0', borderTop: '1px solid var(--line)', fontSize: 14,
                }}
              >
                <span className="muted">{lagosSpanLabel(s.startsAtUtc, s.endsAtUtc)}</span>
                <Link className="btn link" href={`/classroom/${s.id}`}>Join</Link>
              </li>
            ))}
          </ul>
        )}

        <div className="btnrow" style={{ marginTop: 12 }}>
          <RegisterButton trainingId={t.id} full={full || t.status !== 'live'} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 12, padding: 16 }}>
        <p className="eyebrow" style={{ marginBottom: 8 }}>Share this class</p>
        <CopyInviteLink url={inviteUrl} />
      </div>

      {/* Before the trainer-facing sections: a learner deciding whether to book wants an
          answer far more than they want to know the day-by-day price breakdown. */}
      <QuestionBox trainingId={t.id} />

      {/* Trainer tooling. Gated on ownership, because this page is rendered for everyone
          and a learner should never see somebody else's pricing, moderators or
          certificate controls -- not even for the moment it takes to find out they are
          not the owner. */}
      <TrainerOnly trainingId={t.id}>
        <section style={{ marginTop: 26 }}>
          <h2 className="sec">Prepare your class</h2>
          <p className="sub" style={{ marginTop: -6 }}>
            Write the plan you will actually teach from, with the timing worked out, and take it
            away as a PDF or a Markdown file.
          </p>
          <div className="card" style={{ marginTop: 12 }}>
            <CurriculumBuilder trainingId={t.id} />
          </div>
        </section>

        <h2 className="sec">Days &amp; pricing</h2>
        <div className="card">
          <DayPricingEditor
            trainingId={t.id}
            tier={t.tier}
            accessType={t.accessType}
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
        </div>

        <h2 className="sec">Manage moderators</h2>
        <div className="card"><ModeratorInvite trainingId={t.id} /></div>
        <IssueCertificates trainingId={t.id} />
        <h2 className="sec">Explore post</h2>
        <div className="card"><PostComposer trainingId={t.id} /></div>
      </TrainerOnly>
    </div>
  );
}
