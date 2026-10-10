import Link from 'next/link';
import SiteNav from '../components/SiteNav';

export const dynamic = 'force-static';

export default function Privacy() {
  return (
    <div className="wrap">
      <SiteNav />
      <h1>Privacy (draft).</h1>
      <p className="sub">Plain-words summary under the Nigeria Data Protection Act 2023 — final wording confirmed with counsel before launch.</p>
      <div className="card" style={{ marginTop: 18, fontSize: 15 }}>
        <p><b>1. What we store.</b> Account details, trainings, registrations, attendance logs, payments, and certificates.</p>
        <p><b>2. Trainer IDs.</b> Identity documents are stored encrypted in a private bucket, used only for paid-certification approval, and auto-purged after a decision window. Access is logged.</p>
        <p><b>3. Certificate verification.</b> Your name appears on the public verification page only if you tick the consent box at registration.</p>
        <p><b>4. Your rights.</b> Access, correction, and deletion requests go to support; breaches are reported as the NDPA requires.</p>
      </div>
    </div>
  );
}
