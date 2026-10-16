import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import ClassroomClient from '../ClassroomClient';
import { formatNgn } from '@learnovize/shared';
import { lagosSpanLabel } from '@/lib/lagos';
import SiteNav from '../../components/SiteNav';

export const dynamic = 'force-dynamic';

export default async function ClassroomPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      training: {
        select: {
          title: true,
          description: true,
          accessType: true,
          pricePerDayNgn: true,
          seatsTaken: true,
          cap: true,
          trainerId: true,
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
      <SiteNav />

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
        {now > ended && !session.admittedAtUtc && (
          <p className="muted" style={{ margin: '12px 0 0', fontSize: 14 }}>
            This session's scheduled time has passed. If the trainer is still live you can
            still join below; joining after it ends will not earn attendance.
          </p>
        )}
        {now > ended && !!session.admittedAtUtc && session.status !== 'ended' && (
          <p className="muted" style={{ margin: '12px 0 0', fontSize: 14 }}>
            This class is running over its scheduled time. The trainer has not ended it, so
            joining now still counts.
          </p>
        )}
        {session.endedAtUtc && (
          <p className="muted" style={{ margin: '12px 0 0', fontSize: 14 }}>
            This session has ended. Attendance was recorded up to the moment the trainer
            closed the room.
          </p>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        <ClassroomClient
          sessionId={sessionId}
          intro={{
            title: session.training.title,
            hostName: session.training.trainer.displayName,
            startsAtUtc: session.startsAtUtc.toISOString(),
            endsAtUtc: session.endsAtUtc.toISOString(),
            // The waiting room opens an hour early, so people can sort their camera
            // out before the advertised start rather than during it.
            opensAtUtc: (session.opensAtUtc ?? new Date(started - 3600_000)).toISOString(),
            admittedAtUtc: session.admittedAtUtc?.toISOString() ?? null,
            // Passed separately from the latch above so the room can be shown as closed
            // without erasing the fact that it once opened.
            endedAtUtc: session.endedAtUtc?.toISOString() ?? null,
            agenda: session.agenda,
            showcaseName: session.showcaseName,
            showcaseUrl: session.showcaseUrl,
            showcaseNote: session.showcaseNote,
            showcaseImageUrl: session.showcaseImageUrl,
            registered: session.training.seatsTaken,
            cap: session.training.cap,
            description: session.training.description,
            accessType: session.training.accessType,
            pricePerDayNgn: session.training.pricePerDayNgn,
            // Resolved on the client against /api/me: the access token lives in localStorage,
            // so a server component cannot see who is asking.
            ownerId: session.training.trainerId,
          }}
        />
      </div>
    </div>
  );
}