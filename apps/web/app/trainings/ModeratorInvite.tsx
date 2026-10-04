'use client';
import { useState } from 'react';
import { getAccess } from '@/lib/client-auth';

export default function ModeratorInvite({ trainingId }: { trainingId: string }) {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const access = getAccess();
    if (!access) return setMsg('Log in as the trainer first.');
    const r = await fetch(`/api/trainings/${trainingId}/moderators`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
      body: JSON.stringify({ email }),
    });
    const j = await r.json();
    setMsg(r.ok ? `Invited ${email} as moderator.` : (j.error || 'Invite failed'));
  }
  async function accept() {
    const access = getAccess();
    if (!access) return setMsg('Log in first.');
    const r = await fetch('/api/moderators/accept', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
      body: JSON.stringify({ trainingId }),
    });
    const j = await r.json();
    setMsg(r.ok ? 'Moderator role active — join the classroom.' : (j.error || 'No pending invite'));
  }
  return (
    <div>
    <form onSubmit={invite}>
      <label className="fl">Invite moderator by email</label>
      <div className="btnrow" style={{ marginTop: 0 }}>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="mod@example.com" style={{ maxWidth: 260 }} />
        <button className="btn" type="submit">Invite</button>
      </div>
      {msg && <p className="muted">{msg}</p>}
    </form>
      <div className="btnrow"><button className="btn link" onClick={accept}>Accept my moderator invite</button></div>
    </div>
  );
}
