import Link from 'next/link';
import { prisma } from '@/lib/db';
import FirstVisitAuth from './FirstVisitAuth';

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
      <div className="surface surface-hero pat-weave rise">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span className="tile-icon tint-accent" aria-hidden>✨</span>
          <span style={{ fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--mut)', fontWeight: 700 }}>
            Live classes · no replays
          </span>
        </div>
        <h1 style={{ fontSize: 32, lineHeight: 1.12, maxWidth: 520 }}>{greet}.</h1>
        {trainerCount === 0 ? (
          <p className="sub" style={{ maxWidth: 460 }}>
            Learnovize is opening its doors. Trainers are being onboarded now.
          </p>
        ) : (
          <p className="sub" style={{ maxWidth: 460 }}>
            {trainerCount} trainer{trainerCount === 1 ? '' : 's'} · {trainingCount} class{trainingCount === 1 ? '' : 'es'} live now.
          </p>
        )}

        {/* Icon-led paths. Three doors, no paragraphs to read past. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginTop: 20 }}>
          {[
            { href: '/classes', icon: '📚', tint: 'tint-accent', label: 'Find a class', sub: 'Browse what is on' },
            { href: '/trainers', icon: '🤝', tint: 'tint-leaf', label: 'Follow trainers', sub: 'Hear when they go live' },
            { href: '/onboarding', icon: '🎥', tint: 'tint-gold', label: 'Teach here', sub: 'Host your own' },
          ].map((p, i) => (
            <Link key={p.href} href={p.href} className={`rise rise-${i + 1}`} style={{
              display: 'flex', alignItems: 'center', gap: 11, textDecoration: 'none',
              color: 'var(--ink)', background: 'rgba(255,255,255,.72)', border: '1px solid var(--line)',
              borderRadius: 'var(--r-md)', padding: '13px 14px', boxShadow: 'var(--sh-1)',
              transition: 'transform var(--dur-1) var(--ease), box-shadow var(--dur-2) var(--ease)',
            }}>
              <span className={`tile-icon ${p.tint}`} aria-hidden
                style={{ width: 40, height: 40, borderRadius: 'var(--r-sm)', fontSize: 19 }}>{p.icon}</span>
              <span style={{ minWidth: 0 }}>
                <b style={{ display: 'block', fontSize: 15 }}>{p.label}</b>
                <span className="muted" style={{ fontSize: 12 }}>{p.sub}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>

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
        <div className="card rise-1" style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span className="tile-icon tint-leaf" aria-hidden style={{ width: 38, height: 38, borderRadius: 'var(--r-sm)', fontSize: 18 }}>🗓</span>
            <b style={{ fontSize: 16 }}>Next sessions</b>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {upcoming.map((s) => (
              <div key={s.id} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 700 }}>{s.training.title}</div>
                  <div className="muted" style={{ fontSize: 13 }}>{s.startsAtUtc.toUTCString().slice(0, 22)}</div>
                </div>
                <Link className="btn primary" href={`/t/${s.training.slug}/register`}>Reserve a seat</Link>
              </div>
            ))}
          </div>
          <div className="btnrow"><Link className="btn link" href="/classes">See every class →</Link></div>
        </div>
      )}

      {liveNow.length === 0 && upcoming.length === 0 && (
        <div className="surface surface-hero pat-arcs" style={{ marginTop: 18, textAlign: 'center' }}>
          <span className="tile-icon tint-accent" aria-hidden>◈</span>
          <p className="bigtitle" style={{ marginTop: 12 }}>Nothing scheduled yet</p>
          <p className="sub" style={{ maxWidth: 420, margin: '6px auto 0' }}>
            Follow a trainer to hear the moment they go live.
          </p>
          <div className="btnrow" style={{ justifyContent: 'center' }}>
            <Link className="btn primary lg" href="/trainers">Browse trainers</Link>
            <Link className="btn lg" href="/onboarding">Teach here</Link>
          </div>
        </div>
      )}
      <FirstVisitAuth />
      <nav className="bottomnav"><div className="in">
        <Link href="/" className="on">🏠<br />Home</Link>
        <Link href="/trainers">📚<br />Trainers</Link>
        <Link href="/onboarding">🎥<br />Teach</Link>
        <Link href="/login">🏅<br />Account</Link>
      </div></nav>
    </div>
  );
}
