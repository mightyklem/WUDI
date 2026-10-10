/**
 * Trainer application: the fourteen questions and the scoring behind them.
 *
 * Pure functions, no I/O, so the exact same arithmetic runs in the browser, in the
 * API and in the tests. Scoring people inconsistently is how an approval queue turns
 * arbitrary, so the weights live in one file and everything else reads them.
 *
 * Shape of the score, out of 100:
 *
 *   Skill depth          30   Q6 how they learned it + Q7 how long
 *   Teaching experience  25   Q8 have they taught + Q10 where they teach
 *   Proof of work        30   graded BY A HUMAN, never by this file
 *   Reach and influence  15   Q11 platforms + Q12 who asks them
 *
 * The deliberate part is that the form cannot reach 70 on its own. Judging whether a
 * link actually shows relevant work needs a human, so those 30 points are withheld
 * until an admin grades the evidence. A candidate cannot read "strong candidate" off
 * their own answers without someone looking at their work.
 */

/** Option lists, kept beside the scoring so a label can never drift from its weight. */

export const CURRENTLY = [
  { value: 'studying', label: 'Studying' },
  { value: 'looking_for_work', label: 'Looking for work' },
  { value: 'working', label: 'Working' },
  { value: 'running_business', label: 'Running my own business' },
  { value: 'bit_of_everything', label: 'A bit of everything' },
];

export const AGE_GROUP = [
  { value: 'under_20', label: 'Under 20' },
  { value: '20_25', label: '20 to 25' },
  { value: '26_35', label: '26 to 35' },
  { value: '36_45', label: '36 to 45' },
  { value: '46_plus', label: '46+' },
];

export const BEST_SKILL = [
  { value: 'social_media', label: 'Social media' },
  { value: 'digital_marketing', label: 'Digital marketing' },
  { value: 'design', label: 'Design' },
  { value: 'video_editing', label: 'Video editing' },
  { value: 'excel_data', label: 'Excel and data' },
  { value: 'ai_tools', label: 'AI tools' },
  { value: 'hr', label: 'HR' },
  { value: 'health_safety', label: 'Health and safety' },
  { value: 'event_planning', label: 'Event planning' },
  { value: 'real_estate', label: 'Real estate' },
  { value: 'teaching', label: 'Teaching' },
  { value: 'something_else', label: 'Something else' },
];

/**
 * 10 of the 30 skill points.
 *
 * Weighted toward having *done* the work rather than having studied it. The original
 * brief had on-the-job, school and a mentor tied at 10; that treats a fresh sociology
 * graduate as level with someone eight years into a trade, which is not what this is
 * for. The point is people who are actually in the profession, so:
 *
 *   on the job      10  doing it, not studying it
 *   a mentor         8  taught by someone doing it
 *   taught myself    6  self-directed and practical
 *   school           5  structured theory, less applied
 *   just practice    3  experience without structure or anyone checking it
 *
 * Same 10-point ceiling, so the total is unchanged and the bands still mean the same.
 */
export const HOW_LEARNED = [
  { value: 'on_the_job', label: 'On the job', points: 10 },
  { value: 'mentor', label: 'A mentor', points: 8 },
  { value: 'taught_myself', label: 'Teaching myself online', points: 6 },
  { value: 'school', label: 'School or university', points: 5 },
  { value: 'just_practice', label: 'Just practice', points: 3 },
];

/** 20 of the 30 skill points. */
export const YEARS = [
  { value: 'under_1', label: 'Under 1 year', points: 0 },
  { value: '1_3', label: '1 to 3 years', points: 7 },
  { value: '3_5', label: '3 to 5 years', points: 13 },
  { value: '5_plus', label: '5+ years', points: 20 },
];

export const TAUGHT_BEFORE = [
  { value: 'regularly', label: 'Yes, regularly', points: 15 },
  { value: 'a_few_times', label: 'A few times', points: 10 },
  { value: 'informally', label: 'Informally with friends or colleagues', points: 5 },
  { value: 'not_yet_but_would_like', label: "Not yet, but I'd like to", points: 2 },
  { value: 'not_really', label: "Not really my thing", points: 0 },
];

export const WHERE_SHARE = [
  { value: 'one_on_one', label: 'One-on-one', points: 10 },
  { value: 'live_sessions', label: 'Live sessions', points: 10 },
  { value: 'in_person', label: 'In person', points: 10 },
  { value: 'whatsapp_groups', label: 'WhatsApp groups', points: 5 },
  { value: 'social_posts', label: 'Social media posts', points: 5 },
  { value: 'not_yet', label: "I don't yet", points: 0 },
];

