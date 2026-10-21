/**
 * What this deployment is configured for.
 *
 * A required setting that is missing on a site is the quietest kind of failure there
 * is. The build succeeds, the site serves, and the one feature that needed the setting
 * throws at one person on one screen at one moment. That is how a bank account could
 * not be saved for an afternoon while the error said nothing about why.
 *
 * So the check runs at build time, and this is the same list at run time, for the
 * person who is allowed to look at it.
 *
 * The names of the settings are reported. Their values never are, and never leave the
 * server.
 */

export type ConfigSetting = {
  name: string;
  why: string;
  present: boolean;
  /** Set when the setting is there but the wrong shape. */
  problem?: string;
};

export type ConfigReport = {
  ok: boolean;
  settings: ConfigSetting[];
  /** The payout key has to decode to 32 bytes, not merely be there. */
  payoutsReady: boolean;
};

const REQUIRED: { name: string; why: string }[] = [
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

/** The payout key, and whether it is the right length to seal anything with. */
function payoutKeyProblem(): string | null {
  const raw = process.env.PAYOUT_ENCRYPTION_KEY;
  if (!raw) return 'not set';
  const bytes = Buffer.from(raw.trim(), 'base64').length;
  return bytes === 32 ? null : `decodes to ${bytes} bytes, needs 32`;
}

/** The same list the build checks, read at run time. */
export function configReport(): ConfigReport {
  const settings: ConfigSetting[] = REQUIRED.map(({ name, why }) => {
    const v = process.env[name];
    const present = !!(v && v.trim());
    return { name, why, present };
  });

  const keyProblem = payoutKeyProblem();
  const key = settings.find((s) => s.name === 'PAYOUT_ENCRYPTION_KEY');
  if (key) {
    if (!key.present) key.problem = 'not set';
    else if (keyProblem) key.problem = keyProblem;
  }

  return {
    ok: settings.every((s) => s.present) && !keyProblem,
    settings,
    payoutsReady: !keyProblem,
  };
}
