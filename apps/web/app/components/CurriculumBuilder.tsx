'use client';
import { useCallback, useEffect, useState } from 'react';
import { authFetch } from '@/lib/client-auth';
import { Skeleton, SkeletonCard } from './Skeleton';

type Module = { id?: string; position: number; title: string; minutes: number; body: string; sessionId: string | null };
type Faq = { id?: string; position: number; question: string; answer: string };
type Session = { id: string; startsAtUtc: string; endsAtUtc: string };

type Draft = {
  audience: string; outcomes: string; promise: string;
  storyStart: string; storyWentWrong: string; storyAdvice: string;
  modules: Module[]; faqs: Faq[];
};

/**
 * "Before you teach it, write it down."
 *
 * A tool, not a template. Every field is a question only the trainer can answer, and the
 * three story prompts are kept apart because merging them reliably loses the useful one:
 * how you got here, what went wrong first, and what you would tell somebody on day one are
 * three different lessons, and a person asked for all three at once answers the easiest.
 *
 * Deliberately no AI button in the first version. The structure does the work, and a
 * generated paragraph in a document a trainer prints and stands behind is a liability. If
 * polish is ever added it should be opt-in, editable, and clearly marked as a draft.
 */

const PROMPTS: { key: keyof Draft; label: string; hint: string; placeholder: string }[] = [
  {
    key: 'audience',
    label: 'Who this is for — and who it is not',
    hint: 'The exclusion is the part that saves somebody their money. "Not for you if you have never done X."',
    placeholder: 'For Lagos-based freelancers who already have one client and want three. Not for you if you have never billed anyone before — start with the free class instead.',
  },
  {
    key: 'outcomes',
    label: 'What someone can do afterwards that they cannot do now',
    hint: 'One per line. If it could be said of any course, it is not an outcome.',
    placeholder: 'Price a project without guessing\nWrite a proposal that closes\nRun a handover that does not need you in the room',
  },
  {
    key: 'promise',
    label: 'The promise, in your own words',
    hint: 'What life looks like on the other side. This sits at the top of the document.',
    placeholder: 'You stop being the person who says yes to everything, and start being the one who prices it.',
  },
];

const STORY: { key: keyof Draft; label: string; hint: string; placeholder: string }[] = [
  {
    key: 'storyStart',
    label: 'How you got here',
    hint: 'The short version. Where you were, and the moment it changed.',
    placeholder: 'I was doing it for free for two years because I did not know what to charge. The moment that changed was losing a client I actually wanted.',
  },
  {
    key: 'storyWentWrong',
    label: 'What went wrong first',
    hint: 'Nobody teaches this part. It is the reason people trust you more than a manual.',
    placeholder: 'I priced by copying what another agency charged. I lost money for eight months before I noticed.',
  },
  {
    key: 'storyAdvice',
    label: 'What you would tell someone on day one',
    hint: 'The thing you needed to hear and did not.',
    placeholder: 'Do not take the course until you have a real project to practise on. You will not retain any of it.',
  },
];

const emptyDraft = (): Draft => ({
  audience: '', outcomes: '', promise: '',
  storyStart: '', storyWentWrong: '', storyAdvice: '',
  modules: [], faqs: [],
});

