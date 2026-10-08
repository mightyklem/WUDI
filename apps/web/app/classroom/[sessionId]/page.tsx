import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import ClassroomClient from '../ClassroomClient';
import { formatNgn } from '@learnovize/shared';

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
      <h1>{session.training.title}</h1>
      <p className="sub">
        {session.training.trainer.displayName}
        {day ? ` · ${day.topic ?? `Day ${day.dayIndex}`}` : ''}
        {' · '}
        {new Date(session.startsAtUtc).toUTCString().slice(0, 22)} – {new Date(session.endsAtUtc).toUTCString().slice(17, 22)} UTC
      </p>
      <p className="sub">Live only — this session is not recorded.</p>

      {now < started && (
        <p className="muted">This session has not started yet. It opens at the time above.</p>
      )}
      {now > ended && (
        <p className="muted">This session has finished. Joining now will not earn attendance.</p>
      )}

      <ClassroomClient sessionId={sessionId} />
    </div>
  );
}