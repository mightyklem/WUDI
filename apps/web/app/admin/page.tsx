'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAccess } from '@/lib/client-auth';

type Metrics = {
  users: number; trainers: number; trainings: number; trainingsLive: number;
  activeRegistrations: number; paidSales: number; grossNgn: number; commissionNgn: number;
  certsValid: number; certsRevoked: number; postsLive: number; postsHidden: number;
  reportsOpen: number; payoutsHeldNgn: number;
};
type Report = { id: string; targetType: string; targetId: string; reason: string; createdAt: string; autoFlags: string[]; score: number };
type Audit = { id: string; action: string; target: string; reason: string | null; createdAt: string; actor: { email: string } };
type Analytics = {
  activeTrainers30d: number; trainings30d: number; regsPerTrainingAvg: number;
  pctTrainingsFull: number; showUpPct: number; certsIssued: number; paidSharePct: number;
  verifyVisits: { status: string; count: number }[]; returnRatePct: number;
  revenueNgn: number; commissionNgn: number; sessionsEnded: number;
};

export default function AdminConsole() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  function auth() { return { authorization: `Bearer ${getAccess()}` }; }
  function load() {
    if (!getAccess()) return;
    fetch('/api/admin/metrics', { headers: auth() }).then((r) => (r.ok ? r.json() : null)).then((j) => j && setMetrics(j));
    fetch('/api/admin/reports?status=open', { headers: auth() }).then((r) => (r.ok ? r.json() : null)).then((j) => j && setReports(j.reports));
    fetch('/api/admin/audit?take=30', { headers: auth() }).then((r) => (r.ok ? r.json() : null)).then((j) => j && setAudit(j.audit));
    fetch('/api/admin/analytics', { headers: auth() }).then((r) => (r.ok ? r.json() : null)).then((j) => j && setAnalytics(j));
  }
  useEffect(load, []);
  if (metrics === null) return <div className="wrap"><p className="muted">Staff only — log in as an admin.</p></div>;

  async function suspend(targetId: string, suspended: boolean) {
    // Reports target posts or trainers; for trainer targets the id is the user id.
    const reason = suspended ? (prompt('Suspension reason (logged + sent to user):') || '') : '';
    if (suspended && !reason) return;
    const r = await fetch(`/api/admin/users/${targetId}/suspend`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...auth() },
      body: JSON.stringify({ suspended, reason }),
    });
    setMsg(r.ok ? (suspended ? 'Account suspended; sessions revoked.' : 'Account restored.') : 'Action failed.');
    load();
  }

  return (
    <div className="wrap">
      <div className="topbar"><span className="logo">Learnovize</span>
        <nav><Link className="btn link" href="/">Home</Link><Link className="btn link" href="/admin/approvals">Approvals</Link></nav>
      </div>
      <h1>Admin.</h1>
      <p className="sub">Activity, review queue, and audit trail.</p>
      {msg && <div className="okmsg">{msg}</div>}

      <h2 className="sec">Metrics</h2>
      <div className="card">
        <p style={{ margin: 0, fontSize: 15 }}>
          {metrics.users} users · {metrics.trainers} trainers · {metrics.trainings} trainings ({metrics.trainingsLive} live) ·
          {' '}{metrics.activeRegistrations} active seats · {metrics.paidSales} paid sales (₦{metrics.grossNgn}, commission ₦{metrics.commissionNgn}) ·
          {' '}{metrics.certsValid} certs valid / {metrics.certsRevoked} revoked ·
          {' '}{metrics.postsLive} posts live / {metrics.postsHidden} hidden ·
          {' '}{metrics.reportsOpen} open reports · ₦{metrics.payoutsHeldNgn} payouts held
        </p>
      </div>

      <h2 className="sec">Success metrics (§10)</h2>
      <div className="card">
        {!analytics && <p className="muted">Loading analytics…</p>}
        {analytics && (
          <p style={{ margin: 0, fontSize: 15 }}>
            {analytics.activeTrainers30d} active trainers · {analytics.trainings30d} trainings (30d) ·
            {' '}{analytics.regsPerTrainingAvg} regs/training · {analytics.pctTrainingsFull}% full ·
            {' '}show-up {analytics.showUpPct}% · {analytics.certsIssued} certs ({analytics.paidSharePct}% paid) ·
            {' '}verify: {analytics.verifyVisits.map((v) => `${v.status} ${v.count}`).join(', ') || 'none'} ·
            {' '}return {analytics.returnRatePct}% · revenue ₦{analytics.revenueNgn} ·
            {' '}{analytics.sessionsEnded} sessions ended
          </p>
        )}
      </div>

      <h2 className="sec">Review queue ({reports.length} open)</h2>      <div className="card">
        {reports.length === 0 && <p className="muted">Queue empty. Auto-flags (scam keywords, 3+ reports/hour) float to the top.</p>}
        {reports.map((r) => (
          <div key={r.id} style={{ padding: '10px 0', borderTop: '1px solid var(--pill)', fontSize: 14 }}>
            <b>{r.targetType}:{r.targetId}</b> — “{r.reason || 'no reason'}”
            {r.autoFlags.length > 0 && <> · 🚩 {r.autoFlags.join(', ')}</>}
            <div className="btnrow">
              {r.targetType === 'trainer' && (
                <>
                  <button className="btn" onClick={() => suspend(r.targetId, true)}>Suspend account</button>
                  <button className="btn link" onClick={() => suspend(r.targetId, false)}>Restore</button>
                </>
              )}
              {r.targetType === 'post' && <Link className="btn link" href="/feed">Review on feed →</Link>}
            </div>
          </div>
        ))}
      </div>

      <h2 className="sec">Audit trail</h2>
      <div className="card">
        {audit.map((a) => (
          <p key={a.id} style={{ fontSize: 13, margin: '6px 0' }}>
            {new Date(a.createdAt).toUTCString().slice(0, 22)} · {a.actor.email} · <b>{a.action}</b> · {a.target}{a.reason ? ` · “${a.reason}”` : ''}
          </p>
        ))}
      </div>
    </div>
  );
}
