#!/usr/bin/env node
/**
 * Check the deployment's configuration before it is built.
 *
 * A required environment variable that is missing on the site is the quietest kind of
 * failure there is. The build succeeds, the site serves, and the feature that needs the
 * variable throws a stack trace at one person on one screen at one moment -- which is
 * how a payout account could not be saved for a whole afternoon because one key was not
 * set on the deployment.
 *
 * So the check runs first, in the build, and it fails the build. A deploy that cannot
 * pay a trainer does not go out.
 *
 * It prints the name of anything that is wrong and the name of nothing that is right:
 * no values, no lengths, nothing that could be a secret.
 */

const REQUIRED = [
  { name: 'DATABASE_URL', why: 'the database' },
  { name: 'JWT_SECRET', why: 'signing in' },
  { name: 'PAYSTACK_SECRET_KEY', why: 'taking payments' },
  { name: 'PAYOUT_ENCRYPTION_KEY', why: 'sealing bank account numbers' },
  { name: 'S3_ENDPOINT', why: 'uploads' },
  { name: 'S3_ACCESS_KEY', why: 'uploads' },
  { name: 'S3_SECRET_KEY', why: 'uploads' },
  { name: 'S3_PUBLIC_BUCKET', why: 'uploads' },
  { name: 'S3_PRIVATE_BUCKET', why: 'private uploads' },
  { name: 'RESEND_API_KEY', why: 'email' },
  { name: 'LIVEKIT_URL', why: 'live classes' },
  { name: 'LIVEKIT_API_KEY', why: 'live classes' },
  { name: 'LIVEKIT_API_SECRET', why: 'live classes' },
];

/** Things that must be a particular shape, not merely present. */
const SHAPES = [
  {
    name: 'PAYOUT_ENCRYPTION_KEY',
    check: (v) => {
      const bytes = Buffer.from(v.trim(), 'base64');
      return bytes.length === 32
        ? null
        : `must be 32 bytes once base64-decoded (this one is ${bytes.length})`;
    },
  },
  {
    name: 'JWT_SECRET',
    check: (v) => (v.trim().length >= 16 ? null : 'must be at least 16 characters'),
  },
];

const missing = [];
const wrong = [];

for (const { name, why } of REQUIRED) {
  const v = process.env[name];
  if (!v || !v.trim()) missing.push(`${name} (needed for ${why})`);
}

for (const { name, check } of SHAPES) {
  const v = process.env[name];
  if (v && v.trim()) {
    const problem = check(v);
    if (problem) wrong.push(`${name} ${problem}`);
  }
}

if (missing.length || wrong.length) {
  console.error('\n  This deployment is not configured properly:\n');
  for (const m of missing) console.error(`    missing:  ${m}`);
  for (const w of wrong) console.error(`    invalid:  ${w}`);
  console.error(
    '\n  Set them in Netlify (Site configuration -> Environment) for the build,' +
      '\n  functions and runtime contexts, then deploy again. Nothing has been published.' +
      '\n',
  );
  // Only a published deployment is stopped. On a developer machine there is no site
  // to configure, and a build that cannot be done locally is a build nobody runs.
  if (process.env.NETLIFY) {
    process.exit(1);
  }
  console.log('  (not a Netlify build, so this is a warning rather than a failure)');
} else {
  console.log(`  configuration ok — ${REQUIRED.length} required settings are present.`);
}
