import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { createHash, randomBytes } from 'crypto';

const ACCESS_TTL = '15m';
const REFRESH_DAYS = 30;

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set (see apps/web/.env.example)');
  return new TextEncoder().encode(s);
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 12);
}

export async function checkPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

export async function signAccessToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(secret());
}

export async function verifyAccessToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Opaque refresh token; only sha256 is stored (see RefreshToken.tokenHash). */
export function newRefreshToken(): { token: string; tokenHash: string } {
  const token = randomBytes(48).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function refreshExpiry(): Date {
  return new Date(Date.now() + REFRESH_DAYS * 24 * 3600 * 1000);
}

export function getBearer(req: Request): string | null {
  const h = req.headers.get('authorization');
  if (!h?.startsWith('Bearer ')) return null;
  return h.slice(7);
}
