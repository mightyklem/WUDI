import { NextResponse } from 'next/server';
import { completeReset, passwordProblem } from '@/lib/password-reset';

export const dynamic = 'force-dynamic';

// POST /api/auth/reset-password { token, password }
//
// Consuming a token also revokes every existing refresh token for that account, so a
// thief who is already signed in loses the session the moment the real owner recovers.
// Without that, "I reset my password" would change nothing for an attacker.
export async function POST(req: Request) {
  const { token, password } = (await req.json().catch(() => ({}))) as {
    token?: string; password?: string;
  };

  const problem = passwordProblem(password || '');
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const result = await completeReset(token || '', password || '');
  if ('error' in result) {
    // One message for all three failure modes. Telling a caller whether a token was
    // "used" or "unknown" is a small oracle for guessing valid tokens.
    return NextResponse.json(
      { error: 'That reset link is no longer valid. Request a new one.' },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}