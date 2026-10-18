'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch, getAccess } from '@/lib/client-auth';
import SiteNav from '../components/SiteNav';

/**
 * Become a trainer.
 *
 * This used to be a sixteen-question application with a scoring rubric and a paid badge
 * behind it. It is now deliberately short.
 *
 * The reason is not that the questions were wrong but that they sat in the wrong place.
 * A new trainer was asked to write about how they learned a skill, how long they had
 * done it and where they share their work -- before anything about whether we know who
 * they are, and before they had taught a single minute on the platform. Almost everyone
 * who reached that page had already created a free class, so the gate came after the
 * thing it was supposed to precede.
 *
 * So onboarding now asks only what is needed to be listed and found. Identity is the next
 * step, and it has a purpose: payouts are blocked until it is approved, so the bank
 * account we pay into belongs to a person we can name.
 */
type Me = {
  trainer?: {
    displayName: string; bio: string | null; topics: string[];
    approvalState: string; paidCertApproved: boolean;
  } | null;
};

const WHY = [
  { title: 'You can teach free classes straight away', body: 'No application, no fee, no waiting. Verification only matters when you want to be paid.' },
  { title: 'Verification unlocks payouts', body: 'One ID document, reviewed by a person. Until then, money you earn stays held — you are not paid to an anonymous account.' },
  { title: 'Your class size comes from your plan', body: 'Free plan classes seat up to 50. Paid classes follow the same rule now — what you sell is not a permission.' },
];

export default function Onboarding() {
  const [me, setMe] = useState<Me | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [topics, setTopics] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const access = getAccess();
    if (!access) { setMe({}); return; }
    authFetch('/api/me', { headers: { authorization: `Bearer ${access}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        setMe(j || {});
        if (j?.trainer) {
          setDisplayName(j.trainer.displayName || '');
          setBio(j.trainer.bio || '');
          setTopics((j.trainer.topics || []).join(', '));
        }
      });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const access = getAccess();
    if (!access) { setMsg({ ok: false, text: 'Log in first, then set up your teaching profile.' }); return; }
    if (displayName.trim().length < 2) {
      setMsg({ ok: false, text: 'Tell us what to call you.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await authFetch('/api/trainer/profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
        body: JSON.stringify({
          displayName: displayName.trim(),
          bio: bio.trim() || null,
          topics: topics.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not save');
      setMsg({ ok: true, text: 'Saved. Your profile is live.' });
      const j = await authFetch('/api/me', { headers: { authorization: `Bearer ${access}` } }).then((x) => x.json());
      setMe(j || {});
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  }

  if (!me) return <div className="wrap"><p className="muted">Loading…</p></div>;

  const state = me.trainer?.approvalState ?? 'none';
  const verified = state === 'approved';

  return (
    <div className="wrap">
      <SiteNav />
      <h1>Become a trainer.</h1>
      <p className="sub">
        Two steps. This one takes a minute. The second only matters when you want to be paid.
      </p>

      <ol className="steps" style={{ marginTop: 16 }}>
        <li className={me.trainer ? 'on' : 'now'}>
          <b>Teaching profile</b>
          <span className="muted"> — what you teach, so learners can find you.</span>
        </li>
        <li className={verified ? 'on' : me.trainer ? '' : 'off'}>
          <b>Identity</b>
          <span className="muted"> — one ID document. Required before your first payout.</span>
        </li>
      </ol>

      <form onSubmit={save}>
        <div className="card" style={{ marginTop: 18 }}>
          <label className="fl" htmlFor="dn">What should we call you?</label>
          <input
            id="dn" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Mighty Klem Augustine" maxLength={80}
          />

          <label className="fl" htmlFor="bio">What do you teach?</label>
          <textarea
            id="bio" rows={3} value={bio} onChange={(e) => setBio(e.target.value)}
            placeholder="Two or three lines. Enough for someone to decide if your class is for them."
            maxLength={500}
          />

          <label className="fl" htmlFor="topics">Topics, comma separated</label>
          <input
            id="topics" type="text" value={topics} onChange={(e) => setTopics(e.target.value)}
            placeholder="video production, lighting, editing"
          />

          <div className="btnrow">
            <button className="btn primary" disabled={busy} type="submit">
              {busy ? 'Saving…' : 'Save profile'}
            </button>
          </div>
          {msg && <p className={msg.ok ? 'okmsg' : 'err'} style={{ marginTop: 10 }}>{msg.text}</p>}
        </div>
      </form>

      <div className="card" style={{ marginTop: 14 }}>
        <b>Where this leads</b>
        <ul style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 0 }}>
          {WHY.map((w) => (
            <li key={w.title}><b>{w.title}.</b> {w.body}</li>
          ))}
        </ul>
      </div>

      {me.trainer && (
        <div className="card" style={{ marginTop: 14 }}>
          <b>Identity verification</b>
          <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            {verified
              ? 'Approved. You can be paid.'
              : state === 'pending'
                ? 'Under review. We will email you.'
                : state === 'rejected'
                  ? 'Not approved. Open the page below for the reason.'
                  : 'Not started.'}
          </p>
          <div className="btnrow">
            <Link className={verified ? 'btn' : 'btn primary'} href="/trainer/approval">
              {verified ? 'View verification' : 'Verify your identity'}
            </Link>
            <Link className="btn link" href="/trainings/new">Create your first class</Link>
          </div>
        </div>
      )}
    </div>
  );
}