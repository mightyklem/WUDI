import Link from 'next/link';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [trainerCount, trainingCount] = await Promise.all([
    prisma.trainerProfile.count(),
    prisma.training.count(),
  ]);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return (
    <div className="wrap">
      <div className="topbar">
        <span className="logo">Learnovize</span>
        <nav>
          <Link className="btn link" href="/trainers">Trainers</Link>
          <Link className="btn link" href="/me/registrations">My seats</Link>
          <Link className="btn link" href="/login">Log in</Link>
          <Link className="btn primary" href="/signup">Sign up</Link>
        </nav>
      </div>
      <h1>{greet}.</h1>
      <p className="sub">
        {trainerCount} trainer{trainerCount === 1 ? '' : 's'} · {trainingCount} training{trainingCount === 1 ? '' : 's'} live on Learnovize.
      </p>
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
      <h2 className="sec">How it works</h2>
      <div className="grid2">
        <div className="course"><span className="status">Step 1</span><span className="ctitle">Register free</span><span className="cmeta">One invite link. Seats close automatically at the cap.</span></div>
        <div className="course"><span className="status">Step 2</span><span className="ctitle">Attend live</span><span className="cmeta">Present means staying 75%+ of the session. Progress shown live.</span></div>
        <div className="course"><span className="status">Step 3</span><span className="ctitle">Earn a certificate</span><span className="cmeta">Meet the minimum, get approved, verify online with a unique number.</span></div>
        <div className="course"><span className="status">Trust</span><span className="ctitle">Verifiable forever</span><span className="cmeta">Employers check any number — revoked certs show as revoked.</span></div>
      </div>
      <nav className="bottomnav"><div className="in">
        <Link href="/" className="on">🏠<br />Home</Link>
        <Link href="/trainers">📚<br />Trainers</Link>
        <Link href="/onboarding">🎥<br />Teach</Link>
        <Link href="/login">🏅<br />Account</Link>
      </div></nav>
    </div>
  );
}
