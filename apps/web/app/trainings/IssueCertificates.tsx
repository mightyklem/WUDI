'use client';
import { useEffect, useState } from 'react';
import { authFetch, getAccess } from '@/lib/client-auth';

/**
 * Corrections and attestations.
 *
 * This was an approval queue, and it failed for the same reason any gate does when
 * nobody is required to open it: certificates are now issued automatically the moment
 * a session ends, so the screen went untouched and the platform went years with a
 * handful of certificates and no error anywhere. A trainer who never logged in withheld
 * the reward from every learner, silently and permanently.
 *
 * So the screen is no longer about deciding who gets a certificate. The data decides
 * that, server-side, from attendance and payment. What is left is the one thing the
 * data cannot do on its own.
 *
 * CORRECT. Attendance is measured by a LiveKit webhook, and the webhook has been
 * demonstrably wrong: a learner who dropped and rejoined once had the earlier window
 * discarded and was marked absent, denying a certificate they had earned. The trainer
 * watched that happen. They can now fix it here, per session, with a reason, and it is
 * audited as an override rather than passing as a measurement.
 *
 * ATTEST. Where correcting the record would be dishonest -- a learner genuinely did not
 * meet the bar, but the trainer judges the class was mis-run or the data is plainly
 * wrong -- the trainer can issue anyway, over the gate, with a reason. That is recorded
 * as certificate.attest and says so in the audit log, so an attested certificate is
 * visibly a human judgement rather than a measurement.
 *
 * REVOKE. Unchanged, and still the real veto: take one back, with a reason.
 *
 * The trainer opens this when something looks wrong. It is not routine admin.
 */

type AttendanceCell = {
  sessionId: string;
  index: number;
  startsAtUtc: string;
  present: boolean;
  stayedMs: number;
  corrected: boolean;
  correctionReason: string | null;
};

type Row = {
  userId: string; email: string; pct: number; presentCount: number; total: number;
  minMet: boolean; paidOk: boolean; eligible: boolean;
  certificateNumber: string | null; certificateId: string | null;
  scopeLabel?: string; dayCount?: number; excludedFreeDays?: string[];
  attendance: AttendanceCell[];
};

type Training = {
  id: string; title: string; minPct: number; certMode: string;
  sessions: { id: string; index: number; startsAtUtc: string }[];
};

type Correction = { id: string; sessionId?: string; fromUserId?: string; note?: string; createdAt: string };