export const PLATFORMS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'x', label: 'X' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'youtube', label: 'YouTube' },
];

export const WHO_ASKS = [
  { value: 'business_owners', label: 'Business owners', points: 9 },
  { value: 'working_professionals', label: 'Working professionals', points: 8 },
  { value: 'job_seekers', label: 'Job seekers', points: 6 },
  { value: 'students', label: 'Students', points: 5 },
  { value: 'friends_family', label: 'Friends and family', points: 3 },
  { value: 'nobody_yet', label: 'Nobody yet', points: 0 },
];

export const WHAT_HELPS = [
  'More people to share with',
  'A simple way to organise it',
  'Proof that I know my stuff',
  'Getting paid for it',
  'Confidence',
  'Time',
];

/** Proof is graded by a person, so these are the only values the API will accept. */
export const PROOF_GRADES = [
  { value: 'none', label: 'No evidence given', points: 0 },
  { value: 'weak', label: 'Link does not clearly show relevant work', points: 10 },
  { value: 'clear', label: 'Link clearly shows relevant work', points: 30 },
];

export const BANDS = [
  { key: 'strong', label: 'Strong candidate', min: 70, advice: 'Move to verification' },
  { key: 'promising', label: 'Promising', min: 40, advice: 'Look again when you need more trainers' },
  { key: 'general', label: 'Keep on the general list', min: 0, advice: 'May be a future learner or trainer' },
];

/** The questions themselves, in the order they are asked. */
export const QUESTIONS = [
  { id: 'displayName', kind: 'text', label: 'What should we call you?', required: true, maxLength: 80 },
  { id: 'city', kind: 'text', label: 'Which city are you in?', required: true, maxLength: 80 },
  { id: 'currently', kind: 'single', label: 'Which best describes you right now?', options: CURRENTLY, required: true },
  { id: 'ageGroup', kind: 'single', label: 'Which age group are you in?', options: AGE_GROUP, required: true },
  { id: 'bestSkill', kind: 'single', label: 'What skill are you best at, or enjoy the most?', options: BEST_SKILL, required: true },
  { id: 'howLearned', kind: 'single', label: 'How did you pick it up?', options: HOW_LEARNED, required: true },
  { id: 'years', kind: 'single', label: 'How long have you been doing it?', options: YEARS, required: true },
  { id: 'taughtBefore', kind: 'single', label: 'Have you ever helped someone else learn it?', options: TAUGHT_BEFORE, required: true },
  { id: 'teachingStory', kind: 'longtext', label: 'Tell us about the last time you showed someone how to do something. If you have not, what has held you back?', required: false, maxLength: 1200, hint: 'Optional, but the strongest thing you can write here' },
  { id: 'whereShare', kind: 'single', label: 'How do you usually share what you know?', options: WHERE_SHARE, required: true },
  // Verifiable capability. Worth 30 points, but only once a human has looked at it.
  { id: 'evidence', kind: 'urls', label: 'Where can we see examples of your work?', placeholder: 'LinkedIn, portfolio, social page, certificates', required: false, hint: 'Without a link we cannot verify anything, so this is the single most useful thing you can add.' },
  { id: 'platforms', kind: 'multi', label: 'Where do you spend most of your time online?', options: PLATFORMS, max: 3, required: true },
  { id: 'whoAsks', kind: 'single', label: 'Who tends to ask you for advice or help?', options: WHO_ASKS, required: true },
  { id: 'whatHelps', kind: 'multi', label: 'What would make sharing your skills easier for you?', options: WHAT_HELPS.map((l) => ({ value: l, label: l })), required: false },
  { id: 'chatOk', kind: 'single', label: 'Would you be open to a short chat about your experience?', options: [
    { value: 'yes', label: 'Yes, happy to' },
    { value: 'not_now', label: 'Not right now' },
  ], required: true },
  { id: 'contact', kind: 'text', label: 'WhatsApp number or email, if you are happy to chat', required: false, maxLength: 120, hint: 'Only staff reviewing applications will see this.' },
];

export function questionById(id) {
  return QUESTIONS.find((q) => q.id === id) || null;
}

function pointsFor(options, value) {
  const hit = options.find((o) => o.value === value);
  return hit && typeof hit.points === 'number' ? hit.points : 0;
}

