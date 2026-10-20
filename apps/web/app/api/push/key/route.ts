import { NextResponse } from 'next/server';
import { webPushPublicKey } from '@/lib/push-web';

export const dynamic = 'force-dynamic';

/**
 * GET /api/push/key → the VAPID public key
 *
 * The browser needs the public key to subscribe, and it is safe to ship -- it is the
 * public half of the pair, and the private half never leaves the server.
 *
 * Served from the server rather than baked into the bundle so that rotating the keypair
 * does not need a rebuild of the client.
 */
export async function GET() {
  const key = webPushPublicKey();
  if (!key) {
    // Push is simply not switched on for this deployment. The client shows the button as
    // unavailable rather than asking for a permission it can never use.
    return NextResponse.json(
      { enabled: false },
      { headers: { 'cache-control': 'no-store' } },
    );
  }
  return NextResponse.json(
    { enabled: true, publicKey: key },
    { headers: { 'cache-control': 'no-store' } },
  );
}