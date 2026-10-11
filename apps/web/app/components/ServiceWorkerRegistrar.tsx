'use client';
import { useEffect } from 'react';

/**
 * Registers the service worker.
 *
 * Only in production, and only on pages served over https. A service worker on
 * localhost would cache the dev build's hashed assets and serve them after a rebuild,
 * which is a genuinely confusing bug to chase -- so development deliberately gets none.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') return;

    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // A failed registration must never break the page. The app works fine without
        // it; it simply is not installable and has no offline page.
      });
    };
    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad, { once: true });
  }, []);

  return null;
}
