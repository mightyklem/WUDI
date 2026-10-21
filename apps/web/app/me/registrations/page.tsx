'use client';
import { useEffect, useState } from 'react';
import { authFetch, getAccess } from '@/lib/client-auth';
import { SkeletonCard } from '../../components/Skeleton';
import { lagosWhenLabel } from '@/lib/lagos';
import SiteNav from '../../components/SiteNav';
import { UxCard, UxCta } from '../../components/ux';

type Session = {
  id: string;
  trainingId: string;
  trainingTitle: string;
  trainingSlug: string;
  startsAtUtc: string;
  endsAtUtc: string;
  status: string;
  attended: boolean;
  upcoming: boolean;
};

export default function MyRegistrations() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | string | null>(null);
  const [activeTab, setActiveTab] = useState<'join' | 'share'>('join');
  const [consentChecked, setConsentChecked] = useState(false);

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
                trainingSlug: training.slug,
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

  useEffect(load, []);

  // Check if all sessions for a training have passed
  const allPast = sessions.length > 0 && sessions.every(s => !s.upcoming);

  return (
    <div className="wrap">
      <SiteNav />
      <h1>My sessions</h1>
      <p className="sub">Your reserved seats. Sorted by date.</p>

      {msg && <div className="okmsg">{typeof msg === 'string' ? msg : msg.text}</div>}

      <div style={{ marginTop: 18 }}>
        {loading && (
          <div style={{ display: 'grid', gap: 8 }}>
            <SkeletonCard height={56} />
            <SkeletonCard height={56} />
            <SkeletonCard height={56} />
          </div>
        )}

        {!loading && sessions.length === 0 && (
          <p className="muted">No sessions yet — go find a training.</p>
        )}

        {!loading && sessions.length > 0 && (
          <>
            {/* All past - show simple message instead of tabs */}
            {sessions.every(s => !s.upcoming) && (
              <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
                <p style={{ fontSize: 'var(--t-base)', fontWeight: 600, margin: 0 }}>
                  All your sessions have passed
                </p>
                <p className="muted" style={{ marginTop: 8 }}>
                  You&apos;ve completed all your sessions. Check back for new trainings!
                </p>
              </div>
            )}

            {/* Has upcoming sessions - show tabs */}
            {sessions.some(s => s.upcoming) && (
              <>
                {/* Tabs */}
                <div className="btnrow" style={{ marginBottom: 12, gap: 8 }}>
                  <button
                    className={`btn ${activeTab === 'join' ? 'primary' : 'secondary'}`}
                    onClick={() => setActiveTab('join')}
                    style={{ flex: 1 }}
                  >
                    Join class
                  </button>
                  <button
                    className={`btn ${activeTab === 'share' ? 'primary' : 'secondary'}`}
                    onClick={() => setActiveTab('share')}
                    style={{ flex: 1 }}
                  >
                    Share this class
                  </button>
                </div>

                {/* Tab content */}
                {activeTab === 'join' && (
                  <div className="ux-card" style={{ padding: 16 }}>
                    <p className="muted" style={{ marginBottom: 16, fontSize: 'var(--t-sm)' }}>
                      By joining, you agree to our <a href="/terms" className="link">Terms of Service</a> and <a href="/privacy" className="link">Privacy Policy</a>.
                    </p>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 16 }}>
                      <input
                        type="checkbox"
                        checked={consentChecked}
                        onChange={(e) => setConsentChecked(e.target.checked)}
                        style={{ width: 20, height: 20, accentColor: 'var(--accent)' }}
                      />
                      <span style={{ fontSize: 'var(--t-sm)' }}>
                        I agree to the terms and consent to recording
                      </span>
                    </label>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {sessions
                        .filter(s => s.upcoming)
                        .sort((a, b) => new Date(a.startsAtUtc).getTime() - new Date(b.startsAtUtc).getTime())
                        .map((s, i) => (
                          /* One card per seat, in the same shape as every other card on the
                             site. This used to be one wide teal button per session, which
                             turned a list of five into a wall of colour -- and put the date
                             on the teal, where it had to be painted white to be readable
                             at all. The colour now belongs to the one thing to press.
                             Flat, because it sits inside a card and a second shadow reads
                             as a smudge. */
                          <UxCard key={s.id} best={i === 0} bestLabel="Next up" flat>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p className="u-h" style={{ margin: 0 }}>{s.trainingTitle}</p>
                                <p className="u-sub" style={{ color: 'var(--ink)', fontWeight: 600 }}>
                                  {lagosWhenLabel(s.startsAtUtc)}
                                </p>
                              </div>
                              <UxCta quiet={i !== 0} href={`/classroom/${s.id}`}>Join</UxCta>
                            </div>
                          </UxCard>
                        ))}
                    </div>
                  </div>
                )}

                {activeTab === 'share' && (
                  <div className="card" style={{ padding: 16 }}>
                    <p className="muted" style={{ marginBottom: 12, fontSize: 'var(--t-sm)' }}>
                      Copy the link to share this class with others
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="text"
                        readOnly
                        value={`${typeof window !== 'undefined' ? window.location.origin : ''}/t/${sessions[0]?.trainingSlug || ''}/register`}
                        style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 'var(--t-sm)' }}
                      />
                      <button className="btn" onClick={() => {
                        const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/t/${sessions[0]?.trainingSlug || ''}/register`;
                        navigator.clipboard.writeText(url);
                        setMsg({ ok: true, text: 'Link copied!' });
                      }}>
                        Copy
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {!loading && sessions.length === 0 && (
          <p className="muted">No sessions yet — go find a training.</p>
        )}
      </div>
    </div>
  );
}