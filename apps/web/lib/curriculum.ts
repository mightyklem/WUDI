/**
 * The curriculum, rendered.
 *
 * Everything here is the trainer's own material. The tool supplies structure -- headings, a
 * time budget, the order -- and nothing else. There is no fallback text, no generated
 * summary, and no section filled in "for you", because a trainer who prints a document
 * padded with words they did not write has been handed something they cannot stand behind in
 * a room full of paying learners.
 */

export type Module = {
  position: number;
  title: string;
  minutes: number;
  body: string;
  sessionId: string | null;
};

export type Faq = { position: number; question: string; answer: string };

export type Curriculum = {
  trainingTitle: string;
  trainerName: string;
  audience: string | null;
  outcomes: string | null;
  promise: string | null;
  storyStart: string | null;
  storyWentWrong: string | null;
  storyAdvice: string | null;
  modules: Module[];
  faqs: Faq[];
};

/** Sessions as they actually exist, so the budget can be checked against reality. */
export type SessionSpan = { id: string; startsAtUtc: Date; endsAtUtc: Date };

/**
 * How the promised minutes compare to the time actually scheduled.
 *
 * This is the single most useful thing the document can tell a trainer, and it is cheap: a
 * plan promising five hours into three ninety-minute sessions is a disaster that is otherwise
 * only discoverable on the day, in front of people who paid for it.
 */
export function timeBudget(
  modules: Module[],
  sessions: SessionSpan[],
): { plannedMinutes: number; scheduledMinutes: number; overBy: number } {
  const plannedMinutes = modules.reduce((n, m) => n + (Number(m.minutes) || 0), 0);
  const scheduledMinutes = sessions.reduce(
    (n, s) => n + Math.max(0, Math.round((s.endsAtUtc.getTime() - s.startsAtUtc.getTime()) / 60000)),
    0,
  );
  // Zero when nothing is scheduled, not the raw difference. A draft curriculum with no
  // sessions yet is not "600 minutes over budget" -- there is simply nothing to overrun, and
  // the callers were each having to remember that. One rule, here, instead of a guard
  // repeated in every renderer that could eventually be forgotten in one of them.
  const overBy = sessions.length ? Math.max(0, plannedMinutes - scheduledMinutes) : 0;
  return { plannedMinutes, scheduledMinutes, overBy };
}

const clean = (s: string | null | undefined) => (s ?? '').trim();

/**
 * Strip what the PDF's fonts cannot draw.
 *
 * The standard PDF fonts encode WinAnsi, which covers Latin text and the typographic
 * punctuation people actually write, but not emoji, arrows or the warning sign. pdf-lib does
 * not refuse them -- it emits bytes that render as garbage, so a trainer who writes "I'll
 * show you →" gets a document with a random glyph in it, and one who types an emoji gets a
 * document they will print in front of a class.
 *
 * A few characters are translated rather than dropped, because they are common enough in
 * ordinary prose that silently deleting them changes a sentence.
 */
export function winAnsiSafe(s: string): string {
  return s
    // Escapes rather than literal glyphs: this function is the only thing standing between a
    // trainer typing an arrow and a PDF full of noise, and it has to be readable enough to
    // be corrected when somebody adds a case.
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—―]/g, '-')
    .replace(/…/g, '...')
    .replace(/[→⇒]/g, '->')
    .replace(/[←⇐]/g, '<-')
    .replace(/[•·]/g, '-')
    .replace(/[✓✔]/g, 'Yes')
    .replace(/[✗✘]/g, 'No')
    // Anything still outside WinAnsi -- emoji, symbols, other scripts -- is removed rather
    // than rendered as noise. A gap in a sentence beats a wrong character in a document
    // somebody is about to teach from.
    .replace(/[^	\n\r\x20-\x7E -ÿ‐-‰]/g, '')
    // A control character would truncate the draw call and lose the rest of the line.
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

