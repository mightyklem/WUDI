import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import ClassroomClient from '../ClassroomClient';
import { formatNgn } from '@learnovize/shared';
import { lagosSpanLabel } from '@/lib/lagos';

export const dynamic = 'force-dynamic';

export default async function ClassroomPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      training: {
        select: {
          title: true,
          trainer: { select: { displayName: true } },
          days: { orderBy: { dayIndex: 'asc' } },
        },
      },
    },
  });
  if (!session) return notFound();

  const day = session.training.days.find((d) => d.id === session.dayId);
  // Show who and when, not an opaque room id. Two people who are meant to be in
  // the same session can then see at a glance whether they are.
  const now = Date.now();
  const started = session.startsAtUtc.getTime();
  const ended = session.endsAtUtc.getTime();

  return (
    <div className="wrap">
      <div className="topbar"><span className="logo">Learnovize</span>
        <nav><Link className="btn link" href="/">Home</Link></nav>
      </div>

      <div className="surface surface-hero pat-weave" style={{ padding: 'var(--s-5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="tile-icon tint-accent" aria-hidden>🎥</span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{ fontSize: 24 }}>{session.training.title}</h1>
            <p className="muted" style={{ margin: '2px 0 0', fontSize: 14 }}>
              {session.training.trainer.displayName}
              {day ? ` · ${day.topic ?? `Day ${day.dayIndex}`}` : ''}
              {' · '}
              {lagosSpanLabel(session.startsAtUtc, session.endsAtUtc)}
            </p>
          </div>
          {/* Live only: stating it here means nobody joins expecting a replay. */}
          <span className="badge free">No replay</span>
        </div>

        {now < started && (
          <p className="muted" style={{ margin: '12px 0 0', fontSize: 14 }}>
            This session has not started yet. It opens at the time above.
          </p>
        )}
        {now > ended && (
          <p className="muted" style={{ margin: '12px 0 0', fontSize: 14 }}>
            This session has finished. Joining now will not earn attendance.
          </p>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        <ClassroomClient sessionId={sessionId} />
      </div>
    </div>
  );
}