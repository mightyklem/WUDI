'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAccess } from '@/lib/client-auth';

export default function Approval() {
  const [state, setState] = useState<{ approvalState: string; paidCertApproved: boolean; rejectionReason: string | null } | null>(null);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [evidence, setEvidence] = useState('LinkedIn + past workshops');
  const [msg, setMsg] = useState<string | null>(null);
  // Unticked. See the checkbox note below.
  const [consent, setConsent] = useState(false);
  // Server owns the wording, so the form and the stored consentVersion cannot drift apart.
  const [ID_CONSENT_TEXT, setConsentText] = useState('');

  useEffect(() => {
    fetch('/api/trainer/approval/consent-text')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setConsentText(j.text))
      .catch(() => setConsentText('I agree that Learnovize may store and review the identity document I upload, for the sole purpose of verifying my identity and deciding whether I may issue paid certificates.'));
  }, []);

  function load() {
    const access = getAccess();
    if (!access) return;
    fetch('/api/trainer/approval', { headers: { authorization: `Bearer ${access}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setState(j));
  }
  useEffect(load, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const access = getAccess();
    if (!access) return setMsg('Log in first.');
    if (!idFile) return setMsg('Attach an ID document (JPG/PNG/PDF, ≤5MB).');
    if (!consent) return setMsg('Agree to us storing your ID document first.');
    const form = new FormData();
    form.append('file', idFile);
    form.append('kind', 'id');
    const up = await fetch('/api/uploads', { method: 'POST', headers: { authorization: `Bearer ${access}` }, body: form });
    const uj = await up.json();
    if (!up.ok) return setMsg(uj.error || 'Upload failed');
    const r = await fetch('/api/trainer/approval', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
      body: JSON.stringify({ idDocKeys: [uj.key], evidence, consent }),
    });
    const j = await r.json();
    setMsg(r.ok ? 'Request submitted — a reviewer approves or declines with a reason.' : (j.error || 'Submit failed'));
    load();
  }

  return (
    <div className="wrap">
      <div className="topbar"><span className="logo">Learnovize</span>
        <nav><Link className="btn link" href="/">Home</Link><Link className="btn link" href="/trainer/earnings">Earnings</Link></nav>
      </div>
      <h1>Paid approval.</h1>
      <p className="sub">Free trainings need no approval. Paid certification does — ID + proof of expertise, reviewed by staff.</p>
      {state && (
        <div className="card" style={{ marginTop: 12 }}>
          <p style={{ margin: 0 }}>Status: <b>{state.approvalState}</b> · paid certs: {state.paidCertApproved ? 'allowed' : 'blocked'}
          {state.rejectionReason && <> · reason: {state.rejectionReason}</>}</p>
        </div>
      )}
      <form onSubmit={submit} className="card" style={{ marginTop: 12 }}>
        {/* Consent sits ABOVE the file input on purpose: nobody should hand over a
            passport before being told what happens to it. Unticked, because a
            pre-checked box is not consent. */}
        <label
          htmlFor="id-consent"
          style={{
            display: 'flex', gap: 9, alignItems: 'flex-start', marginBottom: 14,
            padding: '12px', border: '1px solid var(--line-2, #E7E0D5)',
            borderRadius: 'var(--r-sm)', background: 'var(--surface-2, #F7F4EF)',
            cursor: 'pointer', fontSize: 13, lineHeight: 1.55,
          }}
        >
          <input
            id="id-consent"
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            style={{ marginTop: 3, flexShrink: 0 }}
          />
          <span>{ID_CONSENT_TEXT}{' '}<Link href="/privacy" target="_blank" className="btn link" style={{ fontSize: 13 }}>Privacy policy</Link></span>
        </label>

        <label className="fl">ID document (private — approval use only)</label>
        <input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => setIdFile(e.target.files?.[0] || null)} />
        <label className="fl">Proof of expertise</label>
        <textarea rows={3} value={evidence} onChange={(e) => setEvidence(e.target.value)} />
        <div className="btnrow">
          <button className="btn primary" type="submit" disabled={!consent}>
            Submit for review
          </button>
        </div>
        {msg && <div className="okmsg">{msg}</div>}
      </form>
    </div>
  );
}
