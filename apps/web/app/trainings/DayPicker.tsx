'use client';
import { useState } from 'react';
import { getAccess } from '@/lib/client-auth';
import { formatNgn } from '@learnovize/shared';
import CertConsent from './CertConsent';

export type PickerDay = {
  id: string;
  dayIndex: number;
  topic: string | null;
  dateUtc: string;
  accessType: string;
  priceNgn: number;
};

type Props = {
  trainingId: string;
  days: PickerDay[];
  full: boolean;
  /** Certificate copy differs between free and paid classes. */
  certMode: string;
  minPct: number;
  totalDays: number;
};

/**
 * Learner picks which days they will attend (FR-11). The running total updates
 * as they tick days, and registering reserves those specific days.
 */
export default function DayPicker({ trainingId, days, full, certMode, minPct, totalDays }: Props) {
  const [picked, setPicked] = useState<string[]>(days.map((d) => d.id));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Unticked by default. See CertConsent — publishing must be an affirmative choice.
  const [certConsentPublic, setCertConsentPublic] = useState(false);
  const access = typeof window !== 'undefined' ? getAccess() : null;

  const chosen = days.filter((d) => picked.includes(d.id));
  const total = chosen.reduce((sum, d) => sum + d.priceNgn, 0);
  const isFree = days.every((d) => d.accessType !== 'paid');

  const toggle = (id: string) => {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  async function submit() {
    if (!access) return setMsg('Log in first, then register.');
    if (!picked.length) return setMsg('Choose at least one day to attend.');
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/trainings/${trainingId}/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
        body: JSON.stringify({ certConsentPublic, dayIds: picked }),
      });
      const j = await r.json();
      if (!r.ok) {
        setMsg(j.error || 'Registration failed');
        return;
      }
      if (j.requiresPayment) {
        const pay = await fetch(`/api/registrations/${j.registration.id}/checkout`, {
          method: 'POST',
          headers: { authorization: `Bearer ${access}` },
        });
        const pj = await pay.json();
        if (pj.payUrl) {
          window.location.href = pj.payUrl;
          return;
        }
        setMsg(pj.paid ? 'Seat reserved and payment settled.' : `Seat reserved. ${pj.error || ''}`);
        return;
      }
      setMsg(`Registered for ${chosen.length} day${chosen.length === 1 ? '' : 's'}. Confirmation in your inbox.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p style={{ margin: '0 0 10px', fontWeight: 800, fontSize: 16 }}>
        Choose the days you will attend
      </p>
      <div style={{ display: 'grid', gap: 10 }}>
        {days.map((d) => {
          const on = picked.includes(d.id);
          const free = d.accessType !== 'paid';
          return (
            <label
              key={d.id}
              style={{
                display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer',
                border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
                background: on ? 'var(--canvas)' : '#fff',
                borderRadius: 14, padding: '12px 14px',
              }}
            >
              <input type="checkbox" checked={on} onChange={() => toggle(d.id)} style={{ width: 18, height: 18 }} />
              <span className="ibadge" style={{ background: '#EEF1F4', color: '#1C2430' }} aria-hidden>
                {d.dayIndex}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 700, fontSize: 15 }}>
                  {d.topic || `Day ${d.dayIndex}`}
                </span>
                <span className="muted" style={{ fontSize: 13 }}>{d.dateUtc}</span>
              </span>
              <span style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
                {free ? 'Free' : formatNgn(d.priceNgn)}
              </span>
            </label>
          );
        })}
      </div>

      {/* Consent is only meaningful where a certificate exists at all, so it is not
          shown for classes that issue none. */}
      {certMode !== 'none' && (
        <CertConsent
          checked={certConsentPublic}
          onChange={setCertConsentPublic}
          id={`cert-day-${trainingId}`}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontWeight: 800 }}>
          {isFree ? 'Free class' : `${formatNgn(total)} total`}
        </p>
        <span className="muted" style={{ fontSize: 13 }}>
          {picked.length} of {totalDays} day{picked.length === 1 ? '' : 's'}
        </span>
        <button className="btn primary" disabled={full || busy || !picked.length} onClick={submit}>
          {full ? 'Full' : busy ? 'Working…' : isFree ? 'Register free' : `Register · ${formatNgn(total)}`}
        </button>
      </div>

      {certMode !== 'none' && (
        <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
          Your certificate covers the {picked.length || 'chosen'} day{picked.length === 1 ? '' : 's'} you attend.
          Meet at least {minPct}% of them.
        </p>
      )}
      {isFree && (
        <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
          Free classes issue no certificate — attendees still earn points.
        </p>
      )}
      {msg && <p className="muted" style={{ marginTop: 10 }}>{msg}</p>}
    </div>
  );
}