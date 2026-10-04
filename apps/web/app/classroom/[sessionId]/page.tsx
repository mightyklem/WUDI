import Link from 'next/link';
import ClassroomClient from '../ClassroomClient';

export const dynamic = 'force-dynamic';

export default async function ClassroomPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return (
    <div className="wrap">
      <div className="topbar"><span className="logo">Learnovize</span>
        <nav><Link className="btn link" href="/">Home</Link></nav>
      </div>
      <h1>Classroom.</h1>
      <p className="sub">Live only — this session is not recorded.</p>
      <ClassroomClient sessionId={sessionId} />
    </div>
  );
}
