'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch, getAccess } from '@/lib/client-auth';
import SiteNav from '../../components/SiteNav';

export default function Approval() {
  const [state, setState] = useState<{
    approvalState: string; paidCertApproved: boolean; rejectionReason: string | null;
    idAccessLog: { at: string; by: string }[];
  } | null>(null);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [bankFile, setBankFile] = useState<File | null>(null);
  const [identityType, setIdentityType] = useState<'nin' | 'passport'>('nin');
  const [identityNumber, setIdentityNumber] = useState('');
  const [idName, setIdName] = useState('');
  const [evidence, setEvidence] = useState('LinkedIn + past workshops');
  const [msg, setMsg] = useState<string | null>(null);
  // Unticked. See the checkbox note below.
  const [consent, setConsent] = useState(false);
  // Server owns the wording, so the form and the stored consentVersion cannot drift apart.
  const [ID_CONSENT_TEXT, setConsentText] = useState('');

  useEffect(() => {
    authFetch('/api/trainer/approval/consent-text')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setConsentText(j.text))
      .catch(() => setConsentText('I agree that Learnovize may store and review the identity document I upload, for the sole purpose of verifying my identity and deciding whether I may issue paid certificates.'));
  }, []);

  function load() {
    const access = getAccess();
    if (!access) return;
    authFetch('/api/trainer/approval', { headers: { authorization: `Bearer ${access}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setState(j));
  }
  useEffect(load, []);

  async function uploadOne(file: File, kind: string): Promise<{ ok: boolean; key?: string; error?: string }> {
    const access = getAccess();
    if (!access) return { ok: false, error: 'Log in first.' };
    const form = new FormData();
    form.append('file', file);
    form.append('kind', kind);
    const up = await authFetch('/api/uploads', {
      method: 'POST', headers: { authorization: `Bearer ${access}` }, body: form,
    });
    const uj = await up.json().catch(() => ({}));
    if (!up.ok) return { ok: false, error: uj.error || 'Upload failed' };
    return { ok: true, key: uj.key };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const access = getAccess();
    if (!access) return setMsg('Log in first.');
    if (!idFile) return setMsg('Attach your ID document (JPG/PNG/PDF, 5MB max).');
    if (!idName.trim()) {
      return setMsg('We need the name exactly as it appears on your document.');
    }
    if (!identityNumber.trim()) {
      return setMsg(
        identityType === 'nin'
          ? 'Enter the 11-digit NIN printed on your document.'
          : 'Enter your passport number.',
      );
    }
    if (!consent) return setMsg('Agree to us storing your ID document first.');

    const id = await uploadOne(idFile, 'id');
    if (!id.ok || !id.key) return setMsg(id.error || 'ID upload failed');

    // Optional, and failure here is not fatal. The statement is corroboration, not the
    // claim itself -- refusing the whole application because one optional upload failed
    // would be a worse outcome than a reviewer noting its absence.
    let bankKey: string | undefined;
    if (bankFile) {
      const bank = await uploadOne(bankFile, 'bankstatement');
      if (bank.ok && bank.key) bankKey = bank.key;
    }

    const r = await authFetch('/api/trainer/approval', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
      body: JSON.stringify({
        idDocKeys: [id.key], identityType, identityNumber, idName, bankStatementKey: bankKey, evidence, consent,
      }),
    });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? 'Request submitted — a reviewer approves or declines with a reason.' : (j.error || 'Submit failed'));
    if (r.ok) setIdFile(null), setBankFile(null);
    load();
  }

  return (
    <div className="wrap">
      <SiteNav />
      <h1>Verify your identity.</h1>
      <p className="sub">
        Free, and reviewed by a person. You can teach free and paid classes right now —
        this is only about getting paid, because a verified bank account proves the
        account exists and not that it is yours.
      </p>
      {state && (
        <div className="card" style={{ marginTop: 12 }}>
          <p style={{ margin: 0 }}>Status: <b>{state.approvalState}</b>
          {state.rejectionReason && <> · reason: {state.rejectionReason}</>}</p>
        </div>
      )}

      {state && state.idAccessLog.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <b>Who has opened your ID document</b>
          <p className="muted" style={{ fontSize: 'var(--t-sm)', marginTop: 4 }}>
            We said staff access is recorded, so here it is. If something here looks wrong,
            contact support and ask for it to be deleted.
          </p>
          <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
            {state.idAccessLog.map((entry, i) => (
              <div key={i} style={{ fontSize: 'var(--t-sm)' }}>
                <b>{entry.by}</b>{' '}
                <span className="muted">· {new Date(entry.at).toLocaleString()}</span>
              </div>
            ))}
          </div>
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
            padding: '12px', border: '1px solid var(--line-2)',
            borderRadius: 'var(--r-sm)', background: 'var(--surface-2)',
            cursor: 'pointer', fontSize: 'var(--t-sm)', lineHeight: 1.55,
          }}
        >
          <input
            id="id-consent"
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            style={{ marginTop: 3, flexShrink: 0 }}
          />
          <span>{ID_CONSENT_TEXT}{' '}<Link href="/privacy" target="_blank" className="btn link" style={{ fontSize: 'var(--t-sm)' }}>Privacy policy</Link></span>
        </label>

        <label className="fl">Which document are you sending?</label>
        <select
          value={identityType}
          onChange={(e) => setIdentityType(e.target.value as 'nin' | 'passport')}
        >
          <option value="nin">National Identification Number (NIN)</option>
          <option value="passport">National passport</option>
        </select>

          <label className="fl">
            {identityType === 'nin'
              ? 'NIN — the 11-digit number on your document'
              : 'Passport number'}
          </label>
          <input
            type="text"
            inputMode={identityType === 'nin' ? 'numeric' : 'text'}
            value={identityNumber}
            onChange={(e) => setIdentityNumber(e.target.value)}
            placeholder={identityType === 'nin' ? '12345678901' : 'A01234567'}
            maxLength={identityType === 'nin' ? 11 : 12}
            autoComplete="off"
          />
          <p className="muted" style={{ fontSize: 'var(--t-xs)', margin: '8px 0 14px' }}>
            A reviewer checks this against the document you attach. It is stored privately,
            never shown on any public page, and every staff view of it is logged.
          </p>

          {/* The name on the document. A reviewer cannot check a document against a
              number, and a payout account cannot be checked against a name nobody
              wrote down -- so it is asked for here, where the document is. */}
          <label className="fl">The name on your document</label>
          <input
            type="text"
            value={idName}
            onChange={(e) => setIdName(e.target.value)}
            placeholder="Augustine Okafor"
            maxLength={120}
            autoComplete="name"
            required
          />
          <p className="muted" style={{ fontSize: 'var(--t-xs)', margin: '8px 0 14px' }}>
            Exactly as it is written on the document, including any middle name. This is
            the name we will use to check that the account we pay you into is yours.
          </p>


        <label className="fl">ID document (private — approval use only)</label>
        <input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => setIdFile(e.target.files?.[0] || null)} />

        <label className="fl">Bank statement — optional, but it speeds things up</label>
        <input
          type="file"
          accept=".jpg,.jpeg,.png,.pdf"
          onChange={(e) => setBankFile(e.target.files?.[0] || null)}
        />
        <p className="muted" style={{ fontSize: 'var(--t-xs)', margin: '8px 0 14px' }}>
          In your own name, from the account you want to be paid into. A verified account
          proves the account exists — not that it is yours, which is the part we cannot
          check without this. 10MB max.
        </p>

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
