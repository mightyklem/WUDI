'use client';

import { useState } from 'react';
import Tabs from '../../components/Tabs';
import Icon from '../../../components/Icon';
import { GREETING_WINDOWS } from '@/lib/dashboard-roles';

/**
 * The live pieces of the review board.
 *
 * The board is meant to be looked at rather than argued about, so anything on it that
 * exists on a real screen is the real component, not a drawing of it. The tab strip here
 * is the same `Tabs` the trainer gets, with the same gold, and the greeting marks are
 * the same marks the home page draws.
 */

/** The four greetings and the hours they cover, from the one list both read. */
export function GreetingStrip() {
  const seen = new Set<string>();
  const windows = GREETING_WINDOWS.filter((w) => {
    if (seen.has(w.text)) return false;
    seen.add(w.text);
    return true;
  });

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {windows.map((w) => (
        <div
          key={w.text}
          style={{
            display: 'flex', alignItems: 'center', gap: 14,
            background: 'var(--card)', border: '1px solid var(--line)',
            borderRadius: 'var(--r-md)', padding: '14px 16px',
          }}
        >
          <span style={{ display: 'inline-flex', color: 'var(--accent)' }}>
            <Icon name={w.icon} size={28} strokeWidth={2} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontWeight: 800, fontSize: 'var(--t-md)' }}>{w.text}</span>
            <span className="u-sub" style={{ fontSize: 'var(--t-sm)' }}>
              {String(w.from).padStart(2, '0')}:00 &ndash; {String(w.to).padStart(2, '0')}:00 Lagos
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** The trainer's tab strip, exactly as the dashboard draws it. */
export function TrainerTabs() {
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  return (
    <>
      <Tabs
        value={tab}
        onChange={setTab}
        variant="gold"
        tabs={[
          { key: 'upcoming', label: 'Upcoming', count: 3 },
          { key: 'past', label: 'Past', count: 15 },
        ]}
      />
      <p className="u-sub" style={{ marginTop: 14, fontSize: 'var(--t-sm)' }}>
        {tab === 'upcoming'
          ? 'The strip sits on a surface of its own, and the gap under it keeps the chosen tab from reading as part of the card below.'
          : 'The same strip, the other side. Press a tab to see it move.'}
      </p>
    </>
  );
}

/**
 * The type scale, at its real sizes.
 *
 * The scale is the one the app uses, not a picture of it, so what is judged here is
 * what is read on the phone.
 */
export function TypeScale() {
  const steps: { token: string; sample: string; note: string }[] = [
    { token: '--t-xs', sample: 'The smallest writing: a time, a label', note: '13px — was 12' },
    { token: '--t-sm', sample: 'The line under a title, and a button', note: '15px — was 13.5' },
    { token: '--t-base', sample: 'A whole sentence of ordinary text', note: '16.5px — was 15' },
    { token: '--t-md', sample: 'The name of a class', note: '19px — was 17' },
    { token: '--t-lg', sample: 'A section heading', note: '23px — was 21' },
    { token: '--t-2xl', sample: 'The greeting at the top of the page', note: '34px — was 32' },
  ];
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {steps.map((s) => (
        <div
          key={s.token}
          style={{
            background: 'var(--card)', border: '1px solid var(--line)',
            borderRadius: 'var(--r-md)', padding: '12px 16px',
          }}
        >
          <p style={{ margin: 0, fontSize: `var(${s.token})`, fontWeight: 700, lineHeight: 1.35 }}>
            {s.sample}
          </p>
          <p className="u-sub" style={{ margin: '4px 0 0', fontSize: 'var(--t-sm)' }}>
            <code>{s.token}</code> &middot; {s.note}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * The three ways the app can look, with the marks the floating button uses.
 *
 * The real marks, because the button is the one place somebody meets them, and a
 * drawing of a sun is not a sun.
 */
export function AppearanceChoices() {
  const [choice, setChoice] = useState<'system' | 'light' | 'dark'>('system');
  const items: { key: 'system' | 'light' | 'dark'; label: string; icon: 'monitor' | 'sun' | 'moon'; note: string }[] = [
    { key: 'system', label: 'System', icon: 'monitor', note: 'Follows the phone. Turns dark at sunset on its own.' },
    { key: 'light', label: 'Light', icon: 'sun', note: 'Always the light surface, whatever the phone is doing.' },
    { key: 'dark', label: 'Dark', icon: 'moon', note: 'Always the dark surface. For a room with the lights off.' },
  ];
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {items.map((it) => {
        const on = choice === it.key;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => setChoice(it.key)}
            aria-pressed={on}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left',
              background: on ? 'var(--accent-soft)' : 'var(--card)',
              border: `1px solid ${on ? 'var(--accent-mark)' : 'var(--line)'}`,
              borderRadius: 'var(--r-md)', padding: '14px 16px', cursor: 'pointer',
              font: 'inherit', color: 'var(--ink)', width: '100%',
            }}
          >
            <span style={{ display: 'inline-flex', color: 'var(--accent-mark)' }}>
              <Icon name={it.icon} size={26} strokeWidth={1.9} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 800, fontSize: 'var(--t-md)' }}>{it.label}</span>
              <span className="u-sub" style={{ fontSize: 'var(--t-sm)' }}>{it.note}</span>
            </span>
            {on && (
              <span aria-hidden style={{ color: 'var(--accent-ink)', fontWeight: 900, fontSize: 'var(--t-md)' }}>✓</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
