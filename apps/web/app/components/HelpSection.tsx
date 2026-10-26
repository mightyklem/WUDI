'use client';

import { useState } from 'react';

/**
 * Knowledge base + support, in the landing page's own voice: short questions,
 * one-tap answers, and a help form for everything else. Native <details> for
 * the accordion — no state, no animation library, works with JS half-loaded.
 */
const FAQS: { q: string; a: string }[] = [
  {
    q: 'Is attending a class really free?',
    a: 'Yes. Seats cost nothing. Only certificates on paid classes are charged — you always see the price before you commit.',
  },
  {
    q: 'How do I join a live class?',
    a: 'Reserve a seat from the class page, then tap Join class at the scheduled time. On a slow connection, switch to audio-only — it counts the same for attendance.',
  },
  {
    q: 'Are there replays if I miss it?',
    a: 'No. Classes happen once, live. Reserve ahead and arrive on time — that scarcity is what makes attendance worth certifying.',
  },
  {
    q: 'How do I earn a certificate?',
    a: 'Attend past the minimum (usually 60%+), and your certificate is issued automatically. Every certificate carries a number anyone can verify online.',
  },
  {
    q: 'How do I pay for a paid class or material?',
    a: 'Checkout runs through Paystack (card, transfer, USSD). You get a receipt, the trainer is credited, and your purchase unlocks immediately after payment confirms.',
  },
  {
    q: 'What are materials?',
    a: 'Files trainers sell from their profiles — ebooks, slides, notes, recordings. Free ones download instantly; paid ones unlock after checkout.',
  },
  {
    q: 'How do I become a trainer?',
    a: 'Open Teach, create your trainer profile, and verify your identity. You can host free classes right away; paid classes and certificates unlock with approval.',
  },
  {
    q: 'How do I leave a review?',
    a: 'Attend a class, then open the trainer’s page — the Reviews tab offers you the form. Only real attendees can review, which is why the stars mean something.',
  },
];

const TOPICS = ['Class or seat', 'Payment', 'Certificate', 'Trainer or review', 'Account', 'Something else'];

export default function HelpSection() {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [topic, setTopic] = useState(TOPICS[0]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch('/api/support', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, contact, topic, message }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setNote(j.error || 'Could not send that.');
        return;
      }
      setName('');
      setContact('');
      setTopic(TOPICS[0]);
      setMessage('');
      setNote('Received — we reply to the contact you gave, usually within a day.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Help and support" style={{ marginTop: 22 }}>
      <h2 className="sec">Help, in plain words</h2>
      <div style={{ display: 'grid', gap: 10 }}>
        {FAQS.map((f) => (
          <details key={f.q} className="card" style={{ padding: '12px 16px' }}>
            <summary style={{ fontWeight: 800, cursor: 'pointer', fontSize: 'var(--t-base)' }}>
              {f.q}
            </summary>
            <p className="muted" style={{ margin: '8px 0 0', fontSize: 'var(--t-sm)' }}>{f.a}</p>
          </details>
        ))}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <p className="u-h-md" style={{ margin: 0 }}>Still stuck? Ask us.</p>
        <p className="muted" style={{ fontSize: 'var(--t-sm)', margin: '4px 0 12px' }}>
          A person reads every message — not a bot.
        </p>
        <form onSubmit={ask} style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              maxLength={80}
              style={{ flex: 1, minWidth: 140 }}
            />
            <input
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Email or WhatsApp number"
              maxLength={120}
              style={{ flex: 1, minWidth: 140 }}
            />
          </div>
          <select value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="What is this about?">
            {TOPICS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What happened, and what were you trying to do?"
            rows={3}
            maxLength={2000}
            style={{ width: '100%', font: 'inherit', fontSize: 'var(--t-base)', color: 'var(--ink)', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '10px 12px' }}
          />
          <div>
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send to support'}
            </button>
          </div>
        </form>
        {note && <p className="muted" style={{ fontSize: 'var(--t-sm)' }}>{note}</p>}
      </div>
    </section>
  );
}