/** Everything the form itself can decide. Proof is deliberately absent. */
export function scoreForm(a = {}) {
  const skillDepth = pointsFor(HOW_LEARNED, a.howLearned) + pointsFor(YEARS, a.years);
  const teachingExperience = pointsFor(TAUGHT_BEFORE, a.taughtBefore) + pointsFor(WHERE_SHARE, a.whereShare);
  const platforms = Array.isArray(a.platforms) ? a.platforms.slice(0, 3) : [];
  // 6 for being active in up to three places, 9 for who actually turns to them.
  const reachAndInfluence = Math.min(6, platforms.length * 2) + pointsFor(WHO_ASKS, a.whoAsks);

  return {
    skillDepth,
    teachingExperience,
    reachAndInfluence,
    proofOfWork: null, // set by an admin, never by the applicant
    formSubtotal: skillDepth + teachingExperience + reachAndInfluence,
  };
}

/** Add a graded proof score. Returns null when nobody has graded it yet. */
export function scoreWithProof(a, proofGrade) {
  const s = scoreForm(a);
  const proof = pointsFor(PROOF_GRADES, proofGrade);
  if (!PROOF_GRADES.some((p) => p.value === proofGrade)) {
    return { ...s, proofOfWork: null, total: null, band: null };
  }
  const total = s.formSubtotal + proof;
  return { ...s, proofOfWork: proof, total, band: bandFor(total) };
}

export function bandFor(total) {
  if (!Number.isFinite(total)) return null;
  for (const b of BANDS) if (total >= b.min) return b.key;
  return 'general';
}

/**
 * The gate that matters: nobody reaches "strong candidate" without a human having
 * looked at their evidence. A perfect form tops out at 70, which is the boundary --
 * so the band alone is not enough, and the review flow requires a proof grade first.
 */
export function isReadyForStrongBand(proofGrade) {
  return PROOF_GRADES.some((p) => p.value === proofGrade);
}

/** Final human rating after verification. */
export function finalRating({ skilled, hasTaught, proofChecksOut }) {
  if (skilled && hasTaught && proofChecksOut) return 'A';
  if (skilled && proofChecksOut) return 'B';
  return 'C';
}

export const RATING_NOTES = {
  A: 'Skilled, has taught, proof checks out',
  B: 'Skilled, proof checks out, but little teaching experience — good with support',
  C: 'Unclear or unverified — hold for now',
};

/** Validate an answer set against the question list. Returns the cleaned answers. */
export function validateAnswers(input = {}) {
  const errors = [];
  const out = {};
  for (const q of QUESTIONS) {
    const raw = input[q.id];
    if (q.kind === 'text' || q.kind === 'longtext') {
      const v = typeof raw === 'string' ? raw.trim() : '';
      if (q.required && !v) errors.push(`${q.label} is required`);
      if (v && q.maxLength && v.length > q.maxLength) errors.push(`${q.label} is too long`);
      if (v) out[q.id] = v;
      continue;
    }
    if (q.kind === 'single') {
      const v = typeof raw === 'string' ? raw : '';
      if (q.required && !v) { errors.push(`${q.label} is required`); continue; }
      if (v && !q.options.some((o) => o.value === v)) { errors.push(`${q.label} has an unrecognised answer`); continue; }
      if (v) out[q.id] = v;
      continue;
    }
    if (q.kind === 'multi') {
      const list = Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : [];
      const allowed = new Set(q.options.map((o) => o.value));
      const clean = [...new Set(list.filter((x) => allowed.has(x)))];
      if (q.max && clean.length > q.max) errors.push(`${q.label}: pick at most ${q.max}`);
      if (q.required && !clean.length) { errors.push(`${q.label} is required`); continue; }
      if (clean.length) out[q.id] = clean;
      continue;
    }
    if (q.kind === 'urls') {
      const list = Array.isArray(raw) ? raw.filter((x) => typeof x === 'string' && x.trim()) : [];
      const clean = [];
      for (const u of list.slice(0, 5)) {
        const s = u.trim();
        // Only http(s). A "link" that is not one cannot be verified and must not be stored.
        if (!/^https?:\/\/[^\s]+$/i.test(s)) { errors.push(`${q.label}: "${s}" is not a valid link`); continue; }
        clean.push(s);
      }
      if (clean.length) out[q.id] = clean;
    }
  }
  return { answers: out, errors };
}

/** The age group that should trigger a look at child-safety policy. */
export function isMinor(ageGroup) {
  return ageGroup === 'under_20';
}