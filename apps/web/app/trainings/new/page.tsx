'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAccess } from '@/lib/client-auth';
import { PRICING_TIERS, formatNgn, quote, tierRangeText } from '@learnovize/shared';

type TierKey = 'basic' | 'standard' | 'premium';
// Narrowed locally because the shared constant infers as a plain string array.
const TIERS: readonly TierKey[] = ['basic', 'standard', 'premium'];

export default function NewTraining() {
  const router = useRouter();
  const [title, setTitle] = useState('Intro to Solar Installation');
  const [topic, setTopic] = useState('energy');
  const [description, setDescription] = useState('Live hands-on basics. No replays — attend live.');
  const [format, setFormat] = useState('video');
  const [accessType, setAccessType] = useState<'free' | 'paid'>('free');
  const [tier, setTier] = useState<TierKey>('basic');
  const [pricePerDay, setPricePerDay] = useState('1500');
  const [wantsCertificate, setWantsCertificate] = useState(true);
  const [minPct, setMinPct] = useState('80');
  const [cap, setCap] = useState('50');
  const [sessions, setSessions] = useState(
    '2026-10-20T09:00,2026-10-20T11:00\n2026-10-21T09:00,2026-10-21T11:00',
  );
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function parseSessions() {
    return sessions.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [a, b] = l.split(',').map((s) => s.trim());
      return { startsAtUtc: new Date(a).toISOString(), endsAtUtc: new Date(b).toISOString() };
    });
  }

  // Live preview of what the participant will pay.
  const parsed = parseSessions();
  const price = quote({
    accessType,
    pricePerDayNgn: accessType === 'paid' ? Number(pricePerDay) : null,
    sessions: parsed,
  });
  const band = PRICING_TIERS[tier] as { key: string; label: string; min: number; max: number | null };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const access = getAccess();
    if (!access) return setMsg({ ok: false, text: 'Log in as a trainer first.' });
    const r = await fetch('/api/trainings', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
      body: JSON.stringify({
        title, topic, description, format, accessType,
        tier: accessType === 'paid' ? tier : null,
        pricePerDayNgn: accessType === 'paid' ? Number(pricePerDay) : null,
        wantsCertificate: accessType === 'paid' && wantsCertificate,
        minPct: Number(minPct), cap: Number(cap), sessions: parsed,
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
      <form onSubmit={submit} className="card" style={{ marginTop: 18 }}>
        <label className="fl">Title</label>
        <input type="text" required minLength={3} value={title} onChange={(e) => setTitle(e.target.value)} style={{ maxWidth: '100%' }} />
        <label className="fl">Topic</label>
        <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} />
        <label className="fl">Description</label>
        <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />

        <label className="fl">Class type</label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {(['free', 'paid'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setAccessType(t)}
              aria-pressed={accessType === t}
              className={accessType === t ? 'btn primary' : 'btn'}
              style={{ textTransform: 'capitalize' }}
            >
              {t === 'free' ? '◎ Free class' : '₦ Paid class'}
            </button>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
          {accessType === 'free'
            ? 'Anyone can attend. No certificate is issued — attendees still earn points.'
            : 'Participants pay per day of class and receive a certificate.'}
        </p>

        {accessType === 'paid' && (
          <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            <label className="fl">Price category</label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {TIERS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTier(k)}
                  aria-pressed={tier === k}
                  className={tier === k ? 'btn primary' : 'btn'}
                >
                  {PRICING_TIERS[k].label}
                </button>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>{tierRangeText(tier)}</p>

            <label className="fl" style={{ marginTop: 12 }}>Price for each day of class</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span aria-hidden style={{ fontWeight: 800 }}>₦</span>
              <input
                type="text"
                inputMode="numeric"
                value={pricePerDay}
                onChange={(e) => setPricePerDay(e.target.value)}
                style={{ maxWidth: 160 }}
              />
            </div>
            <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
              {band.label} accepts {formatNgn(band.min)}
              {band.max !== null ? ` to ${formatNgn(band.max)}` : ' and above'} per day.
            </p>

            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontSize: 14 }}>
              <input type="checkbox" checked={wantsCertificate} onChange={(e) => setWantsCertificate(e.target.checked)} />
              Issue a certificate to participants who meet the attendance rule
            </label>
          </div>
        )}

        <div className="btnrow">
          <span><label className="fl">Format</label><select value={format} onChange={(e) => setFormat(e.target.value)}><option value="video">Video + audio</option><option value="audio">Audio-only</option></select></span>
          <span><label className="fl">Min %</label><select value={minPct} onChange={(e) => setMinPct(e.target.value)}><option value="60">60%</option><option value="80">80% (default)</option><option value="100">100%</option></select></span>
          <span><label className="fl">Cap</label><input type="text" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value)} style={{ maxWidth: 100 }} /></span>
        </div>

        <label className="fl">Sessions (one per line: startISO,endISO — stored UTC, shown Africa/Lagos)</label>
        <textarea rows={3} value={sessions} onChange={(e) => setSessions(e.target.value)} style={{ maxWidth: '100%', fontFamily: 'monospace' }} />

        <div className="card" style={{ marginTop: 14, background: 'var(--canvas)', borderLeft: '4px solid var(--accent)' }}>
          <p style={{ margin: 0, fontWeight: 800 }}>What participants see</p>
          {accessType === 'free' ? (
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 14 }}>Free · {price.days} day{price.days === 1 ? '' : 's'} · no certificate</p>
          ) : (
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 14 }}>
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