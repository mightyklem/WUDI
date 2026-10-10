import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BADGE_VALID_MONTHS, VERIFICATION_FEE_NGN, badgeExpiry, badgeState, canPurchaseBadge,
  refundDecisionForReview,
} from '../../../apps/web/lib/verification.ts';

const VERIFIED = {
  status: 'verified', finalRating: 'A', badgeExpiresAt: new Date(Date.now() + 86400000),
};

test('a verified application shows the badge', () => {
  const b = badgeState(VERIFIED);
  assert.equal(b.verified, true);
  assert.match(b.label, /A/);
});

test('no application means no badge', () => {
  assert.equal(badgeState(null).verified, false);
});

test('an unverified application never shows a badge, whatever it says', () => {
  for (const status of ['draft', 'submitted', 'in_review', 'rejected']) {
    assert.equal(badgeState({ ...VERIFIED, status }).verified, false, status);
  }
});

test('an expired badge is lapsed, not denied', () => {
  // Different message: this person WAS verified and needs renewing, which is not the
  // same as never having been checked.
  const b = badgeState({ ...VERIFIED, badgeExpiresAt: new Date(Date.now() - 1000) });
  assert.equal(b.verified, false);
  assert.equal(b.expired, true);
  assert.equal(b.reason, 'expired');
});

test('paying does not produce a badge', () => {
  // The whole point. Paid, submitted, unreviewed -- still no badge.
  const paid = { status: 'submitted', paidAt: new Date(), amountPaidNgn: 10000 };
  assert.equal(badgeState(paid).verified, false);
});

test('a rejected applicant is refunded in full', () => {
  const r = refundDecisionForReview({ approved: false, paidNgn: 10000 });
  assert.equal(r.refund, true);
  assert.equal(r.amountNgn, 10000, 'the whole fee, not a share of it');
});

test('an approved applicant is not refunded', () => {
  assert.equal(refundDecisionForReview({ approved: true, paidNgn: 10000 }).refund, false);
});

test('nothing is refunded when nothing was paid', () => {
  assert.equal(refundDecisionForReview({ approved: false, paidNgn: 0 }).refund, false);
});

test('one purchase per application', () => {
  assert.equal(canPurchaseBadge(null).ok, true);
  assert.equal(canPurchaseBadge({ paidAt: new Date(), status: 'submitted' }).ok, false);
  // Having been turned down, they may try again.
  assert.equal(canPurchaseBadge({ paidAt: new Date(), status: 'rejected', refundedAt: new Date() }).ok, true);
});

test('pricing defaults are sane and overridable', () => {
  assert.ok(VERIFICATION_FEE_NGN >= 5000, 'should not be so low that review cost is not covered');
  assert.ok(BADGE_VALID_MONTHS >= 12);
});

test('the badge expires in the future', () => {
  const e = badgeExpiry();
  assert.ok(e.getTime() > Date.now(), 'expiry must be ahead of now');
});