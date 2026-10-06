'use client';

/**
 * Simple gradient banner carrying the brand motto. Deliberately plain: one idea,
 * easy to read at a glance, nothing to decode.
 */
export function HeroCard(props: { line: string }) {
  return (
    <section
      style={{
        marginTop: 16,
        padding: '26px 24px',
        borderRadius: 20,
        color: '#fff',
        background: 'linear-gradient(135deg, #1B7E8D 0%, #155E6B 60%, #123F4C 100%)',
        boxShadow: 'var(--sh-3)',
      }}
    >
      <p style={{ margin: 0, fontSize: 21, fontWeight: 800, lineHeight: 1.35 }}>{props.line}</p>
    </section>
  );
}