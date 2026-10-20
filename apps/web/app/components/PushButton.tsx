'use client';
import { useCallback, useEffect, useState } from 'react';
import { authFetch, getAccess } from '@/lib/client-auth';

/**
 * Ask the browser to let us send notifications, and subscribe this device.
 *
 * The permission prompt is the browser's, not ours, and it can only be triggered by a user
 * gesture -- so this is never called automatically on load. It is called from a button, once,
 * and the answer is remembered either way: a refusal is not re-asked, because a prompt that
 * keeps coming back after somebody said no is a prompt they learn to dismiss without reading.
 *
 * The subscription is stored against the signed-in account, so the same browser signed in on
 * a different account does not deliver the previous person's reminders.
 */
export default function PushButton() {
  const [state, setState] = useState<'unknown' | 'on' | 'off' | 'unsupported' | 'busy' | 'denied'>('unknown');
  const [msg, setMsg] = useState<string | null>(null);

  const supported = useCallback(() => {
    return (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  }, []);

  useEffect(() => {
    if (!supported()) {
      setState('unsupported');
      return;
    }
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') setState('on');
    else if (Notification.permission === 'denied') setState('denied');
    else setState('off');
  }, [supported]);

  const enable = useCallback(async () => {
    if (!supported()) return;
    setState('busy');
    setMsg(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        setMsg(
          permission === 'denied'
            ? 'Your browser is blocking notifications for this site. You can allow it in the site settings.'
            : 'No problem — notifications stay off.',
        );
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const keyRes = await authFetch('/api/push/key');
      if (!keyRes.ok) {
        setState('off');
        setMsg('Notifications are not switched on for this site yet.');
        return;
      }
      const { publicKey, enabled } = await keyRes.json();
      if (!enabled || !publicKey) {
        setState('off');
        setMsg('Notifications are not switched on for this site yet.');
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // The DOM types declare these as ArrayBuffer, but the browser hands over base64url
      // strings, and those are what the server needs to encrypt with. Cast once, here, rather
      // than pretending the two are the same thing.
      const keys = (sub as unknown as { keys?: { p256dh?: string; auth?: string } }).keys;

      const access = getAccess();
      if (!access) {
        setState('on');
        setMsg('Notifications are on for this device. Sign in and they will follow your account.');
        return;
      }
      const saved = await authFetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
        // The keys go with the endpoint. Without them the server cannot encrypt anything
        // for this browser, and the subscription would be stored and never deliver.
        body: JSON.stringify({
          token: sub.endpoint,
          keys: { p256dh: keys?.p256dh ?? '', auth: keys?.auth ?? '' },
        }),
      });
      setState(saved.ok ? 'on' : 'off');
      setMsg(saved.ok ? 'Notifications are on for this device.' : 'Could not save this device for your account.');
    } catch {
      setState('off');
      setMsg('Could not turn notifications on for this device.');
    }
  }, [supported]);

  if (state === 'unsupported') return null;

  return (
    <div style={{ marginTop: 14 }}>
      {state === 'on' ? (
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          ✓ Notifications are on for this device.
        </p>
      ) : state === 'denied' ? (
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          Notifications are blocked for this site. Allow them in your browser&rsquo;s site settings to
          get reminders about your classes.
        </p>
      ) : (
        <button className="btn" onClick={enable} disabled={state === 'busy'}>
          {state === 'busy' ? 'Turning on…' : 'Turn on notifications'}
        </button>
      )}
      {msg && <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>{msg}</p>}
    </div>
  );
}

/** VAPID keys are base64url; the browser wants the raw bytes. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  // Built over an explicit ArrayBuffer rather than a plain array, because the browser's
  // PushManager wants a BufferSource and a Uint8Array over a SharedArrayBuffer is not one.
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}