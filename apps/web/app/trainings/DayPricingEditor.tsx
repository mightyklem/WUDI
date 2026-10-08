'use client';
import { useState } from 'react';
import { getAccess } from '@/lib/client-auth';
import { formatNgn, PRICING_TIERS, tierRangeText } from '@learnovize/shared';

export type EditableDay = {
  id: string;
  dayIndex: number;
  topic: string | null;
  dateUtc: string;
  accessType: string;
  priceNgn: number;
  sessionCount: number;
  enrolled: number;
  started: boolean;
};

type Props = {
  trainingId: string;
  days: EditableDay[];
  tier: string | null;
  accessType: string;
  /** Locked once anyone has registered or a day has begun. */
  locked: boolean;
};

/**
 * Trainer screen for per-day pricing (FR-11): set each day's topic, mark a single
 * day of a paid class free, or reprice it inside the class's category band.
 */
export default function DayPricingEditor({ trainingId, days, tier, accessType, locked }: Props) {
  const [rows, setRows] = useState(days);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const patch = (id: string, next: Partial<EditableDay>) => {
    setRows((prev) => prev.map((d) => (d.id === id ? { ...d, ...next } : d)));
  };

  async function save(day: EditableDay) {
    const access = getAccess();
    if (!access) return setMsg({ ok: false, text: 'Log in as a trainer first.' });
    setSaving(day.id);
    setMsg(null);
    try {
      const r = await fetch(`/api/trainings/${trainingId}/days`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
        body: JSON.stringify({
          dayId: day.id,
          topic: day.topic,
          accessType: day.accessType,
          priceNgn: day.priceNgn,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setMsg({ ok: false, text: j.error || 'Could not save this day' });
        // Re-sync with the server so a rejected edit does not look applied.
        setRows(days);
        return;
      }
      patch(day.id, { accessType: j.day.accessType, priceNgn: j.day.priceNgn, topic: j.day.topic });
      setMsg({ ok: true, text: `Day ${day.dayIndex} saved` });
    } finally {
      setSaving(null);
    }
  }

  if (accessType !== 'paid') {
    return (
      <div>
        <p className="muted" style={{ margin: '0 0 10px', fontSize: 14 }}>
          This is a free class, so every day is free. It issues no certificate —
          attendees still earn points.
        </p>
        <DayList rows={rows} onTopic={locked ? undefined : patch} />
      </div>
    );
  }

  const band = tier && (PRICING_TIERS as Record<string, { label: string; min: number; max: number | null }>)[tier];

  return (
    <div>
      <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>
        {band ? `${band.label} · ${tierRangeText(tier)}` : 'Set a category first'}
      </p>
      <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
        Price each day, or open one for free. A learner pays only for the days they pick.
      </p>

      {locked && (
        <p className="muted" style={{ fontSize: 13, margin: '0 0 12px' }}>
          Day prices are locked once participants have registered.
        </p>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {rows.map((d) => {
          const free = d.accessType !== 'paid';
          const priceLocked = locked || d.started;
          return (
            <div
              key={d.id}
              style={{ border: '1px solid var(--line)', borderRadius: 14, padding: 14 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span className="ibadge" style={{ background: '#EEF1F4', color: '#1C2430' }} aria-hidden>
                  {d.dayIndex}
                </span>
                <input
                  type="text"
                  value={d.topic ?? ''}
                  placeholder={`Day ${d.dayIndex}`}
                  onChange={(e) => patch(d.id, { topic: e.target.value })}
                  disabled={priceLocked}
                  style={{ flex: 1, minWidth: 160 }}
                />
                <span className="muted" style={{ fontSize: 13 }}>{d.dateUtc}</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={free ? 'btn' : 'btn primary'}
                  aria-pressed={!free}
                  disabled={priceLocked}
                  onClick={() =>
                    patch(d.id, free
                      ? { accessType: 'paid', priceNgn: band ? band.min : d.priceNgn }
                      : { accessType: 'free', priceNgn: 0 })
                  }
                >
                  {free ? 'Make paid' : 'Make free'}
                </button>
                {!free && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="muted" style={{ fontSize: 13 }}>per day</span>
                    <span aria-hidden>₦</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={d.priceNgn}
                      onChange={(e) => patch(d.id, { priceNgn: Number(e.target.value.replace(/[^0-9]/g, '')) })}
                      disabled={priceLocked}
                      style={{ maxWidth: 110 }}
                    />
                  </label>
                )}
                <span className="muted" style={{ fontSize: 13 }}>
                  {free ? 'Free' : formatNgn(d.priceNgn)}
                </span>
                <span className="muted" style={{ fontSize: 13, marginLeft: 'auto' }}>
                  {d.sessionCount} session{d.sessionCount === 1 ? '' : 's'} · {d.enrolled} enrolled
                </span>
              </div>

              {!priceLocked && (
                <div className="btnrow" style={{ marginTop: 8 }}>
                  <button className="btn" disabled={saving === d.id} onClick={() => save(d)}>
                    {saving === d.id ? 'Saving…' : 'Save day'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {msg && <div className={msg.ok ? 'okmsg' : 'err'} style={{ marginTop: 10 }}>{msg.text}</div>}
    </div>
  );
}

function DayList({ rows, onTopic }: { rows: EditableDay[]; onTopic?: (id: string, next: Partial<EditableDay>) => void }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {rows.map((d) => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="ibadge" style={{ background: '#EEF1F4', color: '#1C2430' }} aria-hidden>{d.dayIndex}</span>
          {onTopic ? (
            <input
              type="text"
              value={d.topic ?? ''}
              placeholder={`Day ${d.dayIndex}`}
              onChange={(e) => onTopic(d.id, { topic: e.target.value })}
              style={{ flex: 1, minWidth: 140 }}
            />
          ) : (
            <span style={{ flex: 1, minWidth: 140, fontWeight: 700 }}>{d.topic || `Day ${d.dayIndex}`}</span>
          )}
          <span className="muted" style={{ fontSize: 13 }}>{d.dateUtc}</span>
          <span className="muted" style={{ fontSize: 13 }}>
            {d.sessionCount} session{d.sessionCount === 1 ? '' : 's'} · {d.enrolled} enrolled
          </span>
        </div>
      ))}
    </div>
  );
}