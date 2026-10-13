'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getAccess } from '@/lib/client-auth';
import AdminNav from '../../components/AdminNav';

type SessionRow = {
  id: string;
  status: string;
  startsAtUtc: string;
  endsAtUtc: string;
  endedAtUtc: string | null;
  joinable: boolean;
  headcount: number;
  training: { id: string; title: string; trainer: { displayName: string } };
};

type Event = {
  at: string;
  kind: 'action' | 'attendance' | 'speech';
  actor: string;
  action: string;
  target: string;
  reason: string | null;
};

const WHEN = new Intl.DateTimeFormat('en-NG', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Lagos',
});

/**
 * Live rooms, and the event log for any of them.
 *
 * Staff could already enter a room as an admin and be shown to its participants. What
 * they could not do was find one, or see afterwards what happened while they were there.
 * This page is both halves: a list of rooms that are open now, and a timeline built from
 * the audit log, attendance and speech grants.
 *
 * It is a log of events, not a recording. No audio or video exists, and the class sheet
 * still tells learners exactly that. Chat and polls are not persisted at all, so they
 * are genuinely missing rather than hidden -- the page says so rather than implying the
 * timeline is complete.
 */
export default function AdminSessions() {
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [msg, setMsg] = useState('');

  const [openId, setOpenId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<Record<string, unknown> | null>(null);
  const [loadingTl, setLoadingTl] = useState(false);

  const authed = useCallback(
    async (url: string) => {
      const access = getAccess();
      const r = await fetch(url, { headers: { authorization: `Bearer ${access}` } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Request failed');
      return j;
    },
    [],
  );

  const load = useCallback(async () => {
    try {
      const j = await authed('/api/admin/sessions');
      setRows(j.sessions);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not load sessions');
      setRows([]);
    }
  }, [authed]);

  useEffect(() => {
    load();
  }, [load]);

  async function open(id: string) {
    setOpenId(id);
    setTimeline(null);
    setLoadingTl(true);
    try {
      const j = await authed(`/api/admin/sessions/${id}/timeline`);
      setTimeline(j);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not load the timeline');
    } finally {
      setLoadingTl(false);
    }
  }

  const live = (rows || []).filter((r) => r.joinable);
  const rest = (rows || []).filter((r) => !r.joinable);

  return (
    <div className="wrap">
      <AdminNav />
      <h1>Live rooms</h1>
      <p className="sub">
        Observe a session that is running now, or open the event log for one that has
        finished. Joining a room is recorded under <b>admin.observe</b>.
      </p>

      {msg && <p className="muted" style={{ color: 'var(--bad)' }}>{msg}</p>}

      {!rows && <p className="muted" style={{ marginTop: 18 }}>Loading sessions…</p>}

      {rows && (
        <>
          <h2 style={{ fontSize: 17, marginTop: 22 }}>Open now ({live.length})</h2>
          {live.length === 0 && <p className="muted">Nothing is running at the moment.</p>}
          {live.map((s) => (
            <SessionCard key={s.id} s={s} onOpen={() => open(s.id)} openId={openId} />
          ))}

          <h2 style={{ fontSize: 17, marginTop: 26 }}>Recent</h2>
          {rest.length === 0 && <p className="muted">No other sessions.</p>}
          {rest.map((s) => (
            <SessionCard key={s.id} s={s} onOpen={() => open(s.id)} openId={openId} />
          ))}
        </>
      )}

      {openId && (
        <section style={{ marginTop: 26 }}>
          <h2 style={{ fontSize: 17 }}>Event log</h2>
          {loadingTl && <p className="muted">Loading timeline…</p>}
          {timeline && <Timeline tl={timeline} />}
        </section>
      )}
    </div>
  );
}

function SessionCard({
  s,
  onOpen,
  openId,
}: {
  s: SessionRow;
  onOpen: () => void;
  openId: string | null;
}) {
  return (
    <div className="card" style={{ marginTop: 10 }}>
      <div className="u-flex" style={{ gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <p style={{ margin: 0, fontWeight: 700 }}>{s.training.title}</p>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
            {s.training.trainer.displayName} · {WHEN.format(new Date(s.startsAtUtc))} ·{' '}
            {s.headcount} in attendance log
            {s.endedAtUtc ? ` · ended ${WHEN.format(new Date(s.endedAtUtc))}` : ''}
          </p>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
            status: <b>{s.status}</b>
            {s.endedAtUtc === null && s.status === 'ended' && ' · end time not recorded'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn" onClick={onOpen}>
            {openId === s.id ? 'Reload log' : 'Event log'}
          </button>
          {s.joinable && (
            <Link className="btn primary" href={`/classroom/${s.id}`}>
              Observe
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function Timeline({ tl }: { tl: Record<string, unknown> }) {
  const events = (tl.events as Event[]) || [];
  const limits = tl.limits as { recorded: boolean; note: string } | undefined;
  const session = tl.session as { training: { trainer: { displayName: string } } } | undefined;

  return (
    <>
      <div className="card" style={{ marginTop: 10, borderLeft: '4px solid var(--accent)' }}>
        <p style={{ margin: 0, fontSize: 13 }} className="muted">
          {session?.training.trainer.displayName} · {events.length} events
        </p>
        {limits && (
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
            <b>No recording exists.</b> {limits.note}
          </p>
        )}
      </div>

      {events.length === 0 && <p className="muted" style={{ marginTop: 12 }}>Nothing recorded.</p>}

      {events.map((e, i) => (
        <div key={i} className="card" style={{ marginTop: 8, padding: '12px 16px' }}>
          <div className="u-flex" style={{ gap: 12, flexWrap: 'wrap' }}>
            <span className="ibadge" style={{ fontVariantNumeric: 'tabular-nums', minWidth: 132 }}>
              {WHEN.format(new Date(e.at))}
            </span>
            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ margin: 0, fontSize: 14 }}>
                <b>{e.actor}</b> — {e.action}
              </p>
              {e.reason && (
                <p className="muted" style={{ margin: '3px 0 0', fontSize: 13 }}>
                  reason: {e.reason}
                </p>
              )}
              <p className="muted" style={{ margin: '3px 0 0', fontSize: 12 }}>
                {e.target}
              </p>
            </div>
            <span className="badge">{e.kind}</span>
          </div>
        </div>
      ))}
    </>
  );
}