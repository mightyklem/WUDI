'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch, getAccess } from '@/lib/client-auth';
import { PRICING_TIERS, formatNgn, quote, tierRangeText } from '@learnovize/shared';
import { lagosDateOptions, lagosRangeLabel, lagosTimeOptions, lagosToUtcIso, utcToLagosParts } from '@/lib/lagos';

type TierKey = 'basic' | 'standard' | 'premium';
const TIERS: readonly TierKey[] = ['basic', 'standard', 'premium'];

type Slot = { date: string; start: string; end: string };

// ONE day, seeded two days out, and empty below it.
//
// It used to arrive with two days filled in, which read as "this is a two-day class" before
// the trainer had decided anything. Most classes here are one day, and a second row that
// needs deleting is a decision the trainer did not make. Adding a day is one button away.
function defaultSlots(): Slot[] {
  const dates = lagosDateOptions(45);
  return [{ date: dates[2]?.value ?? '', start: '09:00', end: '11:00' }];
}

export default function NewTraining() {
  const router = useRouter();
  const [title, setTitle] = useState('Intro to Solar Installation');
  const [topic, setTopic] = useState('energy');
  // Empty by default now. It is optional, and a prefilled paragraph is a paragraph the
  // trainer has to read before deciding whether to keep it.
  const [description, setDescription] = useState('');
  // Format is fixed to video+audio and Min% to 60. Both were dropdowns whose default was
  // right almost every time, which makes a control that only ever gets clicked once.
  const format = 'video';
  const [accessType, setAccessType] = useState<'free' | 'paid'>('free');
  const [tier, setTier] = useState<TierKey>('basic');
  const [pricePerDay, setPricePerDay] = useState('1500');
  const [wantsCertificate, setWantsCertificate] = useState(true);
  const minPct = 60;
  const [cap, setCap] = useState('50');
  const [slots, setSlots] = useState<Slot[]>(defaultSlots);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Dropdowns rather than native date/time inputs, which render differently on
  // every browser and are awkward on a phone.
  const dateOptions = lagosDateOptions(45);
  const timeOptions = lagosTimeOptions();

  type Row =
  | { index: number; error: string }
  | { index: number; startsAtUtc: string; endsAtUtc: string };

  /** Turn the wall-clock rows into UTC sessions, reporting rows that are unusable. */
  function buildSessions(): Row[] {
    return slots.map((s, i): Row => {
      const start = lagosToUtcIso(s.date, s.start);
      const end = lagosToUtcIso(s.date, s.end);
      if (!start || !end) return { index: i, error: `Session ${i + 1}: pick a date and both times` };
      if (new Date(end).getTime() <= new Date(start).getTime()) {
        return { index: i, error: `Session ${i + 1}: the end time must be after the start time` };
      }
      return { index: i, startsAtUtc: start, endsAtUtc: end };
    });
  }

  const built = buildSessions();
  const badRow = built.find((r): r is { index: number; error: string } => 'error' in r);
  const sessions = built
    .filter((r): r is { index: number; startsAtUtc: string; endsAtUtc: string } => !('error' in r));

  // Only quote when every row is valid, so a half-typed row never shows a fake total.
  const price = quote({
    accessType,
    pricePerDayNgn: accessType === 'paid' ? Number(pricePerDay) : null,
    sessions: badRow ? [] : sessions,
  });
  const band = PRICING_TIERS[tier] as { key: string; label: string; min: number; max: number | null };

  const setSlot = (i: number, next: Partial<Slot>) =>
    setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...next } : s)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const access = getAccess();
    if (!access) return setMsg({ ok: false, text: 'Log in as a trainer first.' });
    if (badRow) return setMsg({ ok: false, text: badRow.error });

    const r = await authFetch('/api/trainings', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
      body: JSON.stringify({
        title, topic, description, format, accessType,
        tier: accessType === 'paid' ? tier : null,
        pricePerDayNgn: accessType === 'paid' ? Number(pricePerDay) : null,
        wantsCertificate: accessType === 'paid' && wantsCertificate,
        minPct: Number(minPct), cap: Number(cap), sessions,
      }),
    });
    const j = await r.json();
    if (!r.ok) return setMsg({ ok: false, text: j.error || 'Create failed' });
    router.push(`/trainings/${j.training.id}`);
  }

  return (
    <div className="wrap">
      <h1>New training.</h1>
      <p className="sub">An invite link with preview is generated on save.</p>
      <form onSubmit={submit} className="card u-mt-3">
        <label className="fl">Title</label>
        <input type="text" required minLength={3} value={title} onChange={(e) => setTitle(e.target.value)} style={{ maxWidth: '100%' }} />
        <label className="fl">Topic</label>
        <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} />
        <label className="fl">
          Description <span className="muted" style={{ fontWeight: 500 }}>— optional</span>
        </label>
        <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="What somebody will be able to do afterwards. You can leave this empty." />

        <label className="fl">Class type</label>
        <div className="u-chips">
          {(['free', 'paid'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setAccessType(t)}
              aria-pressed={accessType === t} className={accessType === t ? 'btn primary' : 'btn'}
              style={{ textTransform: 'capitalize' }}>
              {t === 'free' ? '◎ Free class' : '₦ Paid class'}
            </button>
          ))}
        </div>
        <p className="muted u-hint">
          {accessType === 'free'
            ? 'Anyone can attend. No certificate is issued — attendees still earn points.'
            : 'Participants pay per day of class and receive a certificate.'}
        </p>

        {accessType === 'paid' && (
          <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            <label className="fl">Price category</label>
            <div className="u-chips">
              {TIERS.map((k) => (
                <button key={k} type="button" onClick={() => setTier(k)}
                  aria-pressed={tier === k} className={tier === k ? 'btn primary' : 'btn'}>
                  {PRICING_TIERS[k].label}
                </button>
              ))}
            </div>
            <p className="muted u-hint">{tierRangeText(tier)}</p>

            <label className="fl u-mt-2">Price for each day of class</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span aria-hidden style={{ fontWeight: 800 }}>₦</span>
              <input type="text" inputMode="numeric" value={pricePerDay}
                onChange={(e) => setPricePerDay(e.target.value)} style={{ maxWidth: 160 }} />
            </div>
            <p className="muted u-hint">
              {band.label} accepts {formatNgn(band.min)}{band.max !== null ? ` to ${formatNgn(band.max)}` : ' and above'} per day.
            </p>

            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontSize: 14 }}>
              <input type="checkbox" checked={wantsCertificate} onChange={(e) => setWantsCertificate(e.target.checked)} />
              Issue a certificate to participants who meet the attendance rule
            </label>
          </div>
        )}

        {/* Format and Min% are gone from the form -- both had a default that was right
            essentially always, so they were controls that got clicked once and never again.
            Format is video+audio and the attendance bar is 60%, which is what the schema
            defaults to anyway. */}
        <div className="btnrow">
          <span>
            <label className="fl">Cap attendance</label>
            <input type="text" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value)} style={{ maxWidth: 100 }} />
          </span>
        </div>

        <label className="fl" style={{ marginTop: 14 }}>Sessions · times are Africa/Lagos</label>
        <div style={{ display: 'grid', gap: 10 }}>
          {slots.map((s, i) => (
            <div key={i} className="u-chips-sm">
              <span className="ibadge" style={{ background: 'var(--pill)', color: 'var(--ink)' }} aria-hidden>{i + 1}</span>
              <select value={s.date} onChange={(e) => setSlot(i, { date: e.target.value })} aria-label={`Session ${i + 1} date`} style={{ minWidth: 150 }}>
                <option value="" disabled>Pick a date</option>
                {dateOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select value={s.start} onChange={(e) => setSlot(i, { start: e.target.value })} aria-label={`Session ${i + 1} start time`}>
                <option value="" disabled>Start</option>
                {timeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <span className="muted">to</span>
              <select value={s.end} onChange={(e) => setSlot(i, { end: e.target.value })} aria-label={`Session ${i + 1} end time`}>
                <option value="" disabled>End</option>
                {timeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {slots.length > 1 && (
                <button type="button" className="btn link" onClick={() => setSlots((prev) => prev.filter((_, x) => x !== i))}>
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="btnrow u-mt-half">
          <button type="button" className="btn" onClick={() => setSlots((prev) => [...prev, { date: '', start: '09:00', end: '11:00' }])}>
            + Add a day
          </button>
        </div>
        {badRow && <p className="err u-mt-half">{badRow.error}</p>}
        {!badRow && sessions.length > 0 && (
          <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
            {sessions.map((s, i) => `${i + 1}. ${lagosRangeLabel(s.startsAtUtc, s.endsAtUtc)}`).join('  ·  ')}
          </p>
        )}

        <div className="card" style={{ marginTop: 14, background: 'var(--canvas)', borderLeft: '4px solid var(--accent)' }}>
          <p className="u-h">What participants see</p>
          {accessType === 'free' ? (
            <p className="muted u-note14">
              Free · {price.days} day{price.days === 1 ? '' : 's'} · no certificate
            </p>
          ) : (
            <p className="muted u-note14">
              {formatNgn(price.pricePerDayNgn ?? 0)} × {price.days} day{price.days === 1 ? '' : 's'} ={' '}
              <b style={{ color: 'var(--ink)' }}>{formatNgn(price.totalNgn)}</b>
              {wantsCertificate ? ' · certificate included' : ' · no certificate'}
            </p>
          )}
        </div>

        <div className="btnrow"><button className="btn primary" type="submit">Create + get invite link</button></div>
        {msg && <div className={msg.ok ? 'okmsg' : 'err'}>{msg.text}</div>}
      </form>
    </div>
  );
}