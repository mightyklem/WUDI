'use client';

import { useCallback, useEffect, useState } from 'react';
import { authFetch, getAccess } from '@/lib/client-auth';
import { formatNgn } from '@learnovize/shared';

// Mirrors MATERIAL_RIGHTS_TEXT in lib/material-settle.ts. Kept as a literal
// here because that module pulls in Prisma and must never enter the client bundle.
const RIGHTS_TEXT =
  'I confirm this file is my own work or I am licensed to sell it, and it does not infringe anyone’s copyright.';

export type MaterialRow = {
  id: string; title: string; description: string | null; mime: string;
  sizeBytes: number; priceNgn: number; status: string; createdAt: string; owned?: boolean;
};

function sizeLabel(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}

async function download(id: string, title: string): Promise<string | null> {
  const access = getAccess();
  if (!access) return 'Sign in first.';
  const r = await authFetch(`/api/materials/${id}/download`, {
    headers: { authorization: `Bearer ${access}` },
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    return j.error || 'Download failed.';
  }
  const blob = await r.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = title.replace(/[^a-z0-9]+/gi, '-').slice(0, 60);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return null;
}

/**
 * What a visitor sees on a trainer's page: the shelf, with Get / Buy /
 * Download on each item. Free items grant on first download; paid ones open
 * Paystack (or grant immediately on the dev mock provider).
 */
export function TrainerMaterials({ trainerId }: { trainerId: string }) {
  const [rows, setRows] = useState<MaterialRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await authFetch(`/api/materials?trainerId=${encodeURIComponent(trainerId)}`);
    if (r.ok) {
      const j = await r.json();
      setRows(j.materials || []);
    } else {
      setRows([]);
    }
  }, [trainerId]);

  useEffect(() => { load(); }, [load]);

  if (rows === null) return <p className="muted">Loading materials…</p>;
  if (rows.length === 0) return null;

  async function buy(m: MaterialRow) {
    setBusy(m.id);
    setNote(null);
    try {
      const access = getAccess();
      if (!access) {
        setNote('Sign in first.');
        return;
      }
      const r = await authFetch(`/api/materials/${m.id}/purchase`, {
        method: 'POST',
        headers: { authorization: `Bearer ${access}` },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setNote(j.error || 'Could not start checkout.');
        return;
      }
      if (j.granted) {
        setNote(j.mock ? 'Granted (test payment).' : 'Yours now.');
        await load();
        return;
      }
      if (j.payUrl) {
        window.location.href = j.payUrl as string;
        return;
      }
      setNote('Checkout started — check your email to complete payment.');
    } finally {
      setBusy(null);
    }
  }

  async function take(m: MaterialRow) {
    setBusy(m.id);
    const problem = await download(m.id, m.title);
    setBusy(null);
    if (problem) setNote(problem);
    else await load();
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <b>Materials</b>
      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
      {rows.map((m) => (
        <div key={m.id} className="card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ margin: 0, fontWeight: 800 }}>{m.title}</p>
              {m.description && (
                <p className="muted" style={{ margin: '4px 0 0', fontSize: 'var(--t-sm)' }}>{m.description}</p>
              )}
              <p className="muted" style={{ margin: '6px 0 0', fontSize: 'var(--t-xs)' }}>
                {sizeLabel(m.sizeBytes)} · {m.priceNgn <= 0 ? 'Free' : formatNgn(m.priceNgn)}
              </p>
            </div>
            {m.owned ? (
              <button className="btn" disabled={busy === m.id} onClick={() => take(m)}>
                {busy === m.id ? '…' : 'Download'}
              </button>
            ) : m.priceNgn <= 0 ? (
              <button className="btn primary" disabled={busy === m.id} onClick={() => take(m)}>
                {busy === m.id ? '…' : 'Get free'}
              </button>
            ) : (
              <button className="btn primary" disabled={busy === m.id} onClick={() => buy(m)}>
                {busy === m.id ? '…' : `Buy · ${formatNgn(m.priceNgn)}`}
              </button>
            )}
            <button
              className="btn link"
              style={{ minHeight: 0, padding: '0 8px' }}
              onClick={async () => {
                const reason = prompt('Why are you reporting this material? (e.g. stolen content)') || '';
                if (!reason) return;
                const access = getAccess();
                if (!access) {
                  setNote('Sign in first.');
                  return;
                }
                await authFetch('/api/reports', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
                  body: JSON.stringify({ targetType: 'material', targetId: m.id, reason }),
                });
                setNote('Reported — moderators will review.');
              }}
            >
              Report
            </button>
          </div>
        </div>
      ))}
      {note && <p className="muted" style={{ fontSize: 'var(--t-sm)' }}>{note}</p>}
      </div>
    </div>
  );
}

/**
 * What the trainer sees on their own profile: upload form plus the shelf
 * with take-down on each item. Files go to private storage; buyers only ever
 * receive bytes through the download route.
 */
