import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import RegisterButton from '../RegisterButton';
import ModeratorInvite from '../ModeratorInvite';
import CopyInviteLink from '../CopyInviteLink';
import AttendanceSection from '../AttendanceSection';
import IssueCertificates from '../IssueCertificates';
import PostComposer from '../PostComposer';
import DayPricingEditor from '../DayPricingEditor';
import { formatNgn, tierLabel } from '@learnovize/shared';
import { quoteFor } from '@/lib/pricing';
import { lagosSpanLabel } from '@/lib/lagos';

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
  return (
    <div className="wrap">
      <div className="topbar"><span className="logo">Learnovize</span>
        <nav><Link className="btn link" href="/">Home</Link><Link className="btn link" href="/dashboard">Dashboard</Link></nav>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <p className="eyebrow" style={{ marginBottom: 8 }}>Share this class</p>
        <CopyInviteLink url={inviteUrl} />
      </div>
      <p className="eyebrow">{t.topic || 'Training'} · {t.format === 'audio' ? 'Audio-only' : 'Video + audio'} · {t.trainer.displayName}{t.accessType === 'paid' ? ` · ${tierLabel(t.tier)} class` : ' · Free class'}</p>
      <h1 style={{ color: 'var(--ink)' }}>{t.title}</h1>
      <p className="sub">{t.description}</p>
      <p className="sub">
        {t.accessType === 'paid' ? (
          <>
            <b>{formatNgn(price.pricePerDayNgn ?? 0)}</b> per day × {price.days} day{price.days === 1 ? '' : 's'} ={' '}
            <b>{formatNgn(price.totalNgn)}</b> total.
            {t.certMode === 'paid'
              ? ` Certificate included — attend at least ${t.minPct}% of sessions to earn it.`
              : ` Attend at least ${t.minPct}% of sessions.`}
          </>
        ) : (
          <>Free class — anyone can attend. No certificate is issued, but attendees earn points.</>
        )}
      </p>
      <div className="card" style={{ marginTop: 18 }}>
        <p className="eyebrow">{t.sessions.length} session{t.sessions.length === 1 ? '' : 's'} · {left} / {t.cap} seats left {full && '(FULL)'}</p>
        {t.sessions.map((s) => (
          <p key={s.id} className="meta">🗓 {lagosSpanLabel(s.startsAtUtc, s.endsAtUtc)} <Link className="btn link" href={`/classroom/${s.id}`}>Join classroom →</Link></p>
        ))}
        <div className="btnrow"><RegisterButton trainingId={t.id} full={full || t.status !== 'live'} /></div>
      </div>
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

      <h2 className="sec">Moderators</h2>
      <div className="card"><ModeratorInvite trainingId={t.id} /></div>
      <AttendanceSection trainingId={t.id} sessionIds={t.sessions.map((s) => s.id)} />
      <IssueCertificates trainingId={t.id} />
      <h2 className="sec">Explore post</h2>
      <div className="card"><PostComposer trainingId={t.id} /></div>
    </div>
  );
}
