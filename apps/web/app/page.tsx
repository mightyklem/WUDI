import Link from 'next/link';
import { prisma } from '@/lib/db';
import FirstRunGuide from './FirstRunGuide';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const now = new Date();
  const [trainerCount, trainingCount, liveNow, upcoming] = await Promise.all([
    prisma.trainerProfile.count(),
    prisma.training.count(),
    // H2: a session in progress is the single most valuable thing we can show.
    prisma.session.findMany({
      where: {
        startsAtUtc: { lte: now },
        endsAtUtc: { gt: now },
        status: { not: 'cancelled' },
        training: { status: { in: ['live', 'full'] } },
      },
      include: { training: { include: { trainer: { select: { displayName: true } } } } },
      orderBy: { endsAtUtc: 'asc' },
      take: 4,
    }),
    prisma.session.findMany({
      where: { startsAtUtc: { gt: now }, status: { not: 'cancelled' }, training: { status: { in: ['live', 'full'] } } },
      include: { training: { include: { trainer: { select: { displayName: true } } } } },
      orderBy: { startsAtUtc: 'asc' },
      take: 3,
    }),
  ]);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return (
    <div className="wrap">
      <div className="topbar">
        <span className="logo">Learnovize</span>
        <nav>
          <Link className="btn link" href="/feed">Explore</Link>
          <Link className="btn link" href="/trainers">Trainers</Link>
          <Link className="btn link" href="/me/registrations">My seats</Link>
          <Link className="btn link" href="/login">Log in</Link>
          <Link className="btn primary" href="/signup">Sign up</Link>
        </nav>
      </div>
      <h1>{greet}.</h1>
      {trainerCount === 0 ? (
        // H1: cold start — no trainers yet. Say what is coming instead of counting zeroes.
        <p className="sub">
          Learnovize is opening its doors. Trainers are being onboarded now — join the list and you
          will be first to know when sessions go live.
        </p>
      ) : (
        <p className="sub">
          {trainerCount} trainer{trainerCount === 1 ? '' : 's'} · {trainingCount} training{trainingCount === 1 ? '' : 's'} live on Learnovize.
        </p>
      )}

      {liveNow.length > 0 && (
        <section
          aria-label="Happening now"
          style={{
            marginTop: 22,
            padding: 22,
            borderRadius: 'var(--radius)',
            color: '#fff',
            background: 'linear-gradient(135deg, #1B7E8D 0%, #156B78 60%, #0F5C68 100%)',
            boxShadow: 'var(--sh-3)',
          }}
        >
          <p style={{ margin: 0, fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', opacity: .9 }}>
            Happening now · {liveNow.length} live
          </p>
          <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
            {liveNow.map((s) => (
              <div key={s.id} style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 800, fontSize: 17 }}>{s.training.title}</div>
                  <div style={{ fontSize: 13, opacity: .88 }}>
                    {s.training.trainer.displayName} · ends {s.endsAtUtc.toUTCString().slice(17, 22)} UTC
                  </div>
                </div>
                <Link className="btn" href={`/classroom/${s.id}`} style={{ background: '#fff', color: '#0F5C68', borderColor: '#fff' }}>
                  Join now
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {liveNow.length === 0 && upcoming.length > 0 && (
        <div className="card" style={{ marginTop: 22 }}>
          <p className="eyebrow">Next sessions</p>
          <div style={{ display: 'grid', gap: 10 }}>
            {upcoming.map((s) => (
              <div key={s.id} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 700 }}>{s.training.title}</div>
                  <div className="muted" style={{ fontSize: 13 }}>{s.startsAtUtc.toUTCString().slice(0, 22)}</div>
                </div>
                <Link className="btn" href={`/t/${s.training.slug}/register`}>Reserve a seat</Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {liveNow.length === 0 && upcoming.length === 0 && (
        // H1/H3: nothing scheduled yet — route people to something that helps.
        <div className="card" style={{ marginTop: 22 }}>
          <p className="eyebrow">Nothing scheduled yet</p>
          <p className="bigtitle">Be the first</p>
          <p className="meta">
            No sessions are announced right now. Follow a trainer to hear the moment they go live, or
            host a training yourself.
          </p>
          <div className="btnrow">
            <Link className="btn primary" href="/trainers">Browse trainers</Link>
            <Link className="btn" href="/onboarding">Become a trainer</Link>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 22 }}>
        <p className="eyebrow">Up next · live only, no replays</p>
        <p className="bigtitle">Find a live training</p>
        <p className="meta">Browse trainers, follow them, and reserve your seat. Attendance is always free — only the certificate costs extra.</p>
        <div className="btnrow">
          <Link className="btn primary" href="/trainers">Browse trainers</Link>
          <Link className="btn" href="/onboarding">Become a trainer</Link>
          <Link className="btn" href="/trainings/new">Host a training</Link>
        </div>
      </div>
      <FirstRunGuide />
      <nav className="bottomnav"><div className="in">
        <Link href="/" className="on">🏠<br />Home</Link>
        <Link href="/trainers">📚<br />Trainers</Link>
        <Link href="/onboarding">🎥<br />Teach</Link>
        <Link href="/login">🏅<br />Account</Link>
      </div></nav>
    </div>
  );
}
