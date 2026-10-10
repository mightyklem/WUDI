'use client';
import { useEffect, useState } from 'react';
import { getAccess } from '@/lib/client-auth';
import SiteNav from '../../components/SiteNav';
import VerifiedBadge from '../../components/VerifiedBadge';

type State = {
  application: {
    status: string; formSubtotal: number; finalRating: string | null;
    reviewNotes: string | null; paidAt: string | null; amountPaidNgn: number | null;
    refundPending: boolean; badgeExpiresAt: string | null;
  } | null;
  badge: { verified: boolean; expired?: boolean; rating?: string | null; label: string | null };
  feeNgn: number;
};

const STATUS_TEXT: Record<string, string> = {
  draft: 'Not submitted yet',
  submitted: 'Waiting for a reviewer',
  in_review: 'Under review',
  verified: 'Verified',
  rejected: 'Not verified',
};

export default function TrainerVerification() {
  const [state, setState] = useState<State | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    const access = getAccess();
    if (!access) return;
    fetch('/api/trainer/verification', { headers: { authorization: `Bearer ${access}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setState(j));
  }
  useEffect(load, []);

  async function buy() {
    setBusy(true); setMsg(null);
    const access = getAccess();
    if (!access) return;
    const r = await fetch('/api/trainer/verification/checkout', {
      method: 'POST', headers: { authorization: `Bearer ${access}` },
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.url) { window.location.href = j.url; return; }
    setBusy(false);
    setMsg(j.error || 'Could not start checkout.');
  }

  if (!state) return <div className="wrap"><p className="muted">Loading…</p></div>;

  const app = state.application;
  const paid = !!(app?.paidAt);
  const decided = app?.status === 'verified' || app?.status === 'rejected';

  return (
    <div className="wrap">
      <SiteNav />
      <h1>Get verified.</h1>
      <p className="sub">
        Teaching on Learnovize is free and always will be. The verified badge is optional: it
        tells learners we have checked your work and your evidence ourselves.
      </p>

      {msg && <div className="err">{msg}</div>}

      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <b>{app ? (STATUS_TEXT[app.status] || app.status) : 'Not started'}</b>
            <VerifiedBadge state={state.badge} />
          </div>
          {app && (
            <div className="muted" style={{ fontSize: 13 }}>
              {app.formSubtotal > 0 && <>Form score {app.formSubtotal}/70<br /></>}
              {app.badgeExpiresAt && <>Valid until {new Date(app.badgeExpiresAt).toLocaleDateString()}</>}
            </div>
          )}
        </div>

        {app?.refundPending && (
          <div className="err" style={{ marginTop: 12 }}>
            Your refund did not go through and is still owed to you. Our team has been
            notified — you do not need to pay again.
          </div>
        )}

        {app?.status === 'rejected' && (
          <div className="err" style={{ marginTop: 12 }}>
            <b>We could not verify this application.</b>
            <div style={{ marginTop: 6 }}>{app.reviewNotes || 'No reason was recorded.'}</div>
            <div style={{ marginTop: 6 }}>
              {paid ? 'Your fee has been refunded in full.' : ''} You can strengthen your
              evidence and apply again.
            </div>
          </div>
        )}

        {app?.status === 'verified' && app.reviewNotes && (
          <p style={{ marginTop: 12 }}><b>Reviewer note:</b> {app.reviewNotes}</p>
        )}

        <div className="btnrow" style={{ marginTop: 14 }}>
          {!app || app.status === 'draft' ? (
            <a className="btn primary" href="/onboarding">Start your application</a>
          ) : app.status === 'submitted' || app.status === 'in_review' ? (
            <span className="muted">
              We have your application. Reviews are done by a person, usually within a few days.
            </span>
          ) : null}

          {app?.status === 'rejected' && (
            <a className="btn primary" href="/onboarding">Update your application</a>
          )}

          {(!decided) && (
            <button className="btn primary" disabled={busy} onClick={buy}>
              {paid ? 'Payment received — waiting on your application' : `Apply for verification — ₦${state.feeNgn.toLocaleString()}`}
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <b>What the badge does and does not mean.</b>
        <ul style={{ fontSize: 14, lineHeight: 1.6 }}>
          <li>A person reviewed your work and your evidence. That is all it means.</li>
          <li>
            Paying does not buy the badge — it opens the review. If your evidence does not
            hold up, you are turned down and <b>refunded in full</b>.
          </li>
          <li>It is a trust signal for learners. It does not unlock paid classes or payouts.</li>
          <li>It lasts 24 months, then needs renewing.</li>
        </ul>
      </div>
    </div>
  );
}