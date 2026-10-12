'use client';

export type ProductType = 'digital' | 'coaching' | 'course' | 'custom' | 'link';

const TYPES: { key: ProductType; icon: string; name: string; note: string }[] = [
  { key: 'digital', icon: '📦', name: 'Digital Product', note: 'PDFs, guides, templates, session content, eBooks' },
  { key: 'coaching', icon: '🎧', name: 'Coaching Call', note: 'Book discovery calls and 1:1 coaching' },
  { key: 'course', icon: '🎓', name: 'eCourse', note: 'Create, host and sell your course in one place' },
  { key: 'custom', name: 'Custom Product', icon: '📦', note: 'Ask me anything — requests, audits, analysis, video reviews' },
  { key: 'link', icon: '🔗', name: 'URL / Media', note: 'A link to a website, affiliate, or content from YouTube' },
];

/**
 * One tap to choose what kind of thing this is, then one field to describe it.
 *
 * A trainer standing in a live class should not be filling in a form. The grid
 * mirrors the shape trainers already know from other storefronts, and picking a
 * tile is the entire decision -- everything after it is a consequence of the
 * type they chose.
 */
export default function ProductTypeGrid({ onPick }: { onPick: (t: ProductType) => void }) {
  return (
    <div className="ptg">
      {TYPES.map((t) => (
        <button key={t.key} type="button" className="ptg-card" onClick={() => onPick(t.key)}>
          <span className="ptg-icon" aria-hidden>{t.icon}</span>
          <span className="ptg-text">
            <span className="ptg-name">{t.name}</span>
            <span className="ptg-note">{t.note}</span>
          </span>
        </button>
      ))}
    </div>
  );
}