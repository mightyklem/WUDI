import Link from 'next/link';
import SiteNav from '../components/SiteNav';

export const dynamic = 'force-static';

export default function Terms() {
  return (
    <div className="wrap">
      <SiteNav />
      <h1>Terms (draft).</h1>
      <p className="sub">Plain-words summary — final wording confirmed with a Nigerian lawyer before launch (§12.10).</p>
      <div className="card" style={{ marginTop: 18, fontSize: 15 }}>
        <p><b>1. Attendance is free.</b> Trainers cannot charge for entry. Only optional certification carries a price.</p>
        <p><b>2. Certificates confirm attendance and completion.</b> They are not government-accredited qualifications. Each carries a unique verifiable number that stays checkable even if revoked or if the trainer leaves.</p>
        <p><b>3. Refunds.</b> Full refund if the trainer cancels or never holds the class. Full refund (minus provider fee) if you cancel at least 24 hours before the start. No refund after that, or for missing the attendance minimum.</p>
        <p><b>4. Payouts.</b> Trainers are paid after the last session plus a short hold period, minus the provider fee and Learnovize commission (Free 5%, Pro 3%, Business 1%).</p>
        <p><b>5. Live only.</b> Sessions are not recorded and replays are not offered.</p>
        <p><b>6. Conduct.</b> Breaking the <Link href="/community">community rules</Link> can hide your posts, revoke certificates, or suspend your account.</p>
      </div>
    </div>
  );
}