export function MyMaterials({ trainerId }: { trainerId: string }) {
  const [rows, setRows] = useState<MaterialRow[] | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('0');
  const [file, setFile] = useState<File | null>(null);
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const access = getAccess();
    if (!access) return;
    const r = await authFetch(`/api/materials?trainerId=${encodeURIComponent(trainerId)}`, {
      headers: { authorization: `Bearer ${access}` },
    });
    if (r.ok) {
      const j = await r.json();
      setRows(j.materials || []);
    }
  }, [trainerId]);

  useEffect(() => { load(); }, [load]);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProgress(null);
    setNote(null);
    try {
      const access = getAccess();
      if (!access) {
        setNote('Sign in first.');
        return;
      }
      if (!file) {
        setNote('Choose a file first.');
        return;
      }
      if (!rights) {
        setNote('Confirm the rights statement first.');
        return;
      }
      // Video always uploads direct to storage (presigned PUT, 1GB cap):
      // pushing a video through the API route would hit the function payload
      // limit. Everything 50MB and under goes the classic multipart way.
      const direct = file.type === 'video/mp4' || file.size > 50 * 1024 * 1024;
      if (!direct) {
        const form = new FormData();
        form.append('file', file);
        form.append('title', title);
        form.append('description', description);
        form.append('priceNgn', price);
        form.append('rights', 'yes');
        const r = await authFetch('/api/materials', {
          method: 'POST',
          headers: { authorization: `Bearer ${access}` },
          body: form,
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          setNote(j.error || 'Upload failed.');
          return;
        }
        done(j.note || 'On your shelf.');
        return;
      }
      const init = await authFetch('/api/materials/upload-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
        body: JSON.stringify({
          title, description, priceNgn: Number(price) || 0,
          mime: file.type, sizeBytes: file.size, rightsConfirmed: true,
        }),
      });
      const ij = await init.json().catch(() => ({}));
      if (!init.ok) {
        setNote(ij.localOnly ? 'Direct upload needs cloud storage — keep videos under 50MB here.' : (ij.error || 'Upload failed.'));
        return;
      }
      try {
        await putFile(ij.url as string, file, (p) => setProgress(p));
      } catch (e) {
        setNote(e instanceof Error ? e.message : 'Upload failed.');
        return;
      }
      const fin = await authFetch(`/api/materials/${ij.id}/complete`, {
        method: 'POST',
        headers: { authorization: `Bearer ${access}` },
      });
      const fj = await fin.json().catch(() => ({}));
      if (!fin.ok) {
        setNote(fj.error || 'Could not finish the upload.');
        return;
      }
      done(fj.status === 'held'
        ? 'Identical file already on another shelf — held for review.'
        : 'On your shelf.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function done(message: string) {
    setTitle('');
    setDescription('');
    setPrice('0');
    setFile(null);
    setRights(false);
    setNote(message);
    load();
  }

  // PUT with progress. fetch has no upload progress, so XHR it is.
  function putFile(url: string, f: File, onProgress: (pct: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', f.type);
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100));
      };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
      xhr.onerror = () => reject(new Error('Upload failed. The bucket must allow PUT from this site (CORS).'));
      xhr.send(f);
    });
  }

  async function remove(id: string) {
    const access = getAccess();
    if (!access) return;
    const r = await authFetch(`/api/materials/${id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${access}` },
    });
    if (r.ok) {
      setNote('Taken down. Buyers who already hold it keep their copy.');
      await load();
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      <p className="eyebrow" style={{ marginBottom: 6 }}>Your materials</p>
      <p className="muted" style={{ fontSize: 'var(--t-sm)', margin: '0 0 8px' }}>
        Sell ebooks, slides, notes and recordings from your profile. 0 naira means free.
      </p>
      <form onSubmit={upload} style={{ display: 'grid', gap: 8 }}>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title — e.g. Solar Sizing Workbook"
          maxLength={140}
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does it cover? (optional)"
          rows={2}
          maxLength={1000}
          style={{ width: '100%', font: 'inherit', fontSize: 'var(--t-base)', color: 'var(--ink)', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '10px 12px' }}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 'var(--t-sm)' }}>
            Price ₦
            <input
              type="number"
              min={0}
              max={1000000}
              step={1}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              style={{ maxWidth: 140 }}
            />
          </label>
          <input
            type="file"
            accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.mp3,.m4a,.wav,.mp4,.jpg,.jpeg,.png,.webp"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>
        <div>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Uploading…' : 'Put on shelf'}
          </button>
        </div>
        {progress !== null && (
          <div style={{ background: 'var(--line)', borderRadius: 999, height: 8, overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent)' }} />
          </div>
        )}
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 'var(--t-sm)' }}>
          <input
            type="checkbox"
            checked={rights}
            onChange={(e) => setRights(e.target.checked)}
            style={{ marginTop: 4 }}
          />
          <span>{RIGHTS_TEXT}</span>
        </label>
      </form>
      {note && <p className="muted" style={{ fontSize: 'var(--t-sm)' }}>{note}</p>}
      {rows !== null && rows.length > 0 && (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          {rows.map((m) => (
            <div key={m.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <b style={{ fontSize: 'var(--t-sm)' }}>{m.title}</b>
                <span className="muted" style={{ fontSize: 'var(--t-xs)' }}>
                  {' '}· {sizeLabel(m.sizeBytes)} · {m.priceNgn <= 0 ? 'Free' : formatNgn(m.priceNgn)}
                  {m.status === 'held' && ' · under review'}
                  {m.status === 'uploading' && ' · upload unfinished'}
                </span>
              </div>
              <button className="btn" onClick={() => remove(m.id)}>Take down</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