export default function IssueCertificates({ trainingId }: { trainingId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [training, setTraining] = useState<Training | null>(null);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);

  const authed = () => getAccess();

  function load() {
    const access = authed();
    if (!access) return;
    const headers = { authorization: `Bearer ${access}` };
    authFetch(`/api/trainings/${trainingId}/eligible`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return;
        setRows(j.rows);
        setTraining(j.training);
      });
    // Learner-raised correction requests. These used to live in a separate Attendance
    // section that showed raw user ids and offered no way to act on any of them -- a
    // learner saying "the webhook says I was absent and I was not" produced a line of
    // text and nothing else. They are pulled in here because answering one is the same
    // job as correcting attendance.
    authFetch(`/api/trainings/${trainingId}/attendance`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setCorrections(j.correctionsPending || []));
  }
  useEffect(load, [trainingId]);
  if (rows === null) return null; // not staff

  async function correct(row: Row, cell: AttendanceCell, present: boolean) {
    const why = prompt(
      `Mark session ${cell.index} as ${present ? 'present' : 'absent'} for ${row.email}.\n\n` +
      `This overrides the measured attendance and is recorded as an override in the audit log. Why?`,
      present ? 'learner was present; the measurement was wrong' : 'learner was not present',
    );
    if (why === null) return;
    const access = authed();
    if (!access) return;
    setBusy(true);
    try {
      const r = await authFetch(`/api/sessions/${cell.sessionId}/attendance`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
        body: JSON.stringify({ userId: row.userId, present, reason: why }),
      });
      setMsg(r.ok ? `Session ${cell.index} corrected.` : 'Correction failed.');
      if (r.ok) load();
    } finally {
      setBusy(false);
    }
  }

  async function attest(row: Row) {
    const why = prompt(
      `Issue a certificate to ${row.email} anyway?\n\n` +
      `They are not eligible by the measured data (${row.pct}% attendance against a ` +
      `${training?.minPct}% minimum${row.paidOk ? '' : ', payment missing'}).\n\n` +
      `This overrides the eligibility gate. It is recorded as an attestation in the audit log ` +
      `against your name, so it reads as a judgement rather than a measurement. Why?`,
    );
    if (why === null || !why.trim()) return;
    const access = authed();
    if (!access) return;
    setBusy(true);
    try {
      const r = await authFetch(`/api/trainings/${trainingId}/certificates/issue`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
        body: JSON.stringify({ userIds: [row.userId], attest: true, reason: why }),
      });
      const j = await r.json().catch(() => ({}));
      setMsg(
        r.ok
          ? `Attested. Issued ${j.issued?.length ?? 0}, refused ${j.rejected?.length ?? 0}.`
          : (j.rejected?.[0]?.reason || j.error || 'Attestation failed.'),
      );
      if (r.ok) load();
    } finally {
      setBusy(false);
    }
  }

  async function issue(row: Row) {
    const access = authed();
    if (!access) return;
    setBusy(true);
    try {
      const r = await authFetch(`/api/trainings/${trainingId}/certificates/issue`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
        body: JSON.stringify({ userIds: [row.userId] }),
      });
      const j = await r.json().catch(() => ({}));
      setMsg(
        r.ok
          ? `Issued ${j.issued?.length ?? 0}, refused ${j.rejected?.length ?? 0}.`
          : (j.rejected?.[0]?.reason || j.error || 'Issue failed.'),
      );
      if (r.ok) load();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(row: Row) {
    if (!row.certificateId) return;
    if (!confirm(`Revoke the certificate for ${row.email}? It will show as revoked online.`)) return;
    const reason = prompt('Why are you revoking it? This is recorded in the audit log:');
    if (reason === null || !reason.trim()) return;
    const access = authed();
    if (!access) return;
    setBusy(true);
    try {
      const r = await authFetch(`/api/certificates/${row.certificateId}/revoke`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
        body: JSON.stringify({ reason }),
      });
      setMsg(r.ok ? 'Certificate revoked.' : 'Revoke failed.');
      if (r.ok) load();
    } finally {
      setBusy(false);
    }
  }

  const withCert = rows.filter((r) => r.certificateNumber);
  // Eligible but unissued means the platform has not swept yet -- the session may not
  // have ended, or auto-issue has not fired. Surfaced separately so it does not read as
  // a trainer queue.
  const pendingSweep = rows.filter((r) => r.eligible && !r.certificateNumber);
  const needsAttention = rows.filter((r) => !r.eligible && !r.certificateNumber);

  const emailFor = (userId?: string) => rows?.find((r) => r.userId === userId)?.email ?? userId ?? '';
  const sessionLabel = (sessionId?: string) => {
    const i = rows?.[0]?.attendance.find((c) => c.sessionId === sessionId)?.index;
    return i ? `session ${i}` : 'a session';
  };

  return (
    <div>
      <h2 className="sec">Correct the record</h2>
      <div className="card">
        <p className="eyebrow">
          Certificates are issued automatically once a session ends. Open this when
          something looks wrong.
        </p>

        {corrections.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <p className="eyebrow" style={{ marginBottom: 4 }}>
              Learners disputing their attendance ({corrections.length})
            </p>
            {corrections.map((c) => (
              <p key={c.id} style={{ fontSize: 'var(--t-sm)', margin: '4px 0' }}>
                <b>{emailFor(c.fromUserId)}</b> says they attended {sessionLabel(c.sessionId)}
                {' — '}
                <span className="muted">“{c.note || 'no note given'}”</span>
                <button
                  type="button"
                  className="btn link"
                  style={{ minHeight: 0, padding: '0 0 0 8px' }}
                  onClick={() => {
                    const row = rows?.find((r) => r.userId === c.fromUserId);
                    if (!row || !c.sessionId) return;
                    const cell = row.attendance.find((x) => x.sessionId === c.sessionId);
                    if (cell) correct(row, cell, true);
                  }}
                >
                  open
                </button>
              </p>
            ))}
          </div>
        )}

        {rows.length === 0 && <p className="muted">No active registrations yet.</p>}

        {pendingSweep.length > 0 && (
          <p className="muted" style={{ fontSize: 'var(--t-sm)' }}>
            {pendingSweep.length} eligible learner{pendingSweep.length === 1 ? '' : 's'} not
            yet issued — the session has probably not ended, or the sweep has not run.
            Nothing is needed from you unless it has ended and this persists.
          </p>
        )}

        {rows.map((r) => (
          <div key={r.userId} style={{ padding: '10px 0', borderTop: '1px solid var(--pill)', fontSize: 'var(--t-sm)' }}>
            <div className="u-flex" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <b style={{ flex: '1 1 200px' }}>{r.email}</b>
              <span className="muted">
                {r.presentCount}/{r.total} · {r.pct}% of {training?.minPct}% minimum
              </span>
              {r.certificateNumber ? (
                <span className="badge ok">🏅 {r.certificateNumber}</span>
              ) : r.eligible ? (
                <span className="badge">eligible · not yet issued</span>
              ) : (
                <span className="badge rev">
                  not eligible{r.paidOk ? '' : ' · unpaid'}
                </span>
              )}
            </div>

            {r.eligible && (
              <p className="muted" style={{ fontSize: 'var(--t-sm)', margin: '3px 0 0' }}>
                Covers {r.dayCount} paid day{r.dayCount === 1 ? '' : 's'}
                {r.scopeLabel && r.scopeLabel !== 'Full program' ? ` · ${r.scopeLabel}` : ''}
                {r.excludedFreeDays?.length ? ` · excludes ${r.excludedFreeDays.join(', ')} (free)` : ''}
              </p>
            )}

            <div className="btnrow" style={{ marginTop: 6 }}>
              <button
                type="button"
                className="btn link"
                style={{ minHeight: 0, padding: 0 }}
                onClick={() => setOpenRow(openRow === r.userId ? null : r.userId)}
              >
                {openRow === r.userId ? 'Hide sessions' : 'Correct attendance'}
              </button>

              {r.certificateNumber ? (
                <button
                  type="button"
                  className="btn link"
                  style={{ minHeight: 0, padding: 0, color: 'var(--bad)' }}
                  disabled={busy}
                  onClick={() => revoke(r)}
                >
                  Revoke
                </button>
              ) : r.eligible ? (
                <button
                  type="button"
                  className="btn link"
                  style={{ minHeight: 0, padding: 0 }}
                  disabled={busy}
                  onClick={() => issue(r)}
                >
                  Issue now
                </button>
              ) : (
                <button
                  type="button"
                  className="btn link"
                  style={{ minHeight: 0, padding: 0 }}
                  disabled={busy}
                  onClick={() => attest(r)}
                >
                  Attest anyway…
                </button>
              )}
            </div>

            {openRow === r.userId && (
              <div style={{ marginTop: 8, borderLeft: '3px solid var(--pill)', paddingLeft: 10 }}>
                <p className="muted" style={{ fontSize: 'var(--t-xs)', margin: '0 0 6px' }}>
                  Measured by the attendance webhook. Anything changed here is recorded as
                  an override, not as a measurement.
                </p>
                {r.attendance.map((c) => (
                  <div key={c.sessionId} className="u-flex" style={{ gap: 8, alignItems: 'center', fontSize: 'var(--t-sm)' }}>
                    <span style={{ minWidth: 62 }}>
                      Session {c.index}
                    </span>
                    <span className="muted" style={{ minWidth: 118 }}>
                      {new Date(c.startsAtUtc).toLocaleString('en-NG', {
                        dateStyle: 'short', timeStyle: 'short', timeZone: 'Africa/Lagos',
                      })}
                    </span>
                    <span style={{ minWidth: 62 }}>
                      {c.present ? '✓ present' : '✗ absent'}
                    </span>
                    {c.corrected && (
                      <span className="muted" style={{ fontSize: 'var(--t-xs)' }}>
                        corrected{c.correctionReason ? `: ${c.correctionReason}` : ''}
                      </span>
                    )}
                    <button
                      type="button"
                      className="btn link"
                      style={{ minHeight: 0, padding: 0 }}
                      disabled={busy}
                      onClick={() => correct(r, c, !c.present)}
                    >
                      mark {c.present ? 'absent' : 'present'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {withCert.length > 0 && (
          <p className="muted" style={{ fontSize: 'var(--t-xs)', marginTop: 10 }}>
            {withCert.length} of {rows.length} hold a certificate.
          </p>
        )}
        {needsAttention.length > 0 && (
          <p className="muted" style={{ fontSize: 'var(--t-xs)', marginTop: 4 }}>
            {needsAttention.length} did not meet the bar. Correcting a session above will
            re-derive eligibility automatically — attest only when that would be untrue.
          </p>
        )}

        {msg && <p className="muted">{msg}</p>}
      </div>
    </div>
  );
}