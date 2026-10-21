'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch, getAccess } from '@/lib/client-auth';
import AdminNav from '../../components/AdminNav';
import Tabs from '../../components/Tabs';

type Blocker = { code: string; message: string };
type NameResult = 'match' | 'partial' | 'mismatch' | 'unknown';
type Row = {
  trainerId: string; trainerName: string; teachingName: string; email: string;
  dueNgn: number; dueCount: number;
  dueClasses: { id: string; title: string; amountNet: number }[];
  waitingNgn: number; waitingUntil: string | null; shortByNgn: number;
  ready: boolean; blockers: Blocker[];
  account: { bankName: string; accountLast4: string; accountName: string; declaredName: string | null; holderType: string } | null;
  accountCheck: {
    nameResult: NameResult; nameDetail: string;
    changedSinceApproval: boolean; needsAcknowledgement: boolean; holderType: string;
  } | null;
};
type Queue = { queue: Row[]; balanceNgn: number | null; balanceKnown: boolean; minPayoutNgn: number };

type AccountRecord = {
  trainerId: string; trainerName: string; trainerEmail: string; teachingName: string;
  identityState: string; identityApprovedAt: string | null; approvalId: string | null;
  hasIdentityDocument: boolean; hasBankStatement: boolean;
  account: {
    bankCode: string; bankName: string; accountName: string; declaredName: string | null;
    accountLast4: string; holderType: string; setAt: string; changedSinceApproval: boolean;
  } | null;
  nameCheck: { result: NameResult; detail: string };
  pendingNgn: number; pendingCount: number; shortByNgn: number; waitingNgn: number;
};

const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;

/** How a name check is said on screen. The colour is the message. */
function nameBadge(r: NameResult) {
  if (r === 'match') return { text: 'Name agrees with the bank', colour: 'var(--leaf-ink)', bg: 'var(--leaf-soft)' };
  if (r === 'partial') return { text: 'Name is close', colour: 'var(--gold-ink)', bg: 'var(--gold-soft)' };
  if (r === 'mismatch') return { text: 'Name does not agree with the bank', colour: 'var(--clay-ink)', bg: 'var(--clay-soft)' };
  return { text: 'No name given', colour: 'var(--mut)', bg: 'var(--pill)' };
}

function identityBadge(state: string) {
  if (state === 'approved') return { text: 'Verified', colour: 'var(--leaf-ink)', bg: 'var(--leaf-soft)' };
  if (state === 'pending') return { text: 'Verification pending', colour: 'var(--gold-ink)', bg: 'var(--gold-soft)' };
  if (state === 'rejected') return { text: 'Verification rejected', colour: 'var(--clay-ink)', bg: 'var(--clay-soft)' };
  return { text: 'Not verified', colour: 'var(--mut)', bg: 'var(--pill)' };
}

