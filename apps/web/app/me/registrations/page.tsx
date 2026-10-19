'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch, getAccess } from '@/lib/client-auth';
import { SkeletonCard } from '../../components/Skeleton';
import { lagosWhenLabel, lagosDayLabel } from '@/lib/lagos';
import SiteNav from '../../components/SiteNav';

type Session = {
  id: string;
  trainingId: string;
  trainingTitle: string;
  startsAtUtc: string;
  endsAtUtc: string;
  status: string;
  attended: boolean;
  upcoming: boolean;
};

export default function MyRegistrations() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  function load() {
    const access = getAccess();
    if (!access) return;
    setLoading(true);
    authFetch('/api/me/registrations')
      .then((r) => r.json())
      .then((j) => {
        const regs = j.registrations || [];
        const fetches = regs.map((r: any) =>
          authFetch(`/api/me/attendance?trainingId=${r.training.id}`)
            .then((x) => x.json())
            .then((p) => ({ training: r.training, progress: p }))
            .catch(() => ({ training: r.training, progress: null }))
        );
        Promise.all(fetches).then((results) => {
          const allSessions: Session[] = [];
          for (const { training, progress } of results) {
            if (!training?.sessions) continue;
            const flags = progress?.flags || [];
            for (const s of training.sessions) {
              const flag = flags.find((f: any) => f.sessionId === s.id);
              const upcoming = new Date(s.startsAtUtc).getTime() > Date.now();
              const attended = flag?.present === true;
              allSessions.push({
                id: s.id,
                trainingId: training.id,
                trainingTitle: training.title,
                startsAtUtc: s.startsAtUtc,
                endsAtUtc: s.endsAtUtc,
                status: training.status,
                attended,
                upcoming,
              });
            }
          }
          // Sort: upcoming first (by date asc), then past (most recent first)
          allSessions.sort((a, b) => {
            const aTime = new Date(a.startsAtUtc).getTime();
            const bTime = new Date(b.startsAtUtc).getTime();
            const aUp = a.upcoming, bUp = b.upcoming;
            if (aUp !== bUp) return aUp ? -1 : 1; // upcoming first
            return aUp ? aTime - bTime : bTime - aTime; // upcoming asc, past desc
          });
          setSessions(allSessions);
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  function formatDateTime(startsAtUtc: string) {
    return {
      date: lagosDayLabel(startsAtUtc),
      time: lagosWhenLabel(startsAtUtc),
    };
  }

  function formatDateOnly(startsAtUtc: string) {
    return lagosDayLabel(startsAtUtc);
  }

  function formatTimeOnly(startsAtUtc: string) {
    return lagosWhenLabel(startsAtUtc);
  }

  useEffect(load, []);

  return (
    <div className="wrap">
      <SiteNav />
      <h1>My sessions</h1>
      <p className="sub">Upcoming first, then past. Checked = attended.</p>

      {msg && <div className="okmsg">{msg}</div>}

      <div style={{ marginTop: 18 }}>
        {loading && (
          <div style={{ display: 'grid', gap: 8 }}>
            <SkeletonCard height={56} />
            <SkeletonCard height={56} />
            <SkeletonCard height={56} />
          </div>
        )}

        {!loading && sessions.length > 0 && (
          <div style={{ display: 'grid', gap: 8 }}>
            {sessions.map((s) => {
              const isPast = !s.upcoming;
              const checked = !s.upcoming && s.attended;

              return (
                <div key={s.id} className="rowitem" style={{ borderRadius: 12, padding: '12px 16px', background: 'var(--bg)', border: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 16, fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {s.trainingTitle}
                      </p>
                      <p className="muted" style={{ margin: '2px 0 0', fontSize: 14 }}>
                        {s.upcoming ? 'Upcoming · ' : 'Past · '}{lagosDayLabel(s.startsAtUtc)} · {lagosWhenLabel(s.startsAtUtc)}
                      </p>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled
                        style={{ width: 20, height: 20, accentColor: 'var(--accent)' }}
                      />
                      <span className="muted" style={{ fontSize: 13 }}>
                        {s.upcoming ? 'Upcoming' : checked ? 'Attended' : 'Missed'}
                      </span>
                    </label>
                    <Link className="btn link" href={`/classroom/${s.id}`} style={{ marginLeft: 'auto' }}>
                      {s.upcoming ? 'Join' : 'View'}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && sessions.length === 0 && (
          <p className="muted">No sessions yet — go find a training.</p>
        )}
      </div>
    </div>
  );
}