export default function CurriculumBuilder({ trainingId }: { trainingId: string }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await authFetch(`/api/trainings/${trainingId}/curriculum`);
      if (!r.ok) return;
      const j = await r.json();
      setSessions(j.sessions || []);
      setDraft({
        audience: j.audience || '', outcomes: j.outcomes || '', promise: j.promise || '',
        storyStart: j.storyStart || '', storyWentWrong: j.storyWentWrong || '', storyAdvice: j.storyAdvice || '',
        modules: (j.modules || []).map((m: Module) => ({ ...m })),
        faqs: (j.faqs || []).map((f: Faq) => ({ ...f })),
      });
    } catch { /* the page stays usable without it */ }
  }, [trainingId]);

  useEffect(() => { void load(); }, [load]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  const planned = (draft?.modules ?? []).reduce((n, m) => n + (Number(m.minutes) || 0), 0);
  const scheduled = sessions.reduce((n, s) => {
    const mins = (new Date(s.endsAtUtc).getTime() - new Date(s.startsAtUtc).getTime()) / 60000;
    return n + Math.max(0, Math.round(mins));
  }, 0);
  const over = sessions.length ? Math.max(0, planned - scheduled) : 0;

  async function save() {
    if (!draft) return;
    setBusy(true); setMsg(null);
    const r = await authFetch(`/api/trainings/${trainingId}/curriculum`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft),
    }).catch(() => null);
    setBusy(false);
    if (!r || !r.ok) {
      const e = r ? await r.json().catch(() => null) : null;
      setMsg(e?.error || 'Could not save. Try again.');
      return;
    }
    setMsg('Saved.');
    await load();
  }

  function download(format: 'pdf' | 'md') {
    // Plain navigation, not fetch: the response is an attachment and there is nothing to read
    // out of it, so streaming it through JS would only buffer a file for no reason.
    const a = document.createElement('a');
    a.href = `/api/trainings/${trainingId}/curriculum?format=${format}&t=${Date.now()}`;
    a.rel = 'noopener';
    // authFetch cannot be used for an <a download>, and the endpoint needs a bearer token, so
    // this is fetched and turned into an object URL instead.
    void (async () => {
      const r = await authFetch(`/api/trainings/${trainingId}/curriculum?format=${format}`);
      if (!r.ok) return;
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `curriculum.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    })();
  }

  if (!draft) {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <Skeleton width={280} height={18} />
        <SkeletonCard height={92} />
        <SkeletonCard height={92} />
      </div>
    );
  }

  return (
    <div>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        This is yours to write. The document at the end is only as good as what is in here —
        nobody else can answer any of these for you.
      </p>

      {/* ---- positioning */}
      <h3 className="u-h-md" style={{ marginTop: 20 }}>The shape of it</h3>
      {PROMPTS.map((p) => (
        <div key={String(p.key)} style={{ marginBottom: 16 }}>
          <label className="fl">{p.label}</label>
          <p className="muted" style={{ fontSize: 12.5, margin: '-4px 0 6px' }}>{p.hint}</p>
          <textarea
            className="ta"
            rows={p.key === 'outcomes' ? 3 : 2}
            value={draft[p.key] as string}
            onChange={(e) => set(p.key, e.target.value)}
            placeholder={p.placeholder}
            maxLength={4000}
          />
        </div>
      ))}

      {/* ---- their story */}
      <h3 className="u-h-md" style={{ marginTop: 24 }}>Your experience</h3>
      <p className="muted" style={{ fontSize: 13, marginTop: -4 }}>
        These three stay separate on purpose. Asked as one question, everybody answers the
        easiest one.
      </p>
      {STORY.map((p) => (
        <div key={String(p.key)} style={{ marginBottom: 16 }}>
          <label className="fl">{p.label}</label>
          <p className="muted" style={{ fontSize: 12.5, margin: '-4px 0 6px' }}>{p.hint}</p>
          <textarea
            className="ta"
            rows={3}
            value={draft[p.key] as string}
            onChange={(e) => set(p.key, e.target.value)}
            placeholder={p.placeholder}
            maxLength={4000}
          />
        </div>
      ))}

      {/* ---- modules */}
      <h3 className="u-h-md" style={{ marginTop: 24 }}>Modules and timing</h3>
      {draft.modules.map((m, i) => (
        <div className="card" key={i} style={{ padding: 14, marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
            <span className="u-num" aria-hidden>{i + 1}</span>
            <input
              type="text"
              value={m.title}
              onChange={(e) => {
                const v = e.target.value;
                setDraft((d) => d && { ...d, modules: d.modules.map((x, j) => (j === i ? { ...x, title: v } : x)) });
              }}
              placeholder="Module title"
              style={{ flex: 1 }}
            />
            <input
              type="text"
              inputMode="numeric"
              value={String(m.minutes)}
              onChange={(e) => {
                const v = Number(e.target.value.replace(/\D/g, '')) || 0;
                setDraft((d) => d && { ...d, modules: d.modules.map((x, j) => (j === i ? { ...x, minutes: v } : x)) });
              }}
              aria-label="Minutes"
              style={{ width: 76 }}
            />
            <span className="muted" style={{ fontSize: 12 }}>min</span>
            <button
              className="btn link"
              onClick={() => setDraft((d) => d && { ...d, modules: d.modules.filter((_, j) => j !== i) })}
              aria-label={`Remove module ${i + 1}`}
            >✕</button>
          </div>
          <textarea
            className="ta"
            rows={2}
            value={m.body}
            onChange={(e) => {
              const v = e.target.value;
              setDraft((d) => d && { ...d, modules: d.modules.map((x, j) => (j === i ? { ...x, body: v } : x)) });
            }}
            placeholder="What you actually do in this block"
            maxLength={4000}
          />
        </div>
      ))}

      <button
        className="btn"
        onClick={() => setDraft((d) => d && { ...d, modules: [...d.modules, { position: d.modules.length, title: '', minutes: 60, body: '', sessionId: null }] })}
      >＋ Add a module</button>

      {/* ---- the check that earns its keep */}
      <div className="card" style={{ marginTop: 14, padding: 14, background: 'var(--pill)' }}>
        <p style={{ margin: 0, fontSize: 13.5 }}>
          <b>{planned}</b> min planned
          {sessions.length > 0 && <> · <b>{scheduled}</b> min scheduled across {sessions.length} session{sessions.length === 1 ? '' : 's'}</>}
        </p>
        {over > 0 && sessions.length > 0 && (
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--warn)' }}>
            ⚠ This is <b>{over} minutes longer</b> than the time you have scheduled. Trim it or add a session — this is the kind of thing you should find now, not on the day.
          </p>
        )}
      </div>

      {/* ---- FAQs */}
      <h3 className="u-h-md" style={{ marginTop: 24 }}>Questions you get asked</h3>
      <p className="muted" style={{ fontSize: 13, marginTop: -4 }}>
        Answer them once here instead of in the room, where three people ask at once.
      </p>
      {draft.faqs.map((f, i) => (
        <div className="card" key={i} style={{ padding: 14, marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input
              type="text"
              value={f.question}
              onChange={(e) => {
                const v = e.target.value;
                setDraft((d) => d && { ...d, faqs: d.faqs.map((x, j) => (j === i ? { ...x, question: v } : x)) });
              }}
              placeholder="The question"
              style={{ flex: 1 }}
            />
            <button
              className="btn link"
              onClick={() => setDraft((d) => d && { ...d, faqs: d.faqs.filter((_, j) => j !== i) })}
              aria-label={`Remove question ${i + 1}`}
            >✕</button>
          </div>
          <textarea
            className="ta"
            rows={2}
            value={f.answer}
            onChange={(e) => {
              const v = e.target.value;
              setDraft((d) => d && { ...d, faqs: d.faqs.map((x, j) => (j === i ? { ...x, answer: v } : x)) });
            }}
            placeholder="Your answer"
            maxLength={4000}
          />
        </div>
      ))}
      <button
        className="btn"
        onClick={() => setDraft((d) => d && { ...d, faqs: [...d.faqs, { position: d.faqs.length, question: '', answer: '' }] })}
      >＋ Add a question</button>

      {/* ---- save + export */}
      <div className="btnrow" style={{ marginTop: 22 }}>
        <button className="btn primary lg" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save curriculum'}
        </button>
        <button className="btn" onClick={() => download('pdf')} disabled={busy}>Download PDF</button>
        <button className="btn" onClick={() => download('md')} disabled={busy}>Download Markdown</button>
      </div>
      {msg && <p className={msg === 'Saved.' ? 'okmsg' : 'err'} style={{ marginTop: 10 }}>{msg}</p>}
      <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
        Save before you download — the file is built from what is stored, not from what is on screen.
      </p>
    </div>
  );
}