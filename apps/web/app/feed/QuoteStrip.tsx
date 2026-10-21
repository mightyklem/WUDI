'use client';
import { useEffect, useState } from 'react';

/**
 * Rotating quote strip for the Explore feed. Flat and outlined to match the design system —
 * no gradients, no images, so it renders identically everywhere.
 */
const QUOTES: { text: string; author: string }[] = [
  {
    text: 'Success is making the world around you better than you met it.',
    author: 'Pastor Chris',
  },
  {
    text: 'You cannot change yesterday, but you can do something today that can change tomorrow.',
    author: 'Pastor Chris',
  },
  {
    text: 'Success is waiting for the man who says YES to success.',
    author: 'Pastor Chris',
  },
];

const ROTATE_MS = 9000;

export function QuoteStrip() {
  const [i, setI] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % QUOTES.length), ROTATE_MS);
    return () => clearInterval(t);
  }, []);

  const q = QUOTES[i];

  return (
    <section
      aria-label="Quote"
      style={{
        marginTop: 16,
        padding: '22px 24px',
        background: 'var(--card)',
        border: '1px solid var(--line)',
        borderRadius: 14,
        borderLeft: '4px solid var(--accent)',
      }}
    >
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <span aria-hidden style={{ fontSize: 'var(--t-2xl)', lineHeight: 1, color: 'var(--accent)' }}>&ldquo;</span>
        <div style={{ flex: 1 }}>
          <p
            style={{
              margin: 0,
              fontSize: 'var(--t-md)',
              lineHeight: 1.45,
              fontWeight: 600,
              color: 'var(--ink)',
            }}
          >
            {q.text}
          </p>
          <p style={{ margin: '10px 0 0', fontSize: 'var(--t-sm)', color: 'var(--mut)', letterSpacing: '.02em' }}>
            &mdash; {q.author}
          </p>
        </div>
      </div>

      {/* Dots double as manual controls: click to jump, no waiting. */}
      <div style={{ display: 'flex', gap: 6, marginTop: 16, marginLeft: 46 }}>
        {QUOTES.map((item, n) => (
          <button
            key={item.text}
            type="button"
            onClick={() => setI(n)}
            aria-label={`Show quote ${n + 1} of ${QUOTES.length}`}
            aria-current={n === i}
            style={{
              width: n === i ? 22 : 8,
              height: 8,
              padding: 0,
              borderRadius: 4,
              cursor: 'pointer',
              background: n === i ? 'var(--accent)' : 'var(--n-200)',
              border: '1px solid',
              borderColor: n === i ? 'var(--accent)' : 'var(--n-300)',
            }}
          />
        ))}
      </div>
    </section>
  );
}