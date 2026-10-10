import Link from 'next/link';
import type { Metadata } from 'next';
import SiteNav from '../components/SiteNav';

export const metadata: Metadata = { title: 'Design system — Learnovize' };

/**
 * The Phase 1 design system, on one page, so the whole vocabulary can be judged
 * together before it is rolled out. Nothing here is used by the app yet; it is
 * the review surface for the palette, shape and pattern decisions.
 */

const PALETTE = [
  { group: 'Warm base', items: [
    { name: 'Canvas', token: '--bg', hex: '#FBF6EE', use: 'Page background' },
    { name: 'Card', token: '--card', hex: '#FFFFFF', use: 'Raised surfaces' },
    { name: 'Ink', token: '--ink', hex: '#241C15', use: 'Headings, body' },
    { name: 'Muted', token: '--mut', hex: '#7A6A5C', use: 'Secondary text' },
    { name: 'Line', token: '--line', hex: '#ECE1D3', use: 'Hairlines' },
  ]},
  { group: 'Semantic', items: [
    { name: 'Teal', token: '--accent', hex: '#1B7E8D', use: 'Lead, actions' },
    { name: 'Teal ink', token: '--accent-ink', hex: '#14616E', use: 'Text on light' },
    { name: 'Amber', token: '--gold', hex: '#9A6212', use: 'Paid, money' },
    { name: 'Green', token: '--leaf', hex: '#2F6B41', use: 'Earned, confirmed' },
    { name: 'Clay', token: '--clay', hex: '#B4552F', use: 'Warm secondary' },
  ]},
];

const RADII = [
  { k: '--r-xs', v: '10px', use: 'Inner badge' },
  { k: '--r-sm', v: '14px', use: 'Input, button' },
  { k: '--r-md', v: '20px', use: 'Card' },
  { k: '--r-lg', v: '28px', use: 'Hero, panel' },
  { k: '--r-full', v: '999px', use: 'Pill, circle' },
];

const SPACE = [
  { k: '--s-1', v: '4px' }, { k: '--s-2', v: '8px' }, { k: '--s-3', v: '12px' },
  { k: '--s-4', v: '16px' }, { k: '--s-5', v: '22px' }, { k: '--s-6', v: '30px' },
  { k: '--s-7', v: '44px' },
];

const SHADOWS = [
  { k: '--sh-1', v: 'Resting', style: 'var(--sh-1)' },
  { k: '--sh-2', v: 'Raised', style: 'var(--sh-2)' },
  { k: '--sh-3', v: 'Floating', style: 'var(--sh-3)' },
  { k: '--sh-tint', v: 'Teal glow', style: 'var(--sh-tint)' },
  { k: '--sh-gold', v: 'Amber glow', style: 'var(--sh-gold)' },
];

const PATTERNS = [
  { k: '--pat-weave', label: 'Weave', tint: 'tint-accent', note: 'Diagonal thread. Structure, order.' },
  { k: '--pat-arcs', label: 'Arcs', tint: 'tint-clay', note: 'Concentric. Growth, arrival.' },
  { k: '--pat-dots', label: 'Dots', tint: 'tint-leaf', note: 'A field. Community, many learners.' },
  { k: '--pat-chevron', label: 'Chevron', tint: 'tint-gold', note: 'Forward motion. Progression, points.' },
];

