'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch, getAccess } from '@/lib/client-auth';
import SiteNav from '../../components/SiteNav';
import Avatar from '../../components/Avatar';
import ShareButton from '../../components/ShareButton';

type Profile = {
  id: string;
  fullName: string | null;
  photoUrl: string | null;
  bio: string | null;
  email: string;
  isOfficial: boolean;
  points: number;
  rank: string;
  createdAt: string;
  trainerProfile: {
    displayName: string; topics: string[]; photoUrl: string | null; bio: string | null;
    logoUrl: string | null; signatureUrl: string | null;
  } | null;
};

type Post = {
  id: string; title: string | null; body: string | null; mediaUrl: string;
  kind: string; createdAt: string; status: string;
  training?: { id: string; title: string; slug: string } | null;
};

export default function MyProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sigUploading, setSigUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const access = getAccess();
    if (!access) return;
    const [p, f] = await Promise.all([
      authFetch('/api/me/profile', { headers: { authorization: `Bearer ${access}` } }),
      authFetch('/api/feed?mine=1', { headers: { authorization: `Bearer ${access}` } }),
    ]);
    if (p.ok) {
      const j = await p.json();
      setProfile(j.profile);
      setName(j.profile.fullName || '');
      setBio(j.profile.bio || '');
      setPhotoUrl(j.profile.photoUrl);
    }
    if (f.ok) {
      const j = await f.json();
      setPosts((j.posts || []).filter((x: Post & { mine?: boolean }) => x.mine));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function pickPicture(file: File | null) {
    if (!file) return;
    setUploading(true);
    setErr(null);
    setMsg(null);
    try {
      const access = getAccess();
      const form = new FormData();
      form.append('file', file);
      form.append('kind', 'photo');
      const up = await authFetch('/api/uploads', {
        method: 'POST',
        headers: { authorization: `Bearer ${access}` },
        body: form,
      });
      const uj = await up.json().catch(() => ({}));
      if (!up.ok) {
        setErr(uj.error || 'That picture could not be uploaded.');
        return;
      }
      setPhotoUrl(uj.url || null);
      setMsg('Picture chosen. Save to keep it.');
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const access = getAccess();
      const r = await authFetch('/api/me/profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
        body: JSON.stringify({ fullName: name, bio, photoUrl }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j.error || 'Could not save that.');
        return;
      }
      setProfile(j.profile);
      setEditing(false);
      setMsg('Saved.');
      load();
    } finally {
      setBusy(false);
    }
  }

  async function removePost(id: string) {
    const access = getAccess();
    const r = await authFetch(`/api/posts/${id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${access}` },
    });
    if (r.ok) load();
  }

  if (!profile) {
    return (
      <div className="wrap">
        <SiteNav />
        <p className="muted">Loading your profile…</p>
      </div>
    );
  }

  return (
    <div className="wrap">
      <SiteNav />

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
        <Avatar name={profile.fullName} photoUrl={photoUrl} size={72} seed={profile.id} />
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0 }}>{profile.fullName || 'Your profile'}</h1>
          <p className="sub" style={{ margin: '4px 0 0' }}>
            {profile.email}
            {profile.isOfficial ? ' · Official' : ''}
            {` · ${profile.rank} · ${profile.points} points`}
          </p>
        </div>
      </div>

      <div className="btnrow" style={{ marginTop: 16 }}>
        {editing ? (
          <>
            <button className="btn primary" onClick={save} disabled={busy || uploading}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button className="btn" onClick={() => { setEditing(false); load(); }} disabled={busy}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button className="btn primary" onClick={() => setEditing(true)}>Edit your profile</button>
            <ShareButton url="/me/profile" title={profile.fullName || 'My Learnovize profile'} label="Share" />
          </>
        )}
      </div>

      {msg && <p className="okmsg" style={{ marginTop: 12 }}>{msg}</p>}
      {err && <p className="err" style={{ marginTop: 12 }}>{err}</p>}

      {editing && (
        <div className="card" style={{ marginTop: 14, maxWidth: 560 }}>
          <p className="eyebrow">Your picture</p>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <Avatar name={name || profile.fullName} photoUrl={photoUrl} size={64} seed={profile.id} />
            <div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => pickPicture(e.target.files?.[0] || null)}
              />
              {uploading && <p className="muted" style={{ fontSize: 'var(--t-sm)', margin: '6px 0 0' }}>Uploading…</p>}
              <p className="muted" style={{ fontSize: 'var(--t-sm)', margin: '6px 0 0' }}>
                A square picture looks best. 5MB max.
              </p>
            </div>
          </div>

          <label className="fl">Your name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Augustine Okafor"
            maxLength={120}
            autoComplete="name"
          />
          <p className="muted" style={{ fontSize: 'var(--t-sm)', margin: '6px 0 14px' }}>
            This is the name on your certificates and the name a trainer sees.
          </p>

          <label className="fl">About you</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="What you teach, and who you teach it for."
            maxLength={500}
            rows={4}
            style={{ width: '100%', font: 'inherit', fontSize: 'var(--t-base)', color: 'var(--ink)', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '10px 12px' }}
          />
          <p className="muted" style={{ fontSize: 'var(--t-sm)', margin: '6px 0 0' }}>
            {bio.length}/500
          </p>
        </div>
      )}

      {!editing && profile.bio && (
        <div className="card" style={{ marginTop: 18 }}>
          <p className="eyebrow" style={{ marginBottom: 6 }}>About</p>
          <p style={{ margin: 0 }}>{profile.bio}</p>
        </div>
      )}

      {profile.trainerProfile && (
        <div className="card" style={{ marginTop: 14 }}>
          <p className="eyebrow" style={{ marginBottom: 6 }}>You teach as</p>
          <p style={{ margin: 0, fontWeight: 700 }}>{profile.trainerProfile.displayName}</p>
          {profile.trainerProfile.topics.length > 0 && (
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 'var(--t-sm)' }}>
              {profile.trainerProfile.topics.join(' · ')}
            </p>
          )}
          <div style={{ marginTop: 14 }}>
            <p className="eyebrow" style={{ marginBottom: 6 }}>Certificate signature</p>
            <p className="muted" style={{ fontSize: 'var(--t-sm)', margin: '0 0 8px' }}>
              Drawn on certificates under your name, below the Learnovize mark.
            </p>
            {profile.trainerProfile.signatureUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.trainerProfile.signatureUrl}
                alt="Your signature"
                style={{ maxWidth: 220, maxHeight: 64, objectFit: 'contain', display: 'block', marginBottom: 8 }}
              />
            )}
            <label className="btn" style={{ display: 'inline-block', cursor: 'pointer' }}>
              {sigUploading ? 'Uploading…' : profile.trainerProfile.signatureUrl ? 'Replace signature' : 'Upload signature'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                disabled={sigUploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setSigUploading(true);
                  setErr(null);
                  setMsg(null);
                  try {
                    const access = getAccess();
                    const form = new FormData();
                    form.append('file', file);
                    const up = await authFetch(`/api/trainers/${profile.id}/signature`, {
                      method: 'POST',
                      headers: { authorization: `Bearer ${access}` },
                      body: form,
                    });
                    const uj = await up.json().catch(() => ({}));
                    if (!up.ok) {
                      setErr(uj.error || 'Signature upload failed');
                      return;
                    }
                    setMsg('Signature saved. New certificates will use it.');
                    await load();
                  } catch {
                    setErr('Signature upload failed');
                  } finally {
                    setSigUploading(false);
                  }
                }}
              />
            </label>
          </div>
          <div className="btnrow" style={{ marginTop: 12 }}>
            <Link className="btn" href="/trainer/approval">Your trainer details</Link>
            <Link className="btn" href="/trainer/earnings">Your earnings</Link>
          </div>
        </div>
      )}

      <h2 className="sec">Your posts</h2>
      <p className="muted" style={{ fontSize: 'var(--t-sm)' }}>
        Anything you have published on Explore. You can take one down at any time.
      </p>
      <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
        {posts === null && <p className="muted">Loading…</p>}
        {posts?.length === 0 && <p className="muted">You have not published anything yet.</p>}
        {posts?.map((p) => (
          <div key={p.id} className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <p style={{ margin: 0, fontWeight: 800 }}>
                  {p.training?.title || p.title || 'Post'}
                </p>
                {p.body && <p className="muted" style={{ margin: '4px 0 0', fontSize: 'var(--t-sm)' }}>{p.body}</p>}
                <p className="muted" style={{ margin: '6px 0 0', fontSize: 'var(--t-xs)' }}>
                  {new Date(p.createdAt).toLocaleDateString()}
                  {p.status === 'removed' ? ' · taken down' : ''}
                </p>
              </div>
              {p.training && (
                <Link className="btn" href={`/t/${p.training.slug}/register`}>View the class</Link>
              )}
              {p.status !== 'removed' && (
                <button className="btn" onClick={() => removePost(p.id)}>Take down</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
