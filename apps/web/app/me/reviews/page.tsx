'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch, getAccess } from '@/lib/client-auth';
import SiteNav from '../../components/SiteNav';

type Row = {
  sessionId: string; trainerId: string; trainerName: string;
  trainingTitle: string; when: string; myRating: number | null;
};

export default function MyReviews() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function load() {
    const access = getAccess();
    if (!access) { setRows([]); return; }
    authFetch('/api/me/reviews', { headers: { authorization: `Bearer ${access}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setRows(j?.sessions || []));
  }
  useEffect(load, []);

  async function submit(sessionId: string, trainerId: string) {
    const rating = picks[sessionId];
    if (!rating) return setMsg('Pick a rating first.');
    setBusy(sessionId);
    setMsg(null);
    const access = getAccess();
    if (!access) return;
    const r = await authFetch(`/api/trainers/${trainerId}/reviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
      body: JSON.stringify({ sessionId, rating, body: texts[sessionId] }),
    });
    setBusy(null);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(j.error || 'Could not save that review.');
    setMsg(
      j.award?.awarded
        ? `Thank you. That added ${j.award.points} point${j.award.points === 1 ? '' : 's'} to ${''}the trainer's standing.`
        : 'Thank you. That review is recorded.',
    );
    load();
  }

  if (rows === null) return <div className="wrap"><p className="muted">Loading…</p></div>;

  const outstanding = rows.filter((r) => r.myRating === null);

  return (
    <div className="wrap">
      <SiteNav />
      <h1>Rate your trainers.</h1>
      <p className="sub">
        You can only rate classes you actually attended. Ratings are public, and good ones
        raise a trainer's standing on Learnovize.
      </p>

      {msg && <div className="okmsg" style={{ marginTop: 14 }}>{msg}</div>}

      {rows.length === 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <p style={{ margin: 0 }} className="muted">
            Nothing to review yet. Once you have attended a live class, you can rate the
            trainer here.
          </p>
        </div>
      )}

      {outstanding.length > 0 && (
        <>
          <h2 className="sec">Waiting for your rating ({outstanding.length})</h2>
          <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
            {outstanding.map((r) => (
              <div className="card" key={r.sessionId}>
                <b>{r.trainerName}</b>
                <div className="muted" style={{ fontSize: 13 }}>
                  {r.trainingTitle} · {new Date(r.when).toLocaleString()}
                </div>

                <div style={{ display: 'flex', gap: 4, marginTop: 10 }} role="radiogroup" aria-label="Rating">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      className="btn"
                      aria-pressed={picks[r.sessionId] === n}
                      aria-label={`${n} star${n === 1 ? '' : 's'}`}
                      style={{
                        fontSize: 18, padding: '4px 10px',
                        background: picks[r.sessionId] === n ? 'var(--gold-soft)' : undefined,
                      }}
                      onClick={() => setPicks((p) => ({ ...p, [r.sessionId]: n }))}
                    >
                      ★
                    </button>
                  ))}
                </div>

                <textarea
                  rows={2} style={{ width: '100%', marginTop: 8 }}
                  placeholder="Optional — what was useful?"
                  value={texts[r.sessionId] || ''}
                  onChange={(e) => setTexts((t) => ({ ...t, [r.sessionId]: e.target.value }))}
                />

                <div className="btnrow">
                  <button className="btn primary" disabled={busy === r.sessionId} onClick={() => submit(r.sessionId, r.trainerId)}>
                    Submit rating
                  </button>
                  <Link className="btn link" href={`/trainers/${r.trainerId}`}>See profile</Link>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {rows.some((r) => r.myRating !== null) && (
        <>
          <h2 className="sec">Already rated</h2>
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            {rows.filter((r) => r.myRating !== null).map((r) => (
              <div className="card" key={r.sessionId} style={{ padding: 14 }}>
                <b>{r.trainerName}</b>
                <span className="badge ok" style={{ marginLeft: 8 }}>{'★'.repeat(r.myRating!)}</span>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{r.trainingTitle}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}