'use client';
import { useState } from 'react';
import { getAccess } from '@/lib/client-auth';

export default function RegisterButton({ trainingId, full, label }: { trainingId: string; full: boolean; label?: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  async function go() {
    const access = getAccess();
    if (!access) return setMsg('Log in first, then register.');
    const r = await fetch(`/api/trainings/${trainingId}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
      body: JSON.stringify({ certConsentPublic: true }),
    });
    const j = await r.json();
    if (!r.ok) return setMsg(j.error || 'Registration failed');
    setMsg('Registered! Confirmation in your inbox (simulated T-24h/T-1h).');
  }
  return (
    <span>
      <button className="btn primary" disabled={full} onClick={go}>{full ? 'Full' : label || 'Reserve seat'}</button>
      {msg && <p className="muted">{msg}</p>}
    </span>
  );
}
