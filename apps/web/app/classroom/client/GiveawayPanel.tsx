'use client';
import { useCallback, useEffect, useState } from 'react';

export type Giveaway = {
  id: string;
  prize: string;
  rules: string | null;
  open: boolean;
  entries: number;
  winners: string[];
  drawnAt: string | null;
};

/**
 * Giveaway and product showcase, in the room's side panel.
 *
 * The draw is a server call and the result comes back from the server. The browser
 * never picks a winner, because a client that chose its own result would make the
 * whole exercise worth nothing -- "we gave away a course and the winner was
 * whoever refreshed fastest" is the story nobody wants to tell after a session.
 */
export default function GiveawayPanel({
  sessionId,
  isTrainer,
  showcase,
}: {
  sessionId: string;
  isTrainer: boolean;
  showcase: { name: string; note: string | null; url: string | null; imageUrl: string | null } | null;
}) {
  const [rows, setRows] = useState<Giveaway[]>([]);
  const [busy, setBusy] = useState(false);
  const [prize, setPrize] = useState('');
  const [count, setCount] = useState('1');
  const [msg, setMsg] = useState<string | null>(null);
  const [tone, setTone] = useState<'ok' | 'bad'>('ok');

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/sessions/${sessionId}/giveaways`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (r.ok && Array.isArray(j.giveaways)) setRows(j.giveaways as Giveaway[]);
    } catch { /* the room still works without this panel */ }
  }, [sessionId]);

  useEffect(() => { void load(); }, [load]);

  const call = useCallback(async (body: Record<string, unknown>) => {
    const { getAccess } = await import('@/lib/client-auth');
    setBusy(true);
    try {
      const r = await fetch(`/api/sessions/${sessionId}/giveaways`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${getAccess()}` },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setTone('bad');
        setMsg(j.error || 'That did not work.');
        return null;
      }
      setTone('ok');
      await load();
      return j;
    } catch {
      setTone('bad');
      setMsg('Could not reach the server.');
      return null;
    } finally {
      setBusy(false);
    }
  }, [load, sessionId]);

  const create = async () => {
    if (!prize.trim()) return;
    const r = await call({ action: 'create', prize: prize.trim(), rules: 'One entry per person, drawn live in the room.' });
    if (r) { setPrize(''); setMsg('Giveaway is live. Ask people to enter below.'); }
  };

  const draw = async (g: Giveaway) => {
    const n = Math.max(1, Math.min(20, parseInt(count, 10) || 1));
    const r = await call({ action: 'draw', giveawayId: g.id, count: n });
    if (r) setMsg(`Drew ${r.winners?.length ?? 0} winner(s) from ${r.entries} entries.`);
  };

  return (
    <div className="croom-panel-body">
      {showcase && (
        <div className="croom-showcase">
          {showcase.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={showcase.imageUrl} alt="" className="croom-showcase-img" />
          )}
          <div>
            <p className="croom-showcase-tag">Featured product</p>
            <p className="croom-showcase-name">{showcase.name}</p>
            {showcase.note && <p className="croom-showcase-note">{showcase.note}</p>}
            {showcase.url && (
              <a href={showcase.url} target="_blank" rel="noreferrer noopener" className="croom-showcase-link">
                Open link
              </a>
            )}
          </div>
        </div>
      )}

      {rows.length === 0 && !isTrainer && (
        <p style={{ margin: 0, color: 'var(--croom-dim)', fontSize: 13.5 }}>
          No giveaway running right now.
        </p>
      )}

      {rows.map((g) => (
        <div key={g.id} className="croom-giveaway">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <b style={{ fontSize: 14.5 }}>{g.prize}</b>
            <span style={{ flex: 1 }} />
            <span className="croom-person-tag">{g.entries} in</span>
          </div>
          {g.rules && <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--croom-dim)' }}>{g.rules}</p>}

          {g.drawnAt ? (
            <div className="croom-winners">
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--croom-dim)' }}>Winner{g.winners.length === 1 ? '' : 's'}:</p>
              {g.winners.map((w, i) => (
                <p key={w + i} className="croom-winner">🎉 {w}</p>
              ))}
              <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--croom-dim)' }}>
                Drawn live in the room. {g.entries} entries.
              </p>
            </div>
          ) : (
            <div className="croom-msg-acts">
              {g.open && !isTrainer && (
                <button
                  type="button"
                  className="croom-mini primary"
                  disabled={busy}
                  onClick={() => void call({ action: 'enter', giveawayId: g.id })}
                >
                  Enter
                </button>
              )}
              {isTrainer && g.open && (
                <button type="button" className="croom-mini" disabled={busy} onClick={() => void call({ action: 'close', giveawayId: g.id })}>
                  Stop entries
                </button>
              )}
              {isTrainer && (
                <button type="button" className="croom-mini primary" disabled={busy} onClick={() => void draw(g)}>
                  Draw winner
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {isTrainer && (
        <>
          <p className="eyebrow" style={{ color: 'var(--croom-dim)', marginTop: 6 }}>Start a giveaway</p>
          <input
            className="croom-input"
            value={prize}
            placeholder="Prize, e.g. Full course access"
            aria-label="Prize"
            onChange={(e) => setPrize(e.target.value)}
          />
          <label style={{ fontSize: 12.5, color: 'var(--croom-dim)' }}>
            Winners to draw
            <input
              className="croom-input"
              value={count}
              inputMode="numeric"
              aria-label="Number of winners"
              onChange={(e) => setCount(e.target.value.replace(/\D/g, '').slice(0, 2))}
            />
          </label>
          <button type="button" className="croom-send" disabled={busy} onClick={() => void create()}>
            Start giveaway
          </button>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--croom-dim)' }}>
            Entries close when you draw. One entry per person, enforced on the server.
          </p>
        </>
      )}

      {msg && (
        <p className="croom-notice" style={tone === 'bad' ? { background: 'rgba(180,85,47,.16)', borderColor: 'rgba(180,85,47,.45)', color: '#ffd9c9' } : undefined}>
          {msg}
        </p>
      )}
    </div>
  );
}