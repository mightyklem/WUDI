import { prisma } from '@/lib/db';
import { sendEmailMany, sessionsReminderEmail, emailEnabled } from '@/lib/email';

/**
 * Two nudges, not one.
 *
 * The first went out at 36 hours. That does nothing for somebody who booked a class six days
 * ago and has simply forgotten about it, which is most people, most of the time. So there is
 * a second one on the day itself -- terse, hour and link, because by then anything longer is
 * skipped.
 *
 * WHY NOT A TIMER: still no cron here, and adding one to Netlify means a paid plan and a new
 * failure mode. Both nudges fire when the learner opens the app, which is when somebody who
 * has just booked something is actually present to be reminded.
 *
 * THE TWO WINDOWS DO NOT OVERLAP. "Today" claims anything starting within TODAY_HOURS;
 * "soon" only claims what starts beyond that and inside SOON_HOURS. Without that split,
 * somebody who booked a class two days out and then opened the app twice would get the
 * planning email and the day-of email minutes apart, which reads as a broken system.
 */

const SOON_HOURS = 36;
const TODAY_HOURS = 6;

type Due = {
  sessionId: string;
  trainingTitle: string;
  startsAtUtc: string;
  roomPath: string;
  ref: string;
  kind: 'soon' | 'today';
};

export async function remindUpcoming(userId: string) {
  if (!emailEnabled()) return { sent: 0, skipped: 'no-email' };

  const now = Date.now();
  const horizon = now + SOON_HOURS * 3600 * 1000;

  const regs = await prisma.registration.findMany({
    where: { userId, status: 'active' },
    select: {
      training: {
        select: {
          title: true,
          sessions: {
            where: { startsAtUtc: { gt: new Date(now), lte: new Date(horizon) } },
            orderBy: { startsAtUtc: 'asc' },
            select: { id: true, startsAtUtc: true, status: true },
          },
        },
      },
    },
  });

  const due: Due[] = [];
  for (const r of regs) {
    for (const s of r.training.sessions) {
      if (s.status === 'cancelled') continue;
      const hoursOut = (s.startsAtUtc.getTime() - now) / 3600_000;
      // Keyed on the session AND the stage, so each is claimed once and never repeated.
      // A single key here would mean the day-of nudge silently never fires, because the
      // planning one had already used the slot.
      const kind: 'soon' | 'today' = hoursOut <= TODAY_HOURS ? 'today' : 'soon';
      due.push({
        sessionId: s.id,
        trainingTitle: r.training.title,
        startsAtUtc: s.startsAtUtc.toISOString(),
        roomPath: `/classroom/${s.id}`,
        ref: `session-reminder:${kind}:${s.id}`,
        kind,
      });
    }
  }
  if (!due.length) return { sent: 0 };

  // Claim first, then send. Anything already claimed is skipped, which is what makes calling
  // this on every page load harmless. Losing a nudge to a crash is a nuisance; sending the
  // same one twice is the failure that gets an address marked as spam.
  const claimed: Due[] = [];
  for (const d of due) {
    try {
      await prisma.notification.create({
        data: {
          userId,
          type: 'session-reminder',
          payload: {
            ref: d.ref,
            kind: d.kind,
            sessionId: d.sessionId,
            title: d.trainingTitle,
            startsAtUtc: d.startsAtUtc,
          },
        },
      });
      claimed.push(d);
    } catch {
      // Already claimed for this stage.
    }
  }
  if (!claimed.length) return { sent: 0, skipped: 'already-reminded' };

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user?.email) return { sent: 0 };

  // One email per stage, listing every class in it, rather than one per class. Somebody with
  // three sessions tomorrow gets one email naming three, not an inbox of three.
  const messages = (['today', 'soon'] as const)
    .map((kind) => {
      const items = claimed.filter((c) => c.kind === kind);
      if (!items.length) return null;
      return {
        ...sessionsReminderEmail(
          items.map((i) => ({
            trainingTitle: i.trainingTitle,
            startsAtUtc: i.startsAtUtc,
            roomPath: i.roomPath,
          })),
          kind,
        ),
        to: user.email!,
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  if (!messages.length) return { sent: 0 };
  const res = await sendEmailMany(messages);
  return { sent: res.sent };
}