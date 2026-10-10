import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BANDS, PROOF_GRADES, QUESTIONS, bandFor, finalRating, isMinor, isReadyForStrongBand,
  scoreForm, scoreWithProof, validateAnswers,
} from '../../shared/src/trainer-application.js';

/** A candidate who answered everything as well as the form allows. */
const BEST = {
  howLearned: 'on_the_job', years: '5_plus',
  taughtBefore: 'regularly', whereShare: 'live_sessions',
  platforms: ['instagram', 'tiktok', 'linkedin'], whoAsks: 'business_owners',
};

test('the four areas are worth the documented maximums', () => {
  const s = scoreForm(BEST);
  assert.equal(s.skillDepth, 30, 'skill depth caps at 30 (10 + 20)');
  assert.equal(s.teachingExperience, 25, 'teaching experience caps at 25 (15 + 10)');
  assert.equal(s.reachAndInfluence, 15, 'reach caps at 15 (6 + 9)');
});

test('the form alone cannot produce a proof score or a total', () => {
  const s = scoreForm(BEST);
  assert.equal(s.proofOfWork, null, 'nobody grades their own proof');
  assert.equal(s.formSubtotal, 70);
});

test('a perfect form tops out at 70 without a proof grade', () => {
  // The whole design: 30 points are withheld until a human looks.
  assert.equal(scoreForm(BEST).formSubtotal, 70);
  assert.equal(scoreWithProof(BEST, undefined).total, null);
});

test('grading proof produces a total and a band', () => {
  const r = scoreWithProof(BEST, 'clear');
  assert.equal(r.proofOfWork, 30);
  assert.equal(r.total, 100);
  assert.equal(r.band, 'strong');
});

test('no proof grade means no strong band, however good the answers', () => {
  assert.equal(isReadyForStrongBand(undefined), false);
  assert.equal(isReadyForStrongBand(null), false);
  assert.equal(isReadyForStrongBand('none'), true, '"no evidence" is still a grade — it just scores 0');
  assert.equal(isReadyForStrongBand('nonsense'), false, 'a made-up grade is not a grade');
});

test('bands fall where the brief says', () => {
  assert.equal(bandFor(100), 'strong');
  assert.equal(bandFor(70), 'strong');
  assert.equal(bandFor(69), 'promising');
  assert.equal(bandFor(40), 'promising');
  assert.equal(bandFor(39), 'general');
  assert.equal(bandFor(0), 'general');
  assert.equal(bandFor(NaN), null);
});

test('"not yet, but I would like to" is a real group, not a zero', () => {
  // The brief calls this out explicitly: skilled people with nowhere to teach.
  const s = scoreForm({ ...BEST, taughtBefore: 'not_yet_but_would_like' });
  assert.equal(s.teachingExperience, 12, '2 for willingness + 10 for live sessions');
  assert.ok(s.formSubtotal > 0);
});

test('platforms are capped at three even if more are sent', () => {
  const s = scoreForm({ ...BEST, platforms: ['a', 'b', 'c', 'd', 'e', 'f'] });
  assert.equal(s.reachAndInfluence, 15, 'still capped at 6 for platforms');
});

test('nothing is awarded for an unrecognised answer', () => {
  // A crafted payload must not be able to score itself higher.
  const s = scoreForm({ ...BEST, years: 'ten_thousand_years', howLearned: 'vibes' });
  assert.equal(s.skillDepth, 0);
});

test('empty answers score zero rather than throwing', () => {
  const s = scoreForm();
  assert.equal(s.formSubtotal, 0);
  assert.equal(scoreForm(undefined).formSubtotal, 0);
});

test('only http(s) evidence links are accepted', () => {
  // Every other required question is also missing here, so count only the evidence
  // complaints rather than the whole error list.
  const evidenceErrors = (r) => r.errors.filter((e) => e.includes('examples of your work'));

  const bad = validateAnswers({ evidence: ['javascript:alert(1)', 'not a url', 'ftp://x'] });
  assert.equal(bad.answers.evidence, undefined, 'no evidence stored from a non-link');
  assert.equal(evidenceErrors(bad).length, 3, 'all three rejected');

  const good = validateAnswers({ evidence: ['https://linkedin.com/in/someone'] });
  assert.deepEqual(good.answers.evidence, ['https://linkedin.com/in/someone']);
  assert.equal(evidenceErrors(good).length, 0);
});

test('required questions are enforced, optional ones are not', () => {
  const r = validateAnswers({});
  const requiredIds = QUESTIONS.filter((q) => q.required).map((q) => q.label);
  assert.equal(r.errors.length, requiredIds.length, 'one error per missing required question');
  // Optional free text must not block anyone.
  assert.ok(!r.errors.some((e) => e.includes('held you back')));
});

test('too many multi-select answers are refused', () => {
  const r = validateAnswers({ platforms: ['instagram', 'tiktok', 'linkedin', 'x'] });
  assert.ok(r.errors.some((e) => e.includes('at most 3')));
});

test('a full valid application passes with no errors', () => {
  const r = validateAnswers({
    displayName: 'Adaeze K.', city: 'Lagos', currently: 'working',
    ageGroup: '26_35', bestSkill: 'digital_marketing', howLearned: 'on_the_job',
    years: '5_plus', taughtBefore: 'regularly', teachingStory: 'Ran a 6-week cohort.',
    whereShare: 'live_sessions', evidence: ['https://example.com/work'],
    platforms: ['instagram', 'whatsapp'], whoAsks: 'business_owners',
    whatHelps: ['Getting paid for it'], chatOk: 'yes', contact: 'adaeze@example.com',
  });
  assert.deepEqual(r.errors, []);
});

test('contact details survive validation', () => {
  const r = validateAnswers({ contact: '08012345678' });
  assert.equal(r.answers.contact, '08012345678');
});

test('the final rating matches the brief', () => {
  assert.equal(finalRating({ skilled: true, hasTaught: true, proofChecksOut: true }), 'A');
  assert.equal(finalRating({ skilled: true, hasTaught: false, proofChecksOut: true }), 'B');
  assert.equal(finalRating({ skilled: true, hasTaught: true, proofChecksOut: false }), 'C');
  assert.equal(finalRating({ skilled: false, hasTaught: true, proofChecksOut: true }), 'C');
});

test('proof grades are exactly the three a human may pick', () => {
  assert.deepEqual(PROOF_GRADES.map((p) => p.value), ['none', 'weak', 'clear']);
  assert.deepEqual(PROOF_GRADES.map((p) => p.points), [0, 10, 30]);
});

test('bands are ordered and cover the whole range', () => {
  for (let i = 1; i < BANDS.length; i++) {
    assert.ok(BANDS[i].min < BANDS[i - 1].min, 'bands must descend');
  }
});

test('under 20 is flagged for child-safety review', () => {
  assert.equal(isMinor('under_20'), true);
  assert.equal(isMinor('20_25'), false);
  assert.equal(isMinor(undefined), false);
});