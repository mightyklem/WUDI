import { prisma } from '@/lib/db';
import { sendEmailMany, sessionStartingEmail, emailEnabled } from '@/lib/email';

/**
 * Remind a learner about what they are booked into, once.
 *
 * sessionStartingEmail has existed since the email library was written and has never been
 * called by anything. A learner who reserved a seat and heard nothing afterwards had no
 * way of knowing when the room opened, and the failure is silent: they simply do not turn
 * up, and the class runs for everyone else.
 *
 * WHY THIS FIRES ON LOGIN RATHER THAN FROM A TIMER: there is no cron here, and adding one
 * to Netlify means a paid feature and a new failure mode. Firing when the learner comes
 * back covers the case that matters -- somebody who has just booked something checks the
 * app -- and it costs nothing to run.
 *
 * The acknowledgement is written BEFORE the send, not after. If the process dies between
 * sending and recording, the duplicate is caught; the other order loses the reminder and
 * nobody knows. A missed reminder is a nuisance, a repeated one is an annoyance you cannot
 * explain, and the second is the one that makes people mark you as spam.
 */
export async function remindUpcoming(userId: string) {
  if (!emailEnabled()) return { sent: 0, skipped: 'no-email' };

  const now = Date.now();
  const horizon = now + 36 * 3600 * 1000; // just over a day, so "tomorrow" gets sent

  const regs = await prisma.registration.findMany({
    where: { userId, status: 'active' },
    select: {
      id: true,
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

  const due: { email: ReturnType<typeof sessionStartingEmail>; ref: string }[] = [];

  for (const r of regs) {
    const s = r.training.sessions[0]; // soonest is the one worth a nudge about
    if (!s || s.status === 'cancelled') continue;
    due.push({
      email: sessionStartingEmail({
        trainingTitle: r.training.title,
        startsAtUtc: s.startsAtUtc.toISOString(),
        roomPath: `/classroom/${s.id}`,
      }),
      // Keyed on the session, not the day, so somebody booked into three sessions
      // tomorrow gets three distinct reminders and three distinct acknowledgements.
      ref: `session-reminder:${s.id}`,
    });
  }
  if (!due.length) return { sent: 0 };

  // Claim first, then send. Anything already claimed is skipped, which is what makes a
  // second call on the next login harmless.
  const claimed: typeof due = [];
  for (const d of due) {
    try {
      await prisma.notification.create({
        data: { userId, type: 'session-reminder', payload: { ref: d.ref } },
      });
      claimed.push(d);
    } catch {
      // A duplicate here just means a reminder already went out for this session.
    }
  }
  if (!claimed.length) return { sent: 0, skipped: 'already-reminded' };

  // The email builder leaves `to` blank because it did not know the address; fill it now.
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user?.email) return { sent: 0 };

  const res = await sendEmailMany(claimed.map((c) => ({ ...c.email, to: user.email })));
  return { sent: res.sent };
}