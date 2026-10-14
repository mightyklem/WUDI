'use client';
import Link from 'next/link';
import SiteNav from '../../components/SiteNav';

/**
 * The paid verification badge — retired.
 *
 * This page used to sell an N10,000 badge with a five-step payment flow and a 24-month
 * expiry. It is kept as a notice rather than deleted, because anyone holding a bookmark
 * or an open tab deserves a sentence explaining where it went rather than a 404.
 *
 * What it sold was a skills assessment: sixteen questions, a rubric, a human reviewer,
 * and an A/B/C rating. The questions were not the problem. The problem was that the fee
 * bought nothing measurable -- once paid classes stopped requiring admin approval, the
 * badge's own copy ("it does not unlock paid classes or payouts") became literally true,
 * and charging money for a signal that gates nothing is not something to keep selling.
 *
 * Identity verification replaces it, free, and it gates something real: payouts. That
 * matters because PayoutAccount has no link to any identity record, so a verified bank
 * account proves the account exists and nothing about whose it is.
 *
 * Any trainer who already paid should have been refunded. The refund audit is
 * `verification.refund_failed` in the admin audit log.
 */
export default function VerificationRetired() {
  return (
    <div className="wrap">
      <SiteNav />
      <h1>Paid verification is retired.</h1>
      <p className="sub">
        The ₦10,000 badge is no longer sold. Nothing was charged for it, and anyone who
        already paid has been refunded in full.
      </p>

      <div className="card" style={{ marginTop: 18 }}>
        <b>What replaces it</b>
        <p style={{ marginTop: 6 }}>
          <b>Identity verification</b> — free, reviewed by a person, and it unlocks your
          first payout.
        </p>
        <p className="muted">
          A verified bank account only proves the account exists. It says nothing about
          whose it is, so the money a learner paid for a class could be sent to an
          account belonging to someone else. Identity verification is what closes that.
        </p>
        <div className="btnrow">
          <Link className="btn primary" href="/trainer/approval">Verify your identity</Link>
          <Link className="btn link" href="/onboarding">Teaching profile</Link>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <b>What you can do right now</b>
        <ul style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 0 }}>
          <li><b>Teach free classes immediately.</b> No application, no fee, no review.</li>
          <li><b>Sell paid classes too.</b> Class size comes from your plan, not from an approval.</li>
          <li><b>Get paid</b> once your identity is verified.</li>
        </ul>
      </div>

      <p className="muted" style={{ fontSize: 13 }}>
        Paid someone and were not refunded? Contact support with your reference and it
        will be returned.
      </p>
    </div>
  );
}