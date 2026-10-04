'use client';

export function getAccess(): string | null {
  try { return localStorage.getItem('wudi_access'); } catch { return null; }
}
export function getRefresh(): string | null {
  try { return localStorage.getItem('wudi_refresh'); } catch { return null; }
}
export function saveSession(access: string, refresh: string) {
  localStorage.setItem('wudi_access', access);
  localStorage.setItem('wudi_refresh', refresh);
}
export function clearSession() {
  localStorage.removeItem('wudi_access');
  localStorage.removeItem('wudi_refresh');
}
// TODO(production): move tokens to httpOnly cookies set by the API instead of localStorage.
