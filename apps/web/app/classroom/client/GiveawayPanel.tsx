'use client';
import { useCallback, useEffect, useState } from 'react';
import { authFetch } from '@/lib/client-auth';
import { useNotification } from '../../components/useNotification';

type Giveaway = {
  id: string;
  prize: string;
  open: boolean;
  entries: number;
  winners: string[];
};

/**
 * A giveaway is a prize and a draw. Everything else was noise.
 *
 * The draw happens on the server and the result comes back from the server; the
 * browser never picks a winner. That is the whole point -- a draw a client could
 * influence is not a draw, and it is the first thing anyone would ask about
 * afterwards.
 */
export default function GiveawayPanel({
  sessionId,
  isTrainer,
}: {
  sessionId: string;
  isTrainer: boolean;
}) {
  const [rows, setRows] = useState<Giveaway[]>([]);
  const [prize, setPrize] = useState('');
  const [busy, setBusy] = useState(false);
  const { showNotification } = useNotification();

  const load = useCallback(async () => {
    try {
      const r = await authFetch(`/api/sessions/${sessionId}/giveaways`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (r.ok && Array.isArray(j.giveaways)) setRows(j.giveaways as Giveaway[]);
    } catch { /* the class still works without this */ }
  }, [sessionId]);

  useEffect(() => { void load(); }, [load]);

  const call = useCallback(async (body: Record<string, unknown>) => {
    const { getAccess } = await import('@/lib/client-auth');
    setBusy(true);
    try {
      const r = await authFetch(`/api/sessions/${sessionId}/giveaways`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${getAccess()}` },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { return null; }
      await load();
      return j;
    } catch {
      return null;
    } finally {
      setBusy(false);
    }
  }, [load, sessionId]);

  const live = rows.find((g) => g.open);
  const drawn = rows.find((g) => !g.open && g.winners.length > 0);

  const start = async () => {
    if (!prize.trim()) return;
    const r = await call({ action: 'create', prize: prize.trim() });
    if (r) { setPrize(''); showNotification('Live. Ask people to enter.', 'success'); }
  };

  const draw = async () => {
    if (!live) return;
    const r = await call({ action: 'draw', giveawayId: live.id, count: 1 });
    if (r) showNotification(`Drawn from ${r.entries} entries.`, 'success');
  };

  return (
    <div className="croom-panel-body">
      {drawn && (
        <div className="croom-winners">
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--croom-dim)' }}>
            {drawn.prize} · {drawn.entries} entries
          </p>
          {drawn.winners.map((w, i) => <p key={w + i} className="croom-winner">🎉 {w}</p>)}
        </div>
      )}

      {live && (
        <div className="croom-giveaway">
          <b style={{ fontSize: 14.5 }}>{live.prize}</b>
          <span className="croom-person-tag" style={{ marginLeft: 8 }}>{live.entries} in</span>
          <div className="croom-msg-acts" style={{ marginTop: 8 }}>
            {!isTrainer && (
              <button
                type="button"
                className="croom-mini primary"
                disabled={busy}
                onClick={() => void call({ action: 'enter', giveawayId: live.id })}
              >
                Enter
              </button>
            )}
            {isTrainer && (
              <button type="button" className="croom-mini primary" disabled={busy || live.entries === 0} onClick={() => void draw()}>
                Draw a winner
              </button>
            )}
          </div>
        </div>
      )}

      {!live && !drawn && !isTrainer && (
        <p style={{ margin: 0, color: 'var(--croom-dim)', fontSize: 13.5 }}>No giveaway right now.</p>
      )}

      {isTrainer && !live && (
        <>
          <p className="eyebrow" style={{ color: 'var(--croom-dim)', marginTop: 4 }}>Give away something</p>
          <input
            type="text"
            className="croom-input"
            value={prize}
            placeholder="Prize, e.g. Full course access"
            aria-label="Prize"
            onChange={(e) => setPrize(e.target.value)}
          />
          <button type="button" className="croom-send" disabled={busy || !prize.trim()} onClick={() => void start()}>
            Start giveaway
          </button>
        </>
      )}
    </div>
  );
}