'use client';
import { useState } from 'react';
import { getAccess } from '@/lib/client-auth';

// Trainer composer for one training: upload a ≤60s video / image, or auto-generate the e-card.
export default function PostComposer({ trainingId }: { trainingId: string }) {
  const [type, setType] = useState('ecard');
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    const access = getAccess();
    if (!access) return setMsg('Log in as the trainer first.');
    const form = new FormData();
    form.append('trainingId', trainingId);
    form.append('type', type);
    if (file) form.append('file', file);
    const r = await fetch('/api/feed', { method: 'POST', headers: { authorization: `Bearer ${access}` }, body: form });
    const j = await r.json();
    setMsg(r.ok ? 'Post is live on Explore.' : (j.error || 'Publish failed'));
  }

  return (
    <form onSubmit={publish}>
      <div className="btnrow" style={{ marginTop: 0 }}>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="ecard">E-card (auto template)</option>
          <option value="video">Video ≤60s, ≤50MB mp4</option>
          <option value="infographic">Infographic image ≤5MB</option>
        </select>
        {type !== 'ecard' && <input type="file" accept={type === 'video' ? 'video/mp4' : 'image/jpeg,image/png'} onChange={(e) => setFile(e.target.files?.[0] || null)} />}
        <button className="btn primary" type="submit">Post to Explore</button>
      </div>
      {msg && <p className="muted">{msg}</p>}
    </form>
  );
}
