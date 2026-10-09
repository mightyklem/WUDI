import { AccessToken, RoomServiceClient, WebhookReceiver } from 'livekit-server-sdk';

function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (see apps/web/.env.example)`);
  return v;
}

export function livekitEnv() {
  return {
    url: must('LIVEKIT_URL'),
    apiKey: must('LIVEKIT_API_KEY'),
    apiSecret: must('LIVEKIT_API_SECRET'),
  };
}

export type RoomRole = 'admin' | 'trainer' | 'moderator' | 'participant';

/** Mint a 2h room token with role-scoped grants (ADR-005). No recording path exists. */
export async function mintRoomToken(opts: {
  identity: string;
  name?: string;
  room: string;
  role: RoomRole;
  canPublishOverride?: boolean;
}): Promise<string> {
  const { apiKey, apiSecret } = livekitEnv();
  const at = new AccessToken(apiKey, apiSecret, {
    identity: opts.identity,
    name: opts.name,
    ttl: '2h',
    metadata: JSON.stringify({ role: opts.role }),
  });
  // Admin is moderator-equivalent in the room: able to mute and grant speech, because an
  // admin who arrives to settle a dispute usually has to be able to act, not just watch.
  // What admin deliberately does NOT get is the ability to end the session -- that stays
  // with the trainer whose class it is. That limit is enforced server-side in the
  // moderation route, not here.
  const canPublish = opts.role === 'trainer' || opts.role === 'moderator' || opts.role === 'admin'
    ? true
    : (opts.canPublishOverride ?? false);
  at.addGrant({
    roomJoin: true,
    room: opts.room,
    canPublish,
    canSubscribe: true,
    canPublishData: true,
    // NOTE: no roomAdmin / no egress grants — recording stays impossible (FR-6.7).
  });
  return at.toJwt();
}

export function roomService(): RoomServiceClient {
  const { url, apiKey, apiSecret } = livekitEnv();
  return new RoomServiceClient(url, apiKey, apiSecret);
}

/** Verify an incoming LiveKit webhook; returns the decoded event. */
export async function verifyWebhook(req: Request): Promise<{ event: string; room?: string; identity?: string; raw: unknown }> {
  const { apiKey, apiSecret } = livekitEnv();
  const receiver = new WebhookReceiver(apiKey, apiSecret);
  const body = await req.text();
  const auth = req.headers.get('authorization') || '';
  const event = await receiver.receive(body, auth);
  const e = event as { event: string; room?: { name?: string }; participant?: { identity?: string } };
  return { event: e.event, room: e.room?.name, identity: e.participant?.identity, raw: event };
}