function Chip({ text, colour, bg }: { text: string; colour: string; bg: string }) {
  return (
    <span
      style={{
        display: 'inline-block', background: bg, color: colour, borderRadius: 'var(--r-full)',
        padding: '4px 11px', fontSize: 'var(--t-xs)', fontWeight: 800, whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  );
}

export default function AdminPayouts() {
  const [tab, setTab] = useState<'queue' | 'accounts'>('queue');
  const [data, setData] = useState<Queue | null>(null);
  const [records, setRecords] = useState<AccountRecord[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // A payout whose account name does not match the trainer's. The first press of
  // Release says why it is not going to happen; the second press is the person
  // saying they have looked at it.
  const [acknowledge, setAcknowledge] = useState<string | null>(null);

  const load = useCallback(async () => {
    const access = getAccess();
    if (!access) return;
    const r = await authFetch('/api/admin/payouts', { headers: { authorization: `Bearer ${access}` } });
    if (r.ok) setData(await r.json());
    else setErr('Could not load payouts.');
  }, []);

  const loadRecords = useCallback(async () => {
    const access = getAccess();
    if (!access) return;
    const r = await authFetch('/api/admin/payout-accounts', { headers: { authorization: `Bearer ${access}` } });
    if (r.ok) {
      const j = await r.json();
      setRecords(j.records || []);
    } else {
      setErr('Could not load payout accounts.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === 'accounts') loadRecords(); }, [tab, loadRecords]);

  async function release(id: string, acknowledged: boolean) {
    setBusy(id);
    setMsg(null);
    setErr(null);
    const access = getAccess();
    try {
      const r = await authFetch('/api/admin/payouts/release', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
        body: JSON.stringify({ trainerId: id, acknowledge: acknowledged }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (j.code === 'needs-acknowledgement') {
          // Not an error yet. It is a question, and the answer is a second press.
          setAcknowledge(id);
          setErr(j.error);
          return;
        }
        setErr(`${j.error || 'Release failed.'}${j.code ? ` (${j.code})` : ''}`);
        // Reload regardless: a failed release still changed the rows to 'failed'.
        await load();
        return;
      }
      setAcknowledge(null);
      const who = data?.queue.find((q) => q.trainerId === id)?.trainerName || 'the trainer';
      setMsg(
        `Released ${naira(j.amountNgn)} to ${who} across ${j.payouts} ` +
        `payout${j.payouts === 1 ? '' : 's'}. Transfer reference ${j.transferRef}.`,
      );
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="wrap">
      <AdminNav />

      <h1>Payouts.</h1>
      <p className="sub">
        Money leaves only when you release it. Each transfer is confirmed by Paystack
        before a trainer is told they have been paid.
      </p>

      <div style={{ marginTop: 16, marginBottom: 14 }}>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'queue', label: 'Release queue' },
            { key: 'accounts', label: 'Accounts' },
          ]}
        />
      </div>

      {msg && <p className="okmsg">{msg}</p>}
      {err && <p className="err">{err}</p>}

      {tab === 'queue' && (
        <>
          {data && (
            <p className="muted" style={{ fontSize: 'var(--t-sm)' }}>
              Available balance:{' '}
              {data.balanceKnown && data.balanceNgn !== null ? naira(data.balanceNgn) : 'could not be read'}
              {' · '}minimum release {naira(data.minPayoutNgn)}
            </p>
          )}

          <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
            {!data && <p className="muted">Loading…</p>}
            {data?.queue.length === 0 && (
              <p className="muted">Nothing waiting. Payouts appear once their hold period passes.</p>
            )}
            {data?.queue.map((row) => {
              const check = row.accountCheck;
              const badge = check ? nameBadge(check.nameResult) : null;
              return (
                <div
                  key={row.trainerId}
                  className="card"
                  style={{
                    display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap',
                    borderColor: check?.needsAcknowledgement ? 'var(--bad-line)' : undefined,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ fontWeight: 800, fontSize: 'var(--t-md)' }}>{naira(row.dueNgn)}</div>
                    <div style={{ fontSize: 'var(--t-sm)' }}>{row.trainerName}</div>
                    {row.email && (
                      <div className="muted" style={{ fontSize: 'var(--t-sm)' }}>{row.email}</div>
                    )}

                    {/* The classes the money came from, so the admin can see it is a
                        balance of several things rather than one thing. */}
                    {row.dueClasses.length > 0 && (
                      <div className="muted" style={{ fontSize: 'var(--t-sm)', marginTop: 4 }}>
                        {row.dueClasses.map((c) => (
                          <span key={c.id} style={{ display: 'block' }}>
                            {c.title} — {naira(c.amountNet)}
                          </span>
                        ))}
                      </div>
                    )}

                    {row.waitingNgn > 0 && (
                      <div className="muted" style={{ fontSize: 'var(--t-sm)', marginTop: 4 }}>
                        {naira(row.waitingNgn)} is still in its hold period
                        {row.waitingUntil ? ` until ${row.waitingUntil.slice(0, 10)}` : ''}.
                      </div>
                    )}

                    {row.account ? (
                      <div className="muted" style={{ fontSize: 'var(--t-sm)', marginTop: 4 }}>
                        {row.account.declaredName || row.account.accountName} · {row.account.bankName} · ending {row.account.accountLast4}
                        {row.account.holderType === 'business' ? ' · business account' : ''}
                        {row.account.declaredName && row.account.declaredName !== row.account.accountName && (
                          <span> — the bank has it as {row.account.accountName}</span>
                        )}
                      </div>
                    ) : (
                      <div className="muted" style={{ fontSize: 'var(--t-sm)', marginTop: 4 }}>
                        No payout account on file
                      </div>
                    )}

                    {check && badge && (
                      <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        {check.nameResult !== 'unknown' && (
                          <Chip text={badge.text} colour={badge.colour} bg={badge.bg} />
                        )}
                        {check.changedSinceApproval && (
                          <Chip
                            text="Account changed after approval"
                            colour="var(--gold-ink)"
                            bg="var(--gold-soft)"
                          />
                        )}
                      </div>
                    )}
                    {check && check.nameResult === 'mismatch' && (
                      <p style={{ fontSize: 'var(--t-sm)', margin: '6px 0 0', color: 'var(--clay-ink)' }}>
                        {check.nameDetail}
                      </p>
                    )}

                    {row.blockers.length > 0 && (
                      <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 'var(--t-sm)' }}>
                        {row.blockers.map((b) => (
                          <li key={b.code} style={{ color: 'var(--warn)' }}>{b.message}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div style={{ display: 'grid', gap: 8, justifyItems: 'stretch' }}>
                    <button
                      className="btn primary"
                      disabled={!row.ready || busy === row.trainerId}
                      onClick={() => release(row.trainerId, acknowledge === row.trainerId)}
                      title={row.ready ? 'Send this money' : 'Resolve the blockers first'}
                    >
                      {busy === row.trainerId
                        ? 'Sending…'
                        : acknowledge === row.trainerId
                          ? 'Release anyway'
                          : 'Release'}
                    </button>
                    {acknowledge === row.trainerId && (
                      <p className="muted" style={{ fontSize: 'var(--t-xs)', margin: 0, maxWidth: 220 }}>
                        Press “Release anyway” to confirm you have looked at the name.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === 'accounts' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <p className="muted" style={{ fontSize: 'var(--t-sm)' }}>
            Every trainer who is verified or has an account on file. The account number
            is never shown — it is encrypted, and it is only used at the moment a
            transfer is made.
          </p>

          {!records && <p className="muted">Loading…</p>}
          {records?.length === 0 && <p className="muted">No trainers to show yet.</p>}

          {records?.map((r) => {
            const ident = identityBadge(r.identityState);
            const badge = nameBadge(r.nameCheck.result);
            const needsAttention =
              r.nameCheck.result === 'mismatch' ||
              (r.account?.changedSinceApproval ?? false) ||
              (!r.account && r.pendingNgn > 0);

            return (
              <div
                key={r.trainerId}
                className="card"
                style={{
                  display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap',
                  borderColor: needsAttention ? 'var(--warn-line)' : undefined,
                }}
              >
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ fontWeight: 800, fontSize: 'var(--t-md)' }}>{r.trainerName}</div>
                  <div className="muted" style={{ fontSize: 'var(--t-sm)' }}>
                    {r.trainerEmail}
                    {r.teachingName && r.teachingName !== r.trainerName ? ` · teaches as ${r.teachingName}` : ''}
                  </div>

                  <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Chip text={ident.text} colour={ident.colour} bg={ident.bg} />
                    {r.account ? (
                      <Chip text={badge.text} colour={badge.colour} bg={badge.bg} />
                    ) : (
                      <Chip text="No account on file" colour="var(--mut)" bg="var(--pill)" />
                    )}
                    {r.account?.changedSinceApproval && (
                      <Chip
                        text="Changed after approval"
                        colour="var(--gold-ink)"
                        bg="var(--gold-soft)"
                      />
                    )}
                    {!r.hasBankStatement && r.identityState === 'approved' && (
                      <Chip
                        text="No bank statement on file"
                        colour="var(--mut)"
                        bg="var(--pill)"
                      />
                    )}
                  </div>

                  {r.account ? (
                    <>
                      <p style={{ margin: '10px 0 0', fontSize: 'var(--t-sm)' }}>
                        {r.account.declaredName || r.account.accountName} · {r.account.bankName} · ending {r.account.accountLast4}
                      </p>
                      {r.account.declaredName && r.account.declaredName !== r.account.accountName && (
                        <p className="muted" style={{ fontSize: 'var(--t-sm)', margin: '2px 0 0' }}>
                          The trainer gave it as <b>{r.account.declaredName}</b>; the bank
                          has it as <b>{r.account.accountName}</b>.
                        </p>
                      )}
                      <p className="muted" style={{ fontSize: 'var(--t-sm)', margin: '2px 0 0' }}>
                        {r.nameCheck.detail}
                        {r.account.changedSinceApproval
                          ? ' The account was changed after the identity was approved, so it is no longer the one the bank statement was checked against.'
                          : ''}
                      </p>
                    </>
                  ) : (
                    <p className="muted" style={{ fontSize: 'var(--t-sm)', margin: '10px 0 0' }}>
                      {r.pendingNgn > 0
                        ? `${naira(r.pendingNgn)} is waiting and there is nowhere to send it.`
                        : 'No payout account on file.'}
                    </p>
                  )}

                  <p className="muted" style={{ fontSize: 'var(--t-sm)', margin: '8px 0 0' }}>
                    {r.pendingNgn > 0
                      ? `${naira(r.pendingNgn)} waiting · ${naira(r.shortByNgn)} more to reach the minimum`
                      : 'Nothing waiting'}
                    {r.waitingNgn > 0 ? ` · ${naira(r.waitingNgn)} still in a hold period` : ''}
                    {r.approvalId && (
                      <>
                        {' · '}
                        <Link
                          href="/admin/approvals"
                          style={{ color: 'var(--accent-ink)', fontWeight: 700 }}
                        >
                          View the identity file
                        </Link>
                      </>
                    )}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
