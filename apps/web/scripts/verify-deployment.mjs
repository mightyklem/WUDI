/**
 * Post-deploy verification against the live site.
 *
 * Run after every manual Netlify deploy:
 *
 *   node scripts/verify-deployment.mjs [baseUrl]
 *
 * Defaults to https://learnovize.com. Exits non-zero if anything is broken, so it can
 * gate a deploy rather than just print a report.
 *
 * The checks are the ones that have actually caught problems here: a stale build that
 * still serves 200 for a page it should have changed, a public/ directory that silently
 * did not get published, and a Content-Security-Policy that is absent because the
 * middleware did not run on the platform.
 */
const BASE = (process.argv[2] || 'https://learnovize.com').replace(/\/$/, '');

let failures = 0;
const warn = [];

function record(ok, label, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
  return ok;
}
function note(label, detail = '') {
  console.log(`  warn ${label}${detail ? '  — ' + detail : ''}`);
  warn.push(label);
}

async function status(path) {
  try {
    const r = await fetch(BASE + path, { redirect: 'follow' });
    return r.status;
  } catch (e) {
    return 0;
  }
}

console.log(`\nLearnovize deployment check — ${BASE}\n`);

// --- reachability -----------------------------------------------------------------
console.log('reachability');
const home = await fetch(BASE + '/', { redirect: 'follow' }).catch(() => null);
if (!record(!!home && home.ok, 'site responds', home ? `HTTP ${home.status}` : 'no response')) {
  console.log('\nNothing else can be checked. Exiting.\n');
  process.exit(1);
}

// --- PWA assets -------------------------------------------------------------------
console.log('\npwa assets');
for (const p of ['/manifest.webmanifest', '/sw.js', '/offline.html', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png']) {
  record((await status(p)) === 200, `serves ${p}`);
}

const html = await (await fetch(BASE + '/')).text();
record(html.includes('manifest.webmanifest'), 'homepage links the manifest');
record(html.includes('apple-touch-icon'), 'homepage links the apple touch icon');
record(html.includes('theme-color'), 'homepage sets theme-color');

// --- security headers -------------------------------------------------------------
console.log('\nsecurity headers');
const h = home.headers;
record(!!h.get('content-security-policy'), 'Content-Security-Policy present',
  h.get('content-security-policy') ? '' : 'middleware did not run, or an old build is deployed');
record(h.get('x-frame-options') === 'DENY', 'X-Frame-Options: DENY');
record(h.get('x-content-type-options') === 'nosniff', 'X-Content-Type-Options: nosniff');
record(!!h.get('referrer-policy'), 'Referrer-Policy present');
if (!h.get('strict-transport-security')) {
  note('Strict-Transport-Security absent', 'Netlify sets this by default; absent means plain HTTP is permitted');
}

// --- feature surfaces -------------------------------------------------------------
// Each of these pages was added by a specific commit. A 200 here proves the deploy
// included that work; a 404 means the build is older than it looks.
console.log('\nfeature surfaces');
const FEATURES = [
  ['/admin/verification', 'verification review queue'],
  ['/trainer/verification', 'paid verification purchase'],
  ['/onboarding', 'trainer application form'],
  ['/me/reviews', 'learner reviews'],
];
for (const [p, label] of FEATURES) {
  record((await status(p)) === 200, `${p}`, label);
}

// --- the application form is the thing most likely to be stale silently -----------
// The question text cannot be used here. /onboarding is a client component, so its
// server HTML is a loading shell -- "How did you pick it up?" only exists after
// hydration. Checking for it reported a false failure on a correct deployment.
//
// What is in the server HTML is the difference between the two versions: the old
// three-field form rendered "Become a trainer" and "short bio" server-side, and the
// new one renders a loading state. So the old form's wording is the reliable signal,
// and its absence is the pass condition.
const onboarding = await fetch(BASE + '/onboarding').then((r) => r.text()).catch(() => '');
if (onboarding) {
  const OLD_MARKERS = ['Become a trainer', 'short bio', 'Name, photo, bio, topics'];
  const staleBy = OLD_MARKERS.filter((m) => onboarding.includes(m));
  record(
    staleBy.length === 0,
    'onboarding is not the old form',
    staleBy.length ? `still serves: ${staleBy.join(', ')}` : 'old wording gone, new form in place',
  );
}

// --- api sanity -------------------------------------------------------------------
console.log('\napi');
record((await status('/api/trainers')) === 200, '/api/trainers responds');
record((await status('/api/me')) === 401, '/api/me refuses anonymous',
  'anything other than 401 means an endpoint is open');

console.log('');
if (warn.length) console.log(`${warn.length} warning(s)\n`);
if (failures) {
  console.log(`FAILED — ${failures} check(s) did not pass.`);
  console.log('If pages 404, the deploy is older than the commit that added them.\n');
  process.exit(1);
}
console.log('All checks passed.\n');
