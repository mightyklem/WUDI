'use client';

/**
 * Session tokens on the client.
 *
 * The access token is short-lived by design, and the refresh endpoint that recovers from it
 * has existed since the auth layer was written without anything ever calling it. So every
 * time a token aged out mid-session, every request began failing with 401, each component
 * discovered the problem independently, and the person was dropped at the login page with no
 * explanation. A refresh token sitting unused in localStorage is a token that does nothing.
 */

export function getAccess(): string | null {
  try { return localStorage.getItem('learnovize_access'); } catch { return null; }
}
export function getRefresh(): string | null {
  try { return localStorage.getItem('learnovize_refresh'); } catch { return null; }
}
export function saveSession(access: string, refresh: string) {
  localStorage.setItem('learnovize_access', access);
  localStorage.setItem('learnovize_refresh', refresh);
}
export function clearSession() {
  localStorage.removeItem('learnovize_access');
  localStorage.removeItem('learnovize_refresh');
}

/**
 * Milliseconds until the access token expires, or null if it cannot be read.
 *
 * Read from the token itself rather than guessed from a timer, so a tab left open overnight
 * finds out it is unauthenticated before making a request that will fail, rather than after.
 */
export function accessExpiresInMs(): number | null {
  const token = getAccess();
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const claims = JSON.parse(atob(padded));
    if (typeof claims?.exp !== 'number') return null;
    return claims.exp * 1000 - Date.now();
  } catch {
    return null;
  }
}

/** True when the access token is gone, unreadable, or inside the refresh window. */
export function needsRefresh(skewMs = 60_000): boolean {
  const left = accessExpiresInMs();
  // Unreadable token: treat as needing a refresh rather than assuming it is fine. The cost
  // of guessing wrong here is one wasted refresh; the cost of guessing the other way is a
  // request that 401s for reasons we cannot explain.
  if (left === null) return true;
  return left <= skewMs;
}

/**
 * One refresh at a time, however many callers ask.
 *
 * This is a correctness requirement rather than an optimisation. /api/auth/refresh ROTATES:
 * it consumes the presented token and issues a new pair, and reuse of a consumed token is
 * treated as theft and revokes the entire chain. So five components refreshing in parallel
 * would present the same token five times, be told it was stolen, and log the person out --
 * precisely the moment several pages load at once, which is most of them.
 */
let refreshing: Promise<string | null> | null = null;

export function refreshAccess(): Promise<string | null> {
  if (refreshing) return refreshing;

  const refresh = getRefresh();
  if (!refresh) return Promise.resolve(null);

  refreshing = (async () => {
    try {
      const r = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refresh }),
      });
      if (!r.ok) return null;
      const j = await r.json();
      if (!j?.access || !j?.refresh) return null;
      saveSession(j.access, j.refresh);
      return j.access as string;
    } catch {
      return null;
    } finally {
      // Cleared in a finally so a thrown or failed refresh cannot wedge every later call
      // against a promise that will never settle.
      refreshing = null;
    }
  })();

  return refreshing;
}

/** True once a refresh has failed and there is nothing left to try. */
function sessionIsDead(): boolean {
  if (getRefresh()) return false;
  return true;
}

/**
 * fetch, with the token attached and one transparent retry after refreshing.
 *
 * Every authenticated call goes through here rather than assembling its own header, because
 * the pages had thirty-odd separate `fetch(... authorization: Bearer getAccess())` calls
 * that each handled a 401 by giving up. They disagreed about it, several of them fired at
 * once, and the result was a screen full of console errors and a redirect to login with no
 * actual logout having happened.
 *
 * A 401 after a successful retry means the token is not merely expired, and the only honest
 * response is to end the session and say so.
 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const send = async (token: string | null): Promise<Response> => {
    const headers = new Headers(init.headers);
    // Always dropped first, then set. A caller may still be passing its own `authorization`
    // header from before this existed; leaving it in place when we have no token would send
    // a stale one, which is the exact failure this whole path is here to remove.
    headers.delete('authorization');
    if (token) headers.set('authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers, cache: init.cache ?? 'no-store' });
  };

  let token = getAccess();
  if (needsRefresh()) token = (await refreshAccess()) ?? token;

  let res = await send(token);
  if (res.status !== 401) return res;

  // One retry after a fresh token. Guarded so a dead session cannot loop.
  if (token && getRefresh()) {
    const next = await refreshAccess();
    if (next) {
      res = await send(next);
      if (res.status !== 401) return res;
    }
  }

  if (sessionIsDead() && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    clearSession();
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }
  return res;
}