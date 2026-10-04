'use client';
import { useState } from 'react';
import { getAccess } from '@/lib/client-auth';

export default function Onboarding() {
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [topics, setTopics] = useState('energy, solar');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const access = getAccess();
    if (!access) return setMsg({ ok: false, text: 'Log in first, then complete your trainer profile.' });
    const r = await fetch('/api/trainer/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
      body: JSON.stringify({
        displayName, bio,
        topics: topics.split(',').map((t) => t.trim()).filter(Boolean),
      }),
    });
    const j = await r.json();
    if (!r.ok) return setMsg({ ok: false, text: j.error || 'Save failed' });
    setMsg({ ok: true, text: `Trainer profile live as “${j.profile.displayName}”. You can host free trainings immediately.` });
  }
  return (
    <div className="wrap">
      <h1>Become a trainer.</h1>
      <p className="sub">Name, photo, bio, topics — plus logo and signature for your certificates.</p>
      <form onSubmit={submit} className="card" style={{ marginTop: 18 }}>
        <label className="fl">Display name</label>
        <input type="text" required minLength={2} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Adaeze K." />
        <label className="fl">Short bio</label>
        <textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="What do you teach?" />
        <label className="fl">Topics (comma separated)</label>
        <input type="text" value={topics} onChange={(e) => setTopics(e.target.value)} />
        <p className="muted">Photo, logo and signature uploads land with Phase 2 file uploads (S3Mock → R2).</p>
        <div className="btnrow"><button className="btn primary" type="submit">Save trainer profile</button></div>
        {msg && <div className={msg.ok ? 'okmsg' : 'err'}>{msg.text}</div>}
      </form>
    </div>
  );
}
