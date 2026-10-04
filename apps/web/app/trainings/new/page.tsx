'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAccess } from '@/lib/client-auth';

export default function NewTraining() {
  const router = useRouter();
  const [title, setTitle] = useState('Intro to Solar Installation');
  const [topic, setTopic] = useState('energy');
  const [description, setDescription] = useState('Live hands-on basics. No replays — attend live.');
  const [format, setFormat] = useState('video');
  const [certMode, setCertMode] = useState('free');
  const [minPct, setMinPct] = useState('80');
  const [cap, setCap] = useState('50');
  const [sessions, setSessions] = useState('2026-10-20T09:00,2026-10-20T11:00\n2026-10-21T09:00,2026-10-21T11:00');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const access = getAccess();
    if (!access) return setMsg({ ok: false, text: 'Log in as a trainer first.' });
    const parsed = sessions.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [a, b] = l.split(',').map((s) => s.trim());
      return { startsAtUtc: new Date(a).toISOString(), endsAtUtc: new Date(b).toISOString() };
    });
    const r = await fetch('/api/trainings', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
      body: JSON.stringify({
        title, topic, description, format, certMode,
        minPct: Number(minPct), cap: Number(cap), sessions: parsed,
      }),
    });
    const j = await r.json();
    if (!r.ok) return setMsg({ ok: false, text: j.error || 'Create failed' });
    router.push(`/trainings/${j.training.id}`);
  }

  return (
    <div className="wrap">
      <h1>New training.</h1>
      <p className="sub">An invite link with preview is generated on save.</p>
      <form onSubmit={submit} className="card" style={{ marginTop: 18 }}>
        <label className="fl">Title</label>
        <input type="text" required minLength={3} value={title} onChange={(e) => setTitle(e.target.value)} style={{ maxWidth: '100%' }} />
        <label className="fl">Topic</label>
        <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} />
        <label className="fl">Description</label>
        <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="btnrow">
          <span><label className="fl">Format</label><select value={format} onChange={(e) => setFormat(e.target.value)}><option value="video">Video + audio</option><option value="audio">Audio-only</option></select></span>
          <span><label className="fl">Certification</label><select value={certMode} onChange={(e) => setCertMode(e.target.value)}><option value="none">None</option><option value="free">Free cert</option><option value="paid">Paid cert (Phase 6)</option></select></span>
          <span><label className="fl">Min %</label><select value={minPct} onChange={(e) => setMinPct(e.target.value)}><option value="60">60%</option><option value="80">80% (default)</option><option value="100">100%</option></select></span>
          <span><label className="fl">Cap</label><input type="text" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value)} style={{ maxWidth: 100 }} /></span>
        </div>
        <label className="fl">Sessions (one per line: startISO,endISO — stored UTC, shown Africa/Lagos)</label>
        <textarea rows={3} value={sessions} onChange={(e) => setSessions(e.target.value)} style={{ maxWidth: '100%', fontFamily: 'monospace' }} />
        <div className="btnrow"><button className="btn primary" type="submit">Create + get invite link</button></div>
        {msg && <div className={msg.ok ? 'okmsg' : 'err'}>{msg.text}</div>}
      </form>
    </div>
  );
}
