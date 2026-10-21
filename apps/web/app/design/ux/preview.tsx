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
            <span style={{ display: 'block', fontWeight: 800, fontSize: 17 }}>{w.text}</span>
            <span className="u-sub" style={{ fontSize: 13 }}>
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
        accent="#FBBF24"
        tabs={[
          { key: 'upcoming', label: 'Upcoming', count: 3 },
          { key: 'past', label: 'Past', count: 15 },
        ]}
      />
      <p className="u-sub" style={{ marginTop: 14, fontSize: 13 }}>
        {tab === 'upcoming'
          ? 'The strip sits on a surface of its own, and the gap under it keeps the chosen tab from reading as part of the card below.'
          : 'The same strip, the other side. Press a tab to see it move.'}
      </p>
    </>
  );
}