export default function DesignSystem() {
  return (
    <div className="wrap">
      <SiteNav />

      <h1>Design system</h1>
      <p className="sub">Phase 1 · warm base, shape, space, elevation, pattern. Review surface.</p>

      {/* ---- Palette ---- */}
      <h2 className="sec">Colour</h2>
      {PALETTE.map((g) => (
        <div key={g.group} style={{ marginBottom: 20 }}>
          <p className="eyebrow">{g.group}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
            {g.items.map((c) => (
              <div key={c.token} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ height: 64, background: c.hex }} />
                <div style={{ padding: '10px 12px' }}>
                  <b style={{ fontSize: 14, display: 'block' }}>{c.name}</b>
                  <code style={{ fontSize: 12, color: 'var(--mut)' }}>{c.token}</code>
                  <div style={{ fontSize: 12, color: 'var(--mut)' }}>{c.hex} · {c.use}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="card" style={{ background: 'var(--gold-soft)', border: 'none' }}>
        <p style={{ margin: 0, fontWeight: 800 }}>Colour carries meaning</p>
        <p className="muted" style={{ margin: '4px 0 0', fontSize: 14 }}>
          Teal is what you act on. Amber is anything involving money — a paid class, a
          price, a receipt. Green is what you have earned — a certificate, a confirmed
          attendance. They are not interchangeable, so the same idea looks the same
          everywhere it appears.
        </p>
      </div>

      {/* ---- Patterns ---- */}
      <h2 className="sec">Pattern</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
        {PATTERNS.map((p) => (
          <div key={p.k} className={`surface ${p.k.replace('--pat-', 'pat-')}`}
            style={{ borderRadius: 'var(--r-md)', border: '1px solid var(--line)', minHeight: 150, padding: 16 }}>
            <span className={`tile-icon ${p.tint}`} aria-hidden>◆</span>
            <b style={{ display: 'block', marginTop: 10, fontSize: 15 }}>{p.label}</b>
            <code style={{ fontSize: 12, color: 'var(--mut)' }}>{p.k}</code>
            <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>{p.note}</p>
          </div>
        ))}
      </div>

      <div className="surface surface-hero pat-dots" style={{ marginTop: 16 }}>
        <p style={{ margin: 0, fontWeight: 800, fontSize: 18 }}>How a hero would sit on a pattern</p>
        <p className="muted" style={{ margin: '4px 0 0', fontSize: 14, maxWidth: 520 }}>
          The wash keeps text at full contrast while the pattern stays visible behind it.
          Patterns belong on a surface like this, not behind a paragraph of copy.
        </p>
      </div>

      {/* ---- Shape ---- */}
      <h2 className="sec">Shape</h2>
      <div style={{ display: 'grid', gap: 10 }}>
        {RADII.map((r) => (
          <div key={r.k} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <code style={{ width: 90, fontSize: 12, color: 'var(--mut)' }}>{r.k}</code>
            <div style={{ width: 56, height: 40, background: 'var(--accent)', opacity: .85,
              borderRadius: `var(${r.k})`, flex: '0 0 56px' }} />
            <span style={{ fontSize: 14 }}>{r.v} · {r.use}</span>
          </div>
        ))}
      </div>

      {/* ---- Space ---- */}
      <h2 className="sec">Space</h2>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {SPACE.map((s) => (
          <div key={s.k} style={{ textAlign: 'center' }}>
            <div style={{ width: 22, height: parseInt(s.v), background: 'var(--accent-ink)', opacity: .7, borderRadius: 3 }} />
            <code style={{ display: 'block', fontSize: 11, color: 'var(--mut)', marginTop: 6 }}>{s.k}</code>
          </div>
        ))}
      </div>

      {/* ---- Elevation ---- */}
      <h2 className="sec">Elevation</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 14 }}>
        {SHADOWS.map((s) => (
          <div key={s.k} style={{ background: '#fff', borderRadius: 'var(--r-md)', padding: 18,
            boxShadow: s.style, border: '1px solid var(--line)' }}>
            <b style={{ fontSize: 14, display: 'block' }}>{s.v}</b>
            <code style={{ fontSize: 11, color: 'var(--mut)' }}>{s.k}</code>
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
        Shadows are tinted with the warm base rather than grey, so depth reads as light
        on paper. The two glows belong to teal and amber actions only.
      </p>

      {/* ---- Tiles ---- */}
      <h2 className="sec">Icon tiles</h2>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {(['tint-accent', 'tint-gold', 'tint-leaf', 'tint-clay', 'tint-neutral'] as const).map((t) => (
          <div key={t} style={{ textAlign: 'center' }}>
            <span className={`tile-icon ${t}`} aria-hidden>◎</span>
            <div style={{ fontSize: 11, color: 'var(--mut)', marginTop: 6 }}>{t.replace('tint-', '')}</div>
          </div>
        ))}
      </div>

      <p className="muted" style={{ marginTop: 40, fontSize: 13 }}>
        Phase 2 replaces buttons and cards to consume these tokens. Nothing in this page
        is wired into the product yet.
      </p>
    </div>
  );
}