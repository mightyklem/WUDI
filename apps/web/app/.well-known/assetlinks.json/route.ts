import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Digital Asset Links for the Android app (Trusted Web Activity).
 *
 * Chrome and Play verify that the app at `package_name` is authorised to open this
 * site fullscreen by fetching this exact path. The fingerprints must be the SHA-256
 * of the certificate that signed the APK/AAB, in colon-separated uppercase hex.
 *
 * They come from the environment because they belong to the signing key, not the
 * code: `TWA_SHA256_FINGERPRINTS="AA:BB:...,CC:DD:..."`. The Android release workflow
 * prints the fingerprint of whatever key signed the build into the run summary and
 * the release notes, so copy it from there into the Netlify environment.
 *
 * Until a fingerprint is configured this returns an empty list, which is valid but
 * verifies nothing -- the app still installs and runs, it just keeps the browser
 * address bar until the statement matches.
 */
const PACKAGE_NAME = 'ng.learnovize.app';

export async function GET() {
  const fingerprints = (process.env.TWA_SHA256_FINGERPRINTS || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return NextResponse.json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: PACKAGE_NAME,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ]);
}
