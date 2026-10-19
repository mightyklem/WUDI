'use client';
import { useCallback, useEffect, useState } from 'react';
import { authFetch, getAccess } from '@/lib/client-auth';
import { Skeleton, SkeletonCard } from './Skeleton';

/**
 * Whether there is a session, resolved on the client.
 *
 * This used to live in a wrapper that took a render-prop function, and that is the one thing
 * a Server Component cannot pass to a Client Component -- React rejects it at render time
 * and the whole page 500s. The state belongs here, in the component that needs it.
 */
function useSignedIn() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => { setSignedIn(!!getAccess()); }, []);
  return signedIn;
}

type Q = {
  id: string;
  body: string;
  answer: string | null;
  answeredAt: string | null;
  createdAt: string;
  authorName: string;
  isMine: boolean;
  canAnswer: boolean;
};

function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/**
 * "Send your questions" on a class page.
 *
 * A class page answers what the class IS. This is for the things a page cannot answer: will
 * this suit me, do I need equipment, what happens if I miss a day, has anyone like me done
 * this. Those are the questions that stop people enrolling, and asking them in public is
 * worth more than another paragraph of description -- a stranger's answer does the convincing.
 *
 * Unanswered questions are not hidden. An unanswered question sitting there in public is a
 * trainer being told, quietly and publicly, what to write down.
 */
export default function QuestionBox({ trainingId }: { trainingId: string }) {
  const signedIn = useSignedIn();
  const [qs, setQs] = useState<Q[] | null>(null);
  const [draft, setDraft] = useState('');
  const [anon, setAnon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const r = await authFetch(`/api/trainings/${trainingId}/questions`);
      if (!r.ok) { setQs([]); return; }
      setQs((await r.json()).questions || []);
    } catch { setQs([]); }
  }, [trainingId]);

  useEffect(() => { if (signedIn) void load(); else setQs([]); }, [signedIn, load]);

  async function ask() {
    if (draft.trim().length < 8) return;
    setBusy(true); setMsg(null);
    const r = await authFetch(`/api/trainings/${trainingId}/questions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: draft.trim(), anonymous: anon }),
    }).catch(() => null);
    setBusy(false);
    if (!r || !r.ok) {
      const e = r ? await r.json().catch(() => null) : null;
      setMsg(e?.error || 'Could not send that. Try again.');
      return;
    }
    setDraft(''); setAnon(false); setMsg('Sent — the trainer has been notified.');
    await load();
  }

  async function answer(q: Q) {
    const text = (answers[q.id] || '').trim();
    if (text.length < 2) return;
    setBusy(true); setMsg(null);
    const r = await authFetch(`/api/questions/${q.id}/answer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answer: text }),
    }).catch(() => null);
    setBusy(false);
    if (!r || !r.ok) {
      const e = r ? await r.json().catch(() => null) : null;
      setMsg(e?.error || 'Could not save that answer.');
      return;
    }
    setAnswers((a) => ({ ...a, [q.id]: '' }));
    setMsg('Answer saved — the learner has been notified.');
    await load();
  }

  if (!signedIn) return null;

  return (
    <section style={{ marginTop: 18 }}>
      <h2 className="sec">Ask before you book</h2>

      <div className="card">
        <label className="fl">Your question</label>
        <textarea
          className="ta"
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Will this suit me if I am self-taught? What do I need to bring?"
          maxLength={600}
        />
        <label className="u-flex" style={{ gap: 8, fontSize: 13, margin: '4px 0 12px', cursor: 'pointer' }}>
          <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} style={{ width: 'auto' }} />
          <span className="muted">Ask anonymously — other readers won&rsquo;t see my name. The trainer still can.</span>
        </label>
        <div className="btnrow">
          <button className="btn primary" onClick={ask} disabled={busy || draft.trim().length < 8}>
            {busy ? 'Sending…' : 'Send my question'}
          </button>
        </div>
        {msg && <div className={msg.startsWith('Sent') || msg.startsWith('Answer') ? 'okmsg' : 'err'} style={{ marginTop: 10 }}>{msg}</div>}
      </div>

      <h3 style={{ margin: '20px 0 8px', fontSize: 15 }}>
        {qs?.length ? `${qs.length} question${qs.length === 1 ? '' : 's'}` : 'No questions yet'}
      </h3>

      {qs === null && <SkeletonCard height={70} />}

      <div style={{ display: 'grid', gap: 12 }}>
        {(qs ?? []).map((q) => (
          <div className="card" key={q.id} style={{ padding: 14 }}>
            <p style={{ margin: 0, fontSize: 14.5 }}>{q.body}</p>
            <p className="muted" style={{ fontSize: 12, margin: '5px 0 0' }}>
              {q.authorName} · {ago(q.createdAt)}
              {!q.answer && ' · awaiting an answer'}
            </p>

            {q.answer && (
              <div style={{ marginTop: 10, paddingLeft: 12, borderLeft: '3px solid var(--accent)' }}>
                <p style={{ margin: 0, fontSize: 14.5 }}>{q.answer}</p>
                <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                  {q.answeredAt ? `Trainer answered ${ago(q.answeredAt)}` : 'Trainer answered'}
                </p>
              </div>
            )}

            {q.canAnswer && !q.answer && (
              <div style={{ marginTop: 10 }}>
                <textarea
                  className="ta"
                  rows={2}
                  value={answers[q.id] ?? ''}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  placeholder="Answer this"
                  maxLength={1500}
                />
                <button
                  className="btn primary"
                  style={{ marginTop: 8 }}
                  onClick={() => answer(q)}
                  disabled={busy || (answers[q.id] ?? '').trim().length < 2}
                >
                  Post answer
                </button>
              </div>
            )}

            {q.isMine && q.answer && (
              <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
                You asked this.
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}