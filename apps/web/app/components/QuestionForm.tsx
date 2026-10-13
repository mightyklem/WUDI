'use client';
import { QUESTIONS } from '@learnovize/shared';

export type Answers = Record<string, string | string[]>;

const SECTIONS = [
  { id: 'about', title: 'About you', ids: ['displayName', 'city', 'currently', 'ageGroup'] },
  { id: 'skill', title: 'Your skill', ids: ['bestSkill', 'howLearned', 'years'] },
  { id: 'teaching', title: 'Teaching', ids: ['taughtBefore', 'teachingStory', 'whereShare'] },
  { id: 'reach', title: 'Reach and proof', ids: ['evidence', 'platforms', 'whoAsks', 'whatHelps', 'chatOk', 'contact'] },
];

/**
 * Renders the application form from the shared QUESTIONS list.
 *
 * The question list is the single source of truth. Defining these fields here as well
 * would let the form, the scoring and the review queue drift apart -- someone adds an
 * option to HOW_LEARNED, the scoring gives it 8 points, and the form never offers it.
 */
export default function QuestionForm({
  answers,
  errors,
  onChange,
  disabled,
}: {
  answers: Answers;
  errors: string[];
  onChange: (id: string, value: string | string[]) => void;
  disabled?: boolean;
}) {
  const errorFor = (label: string) => errors.find((e) => e.startsWith(label));

  return (
    <div>
      {SECTIONS.map((section) => (
        <fieldset key={section.id} style={{ border: 0, padding: 0, margin: '0 0 26px' }}>
          <legend style={{ fontWeight: 800, fontSize: 16, marginBottom: 4, padding: 0 }}>
            {section.title}
          </legend>
          {section.ids.map((id) => {
            const q = QUESTIONS.find((x) => x.id === id);
            if (!q) return null;
            const err = errorFor(q.label);
            const value = answers[id];

            return (
              <div key={q.id} style={{ marginTop: 14 }}>
                <label className="fl" htmlFor={`q-${q.id}`}>
                  {q.label}
                  {q.required ? ' *' : ''}
                </label>
                {q.hint && <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{q.hint}</div>}

                {q.kind === 'text' && (
                  <input
                    id={`q-${q.id}`} type="text" disabled={disabled}
                    maxLength={q.maxLength}
                    value={(value as string) || ''}
                    onChange={(e) => onChange(q.id, e.target.value)}
                    style={err ? { borderColor: 'var(--clay-ink)' } : undefined}
                  />
                )}

                {q.kind === 'longtext' && (
                  <textarea
                    id={`q-${q.id}`} rows={4} disabled={disabled}
                    maxLength={q.maxLength}
                    value={(value as string) || ''}
                    onChange={(e) => onChange(q.id, e.target.value)}
                  />
                )}

                {q.kind === 'single' && (
                  <select
                    id={`q-${q.id}`} disabled={disabled}
                    value={(value as string) || ''}
                    onChange={(e) => onChange(q.id, e.target.value)}
                  >
                    <option value="">Choose…</option>
                    {q.options?.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                )}

                {q.kind === 'multi' && (
                  <div style={{ display: 'grid', gap: 4 }}>
                    {q.options?.map((o) => {
                      const list = Array.isArray(value) ? (value as string[]) : [];
                      const checked = list.includes(o.value);
                      const atLimit = !!q.max && list.length >= q.max && !checked;
                      return (
                        <label key={o.value} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, fontWeight: 400 }}>
                          <input
                            type="checkbox" disabled={disabled || atLimit}
                            checked={checked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...list, o.value]
                                : list.filter((x) => x !== o.value);
                              onChange(q.id, next);
                            }}
                          />
                          <span style={{ opacity: atLimit ? 0.45 : 1 }}>{o.label}</span>
                        </label>
                      );
                    })}
                    {q.max && (
                      <div className="muted" style={{ fontSize: 12 }}>
                        Pick up to {q.max}. {((value as string[]) || []).length} chosen.
                      </div>
                    )}
                  </div>
                )}

                {q.kind === 'urls' && (
                  <div style={{ display: 'grid', gap: 6 }}>
                    {Array.from({ length: 3 }, (_, i) => {
                      const list = Array.isArray(value) ? (value as string[]) : [];
                      return (
                        <input
                          key={i} type="url" disabled={disabled}
                          placeholder={i === 0 ? q.placeholder : 'https://'}
                          value={list[i] || ''}
                          onChange={(e) => {
                            const next = [...list];
                            if (e.target.value) next[i] = e.target.value; else next.splice(i, 1);
                            onChange(q.id, next.filter(Boolean));
                          }}
                        />
                      );
                    })}
                  </div>
                )}

                {err && <div className="err" style={{ fontSize: 13, marginTop: 6 }}>{err}</div>}
              </div>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}

export { SECTIONS };