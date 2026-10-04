'use client';

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
// TODO(production): move tokens to httpOnly cookies set by the API instead of localStorage.
