'use client';
import { useCallback, useEffect, useState } from 'react';
import { authFetch } from '@/lib/client-auth';
import { Skeleton, SkeletonCard } from './Skeleton';
import Tabs from './Tabs';

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



const emptyDraft = (): Draft => ({
  audience: '', outcomes: '', promise: '',
  storyStart: '', storyWentWrong: '', storyAdvice: '',
  modules: [], faqs: [],
});

export default function CurriculumBuilder({ trainingId }: { trainingId: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'plan' | 'stories'>('plan');
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

  // Only fetched once it is opened. A trainer who never prepares anything should not pay
  // for a request on every visit to their own class page.
  useEffect(() => { if (open) void load(); }, [open, load]);

  // "Prepare my class" on the dashboard links here with #prepare. Landing on a closed
  // panel from that button looks like the button did nothing, so honour the hash. In an
  // effect, never during render -- setting state while rendering is a React no-no.
  useEffect(() => {
    if (window.location.hash === '#prepare') setOpen(true);
  }, []);

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

  // Closed by default. A long editor sitting at the bottom of a page most visitors scroll
  // past, and an empty form is worse than no form -- it reads as a broken feature. One line
  // says what it is, one button opens it.
  //
  // Opened automatically when the page was linked straight here with #prepare, because that
  // link is the "Prepare my class" button on the dashboard and arriving at a closed panel
  // from it looks like the button did nothing.
  if (!open) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Write it once, then teach from it.</p>
        <button className="btn primary" onClick={() => setOpen(true)}>Prepare your class</button>
      </div>
    );
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
      <button
        className="btn link"
        onClick={() => setOpen(false)}
        style={{ marginBottom: 10, fontSize: 13 }}
      >
        ▾ Close and keep this page short
      </button>

      {/* Two things go in a curriculum and they are edited in completely different ways:
          the plan is a list with numbers in it, the stories are a page of prose. Stacked, they
          made a single long form that looked like paperwork. Tabbed, each is one job. */}
      <Tabs
        tabs={[
          { key: 'plan', label: 'Plan', count: draft.modules.length },
          { key: 'stories', label: 'Stories' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'plan' && (
        <div style={{ marginTop: 14 }}>
          {/* Modules first, because that is the part that is hard to think up. The positioning
              questions that used to sit above it are gone: a trainer who has to answer "who is
              this not for" before they can write down what they are teaching writes nothing. */}
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
                  style={{ flex: 1, minWidth: 0 }}
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
        </div>
      )}

      {tab === 'stories' && (
        <div style={{ marginTop: 14 }}>
          {/* One box, not a form. Stories, wins, mistakes, the thing you would tell somebody
              on day one -- whatever the trainer actually wants to write down, in their own
              order. The structured prompts that used to sit here asked for the same material
              in a fixed order, and the fixed order was the problem: asked as separate fields,
              people answer the easiest one and leave the rest. */}
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
            Anything you want in front of the room — how you started, what went wrong, what
            finally worked. Write it however you like.
          </p>
          <textarea
            className="ta"
            rows={10}
            value={draft.storyAdvice}
            onChange={(e) => set('storyAdvice', e.target.value)}
            placeholder={'I did this for free for two years because I did not know what to charge.\n\nWhat finally worked: I stopped copying what other people charged and priced the outcome instead.\n\nWhat I would tell you on day one: do not start until you have a real one to practise on.'}
            maxLength={4000}
          />
        </div>
      )}

      {/* ---- save + export. Always visible, because saving and taking the file away are
          not part of either tab -- they apply to the whole document. */}
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