function minutesLabel(mins: number) {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Markdown, for pasting into anything and editing later. */
export function curriculumMarkdown(c: Curriculum, sessions: SessionSpan[] = []): string {
  const b = timeBudget(c.modules, sessions);
  const out: string[] = [];

  out.push(`# ${c.trainingTitle}`);
  out.push('');
  out.push(`**Curriculum — ${c.trainerName}**`);
  out.push('');

  if (clean(c.promise)) {
    out.push('> ' + clean(c.promise).replace(/\n/g, '\n> '));
    out.push('');
  }

  if (clean(c.audience)) {
    out.push('## Who this is for');
    out.push('');
    out.push(clean(c.audience));
    out.push('');
  }

  if (clean(c.outcomes)) {
    out.push('## What you will be able to do');
    out.push('');
    out.push(clean(c.outcomes).split('\n').filter(Boolean).map((l) => `- ${l.trim()}`).join('\n'));
    out.push('');
  }

  // One free-text section. It used to be three fixed prompts, which reliably produced
  // three thin answers to questions rather than the one thing the trainer actually wanted
  // to say.
  const story: [string, string | null][] = [
    ['Success stories and notes to take away', c.storyAdvice],
  ];
  const told = story.filter(([, v]) => clean(v));
  if (told.length) {
    out.push('## Success stories and notes to take away');
    out.push('');
    for (const [h, v] of told) {
      out.push(`### ${h}`);
      out.push('');
      out.push(clean(v));
      out.push('');
    }
  }

  out.push('## Plan and timing');
  out.push('');
  if (!c.modules.length) {
    out.push('_No modules planned yet._');
    out.push('');
  } else {
    for (const m of [...c.modules].sort((a, z) => a.position - z.position)) {
      out.push(`### ${m.position + 1}. ${m.title} · ${minutesLabel(m.minutes)}`);
      out.push('');
      if (clean(m.body)) out.push(clean(m.body));
      out.push('');
    }
  }

  out.push(`**Total planned:** ${minutesLabel(b.plannedMinutes)}`);
  if (sessions.length) {
    out.push(`**Total scheduled:** ${minutesLabel(b.scheduledMinutes)} across ${sessions.length} session${sessions.length === 1 ? '' : 's'}`);
  }
  if (b.overBy > 0 && sessions.length) {
    out.push('');
    out.push(`> ⚠ This plan is **${minutesLabel(b.overBy)} longer** than the time scheduled. Either trim the plan or add sessions.`);
  }
  out.push('');

  if (c.faqs.length) {
    out.push('## Questions people ask me');
    out.push('');
    for (const f of [...c.faqs].sort((a, z) => a.position - z.position)) {
      out.push(`### ${f.question}`);
      out.push('');
      out.push(clean(f.answer));
      out.push('');
    }
  }

  return out.join('\n');
}

/* ------------------------------------------------------------------ PDF -- */

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const M = 56;
const BODY_W = PAGE_W - M * 2;

type Rgb = readonly [number, number, number];
const INK: Rgb = [0.07, 0.09, 0.11];
const MUTED: Rgb = [0.42, 0.45, 0.47];
const ACCENT: Rgb = [0.11, 0.49, 0.55];
const WARN: Rgb = [0.72, 0.33, 0.06];
const HAIRLINE: Rgb = [0.88, 0.9, 0.91];

type Font = { size: number; font: any };

export async function curriculumPdf(c: Curriculum, sessions: SessionSpan[] = []): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const serif = await doc.embedFont(StandardFonts.TimesRomanBold);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const sansBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const oblique = await doc.embedFont(StandardFonts.HelveticaOblique);

  const col = (v: readonly [number, number, number]) => rgb(v[0], v[1], v[2]);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - M;

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - M;
  };

  const room = (needed: number) => { if (y - needed < M) newPage(); };

  /** Word-wrapped text. pdf-lib has no layout engine, so wrapping is ours to do. */
  function para(
    text: string,
    f: Font,
    opts: { color?: Rgb; gap?: number; indent?: number; lineHeight?: number } = {},
  ) {
    const { color = INK, gap = 7, indent = 0, lineHeight = 1.45 } = opts;
    const size = f.size;
    const lh = size * lineHeight;
    const width = BODY_W - indent;
    // Sanitised once, here, so every caller -- cover, headings, modules, FAQs -- is covered by
    // the same rule rather than each remembering.
    const words = winAnsiSafe(text).split(/\s+/).filter(Boolean);
    let line = '';
    const flush = () => {
      if (!line) return;
      room(lh);
      page.drawText(line, { x: M + indent, y: y - size, size, font: f.font, color: col(color) });
      y -= lh;
      line = '';
    };
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (sans.widthOfTextAtSize(test, size) > width) flush();
      line = line ? `${line} ${w}` : w;
    }
    flush();
    y -= gap;
  }

  const rule = (gap = 12) => {
    room(gap + 2);
    page.drawLine({
      start: { x: M, y },
      end: { x: PAGE_W - M, y },
      thickness: 0.6,
      color: col(HAIRLINE),
    });
    y -= gap;
  };

  const heading = (text: string) => {
    room(30);
    y -= 8;
    para(text, { size: 13, font: sansBold }, { color: INK, gap: 8 });
    rule(10);
  };

  const subheading = (text: string) => {
    room(26);
    para(text, { size: 10.5, font: sansBold }, { color: ACCENT, gap: 5 });
  };

  const label = (text: string) => {
    room(22);
    para(text.toUpperCase(), { size: 7.5, font: sansBold }, { color: MUTED, gap: 3 });
  };

  // ---- cover block
  label('Curriculum');
  room(46);
  para(c.trainingTitle, { size: 22, font: serif }, { gap: 8 });
  para(`Prepared by ${c.trainerName}`, { size: 10, font: sans }, { color: MUTED, gap: 16 });
  rule(14);

  const b = timeBudget(c.modules, sessions);

  if (clean(c.promise)) {
    para(clean(c.promise), { size: 11, font: oblique }, { color: INK, gap: 12 });
  }

  if (clean(c.audience)) {
    heading('Who this is for');
    para(clean(c.audience), { size: 10, font: sans });
  }

  if (clean(c.outcomes)) {
    heading('What you will be able to do');
    for (const line of clean(c.outcomes).split('\n').filter(Boolean)) {
      para(`—  ${line.trim()}`, { size: 10, font: sans }, { indent: 4, gap: 4 });
    }
  }

  const story: [string, string | null][] = [
    ['Success stories and notes to take away', c.storyAdvice],
  ].filter(([, v]) => clean(v)) as [string, string | null][];

  if (story.length) {
    heading('Success stories and notes to take away');
    for (const [h, v] of story) {
      subheading(h);
      para(clean(v), { size: 10, font: sans });
    }
  }

  // ---- plan and timing
  heading('Plan and timing');

  if (!c.modules.length) {
    para('No modules planned yet.', { size: 10, font: sans }, { color: MUTED });
  }

  const sorted = [...c.modules].sort((a, z) => a.position - z.position);
  let i = 0;
  while (i < sorted.length) {
    const m = sorted[i];
    const mins = Number(m.minutes) || 0;

    room(46);
    const num = `${i + 1}`;
    page.drawText(num, { x: M, y: y - 12, size: 11, font: sansBold, color: col(ACCENT) });
    para(`${m.title}`, { size: 11, font: sansBold }, { indent: 22, gap: 2 });
    para(minutesLabel(mins), { size: 9, font: sans }, { color: MUTED, indent: 22, gap: 6 });
    if (clean(m.body)) para(clean(m.body), { size: 9.5, font: sans }, { indent: 22, gap: 10 });
    i++;
  }

  rule(12);
  para(
    `Total planned: ${minutesLabel(b.plannedMinutes)}`,
    { size: 10, font: sansBold },
    { gap: 4 },
  );
  if (sessions.length) {
    para(
`Total scheduled: ${minutesLabel(b.scheduledMinutes)} across ${sessions.length} session${sessions.length === 1 ? '' : 's'}`,
        { size: 9.5, font: sans },
        { color: MUTED, gap: 4 },
      );
  }

  // The over-budget warning is the most actionable line in the document. It goes on its own
  // line, in the warning colour, because it is the only thing here that is a warning.
  if (b.overBy > 0 && sessions.length) {
    room(40);
    para(
      `This plan is ${minutesLabel(b.overBy)} longer than the time scheduled. Trim the plan or add sessions before you teach it.`,
      { size: 9.5, font: sansBold },
      { color: WARN, gap: 8 },
    );
  }

  // ---- FAQs
  if (c.faqs.length) {
    heading('Questions people ask me');
    for (const f of [...c.faqs].sort((a, z) => a.position - z.position)) {
      subheading(f.question);
      para(clean(f.answer), { size: 9.5, font: sans }, { gap: 9 });
    }
  }

  return doc.save();
}