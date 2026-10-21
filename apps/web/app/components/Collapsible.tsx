'use client';
import { useEffect, useState, type ReactNode } from 'react';

/**
 * A section that is closed until asked for.
 *
 * Used for the parts of the class page a trainer needs occasionally but not while they are
 * deciding whether to run the class at all: day pricing, moderators, certificate issuing.
 * Those are three decisions stacked on somebody who came here to share a link, and they were
 * open by default because there was nowhere else to put them.
 *
 * Not a <details> element on purpose: the heading has to match the card styling and the
 * chevron needs to animate, and driving the native one from React means tracking its state
 * anyway.
 */
export default function Collapsible({
  title,
  hint,
  defaultOpen = false,
  children,
}: {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  // Open straight away when the page was linked to directly, so the link is never a no-op.
  useEffect(() => {
    if (window.location.hash === '#settings') setOpen(true);
  }, []);

  return (
    <section style={{ marginTop: 26 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="class-settings"
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          background: 'none', border: 0, padding: 0, margin: 0,
          font: 'inherit', color: 'inherit', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span className="sec" style={{ margin: 0 }}>{title}</span>
        <span
          aria-hidden
          style={{
            marginLeft: 'auto', color: 'var(--mut)', fontSize: 'var(--t-sm)',
            transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s ease',
          }}
        >
          ▾
        </span>
      </button>
      {hint && <p className="muted" style={{ fontSize: 'var(--t-sm)', margin: '4px 0 0' }}>{hint}</p>}

      {open && (
        <div id="class-settings" style={{ marginTop: 14 }}>
          {children}
        </div>
      )}
    </section>
  );
}