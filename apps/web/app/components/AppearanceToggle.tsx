'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Icon from '@/components/Icon';
import {
  THEME_CHOICES,
  THEME_EVENT,
  THEME_KEY,
  resolveTheme,
  systemTheme,
  type ThemeChoice,
} from '@/lib/theme';

/**
 * The floating button that sets how the app looks.
 *
 * It floats above everything, bottom right, clear of the bottom navigation, and it is on
 * every page -- because the one time somebody wants to turn the brightness of a screen
 * down is at night, and they should not have to go looking for a settings page to do
 * it.
 *
 * Three choices, not two: 'system' is the one most people want and the one that stays
 * right when a phone changes its own appearance at sunset.
 *
 * The classroom is left alone. It is a video room with its own dark surfaces, and a
 * control floating over the stage would be in the way of the thing people came to see.
 */
export default function AppearanceToggle() {
  const pathname = usePathname();
  const [choice, setChoice] = useState<ThemeChoice>('system');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Read what is already stored rather than deciding here, so the button shows the
  // choice that is really in force.
  useEffect(() => {
    let stored: ThemeChoice = 'system';
    try {
      const raw = localStorage.getItem(THEME_KEY);
      if (raw === 'light' || raw === 'dark' || raw === 'system') stored = raw;
    } catch {
      // A browser that will not give up local storage still gets a working button.
    }
    setChoice(stored);
  }, []);

  // When the choice is 'system', the app follows the operating system as it changes,
  // without anybody reloading the page.
  useEffect(() => {
    if (choice !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      document.documentElement.setAttribute('data-theme', systemTheme());
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [choice]);

  // Another part of the page changed the theme, so follow it.
  useEffect(() => {
    const onTheme = () => {
      let stored: ThemeChoice = 'system';
      try {
        const raw = localStorage.getItem(THEME_KEY);
        if (raw === 'light' || raw === 'dark' || raw === 'system') stored = raw;
      } catch {
        // ignore
      }
      setChoice(stored);
    };
    window.addEventListener(THEME_EVENT, onTheme);
    return () => window.removeEventListener(THEME_EVENT, onTheme);
  }, []);

  const apply = useCallback((next: ThemeChoice) => {
    const resolvedNext = resolveTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // ignore
    }
    const el = document.documentElement;
    el.setAttribute('data-theme', resolvedNext);
    el.setAttribute('data-theme-choice', next);
    setChoice(next);
    setOpen(false);
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  // Close when the click lands outside, or on Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (pathname && pathname.startsWith('/classroom')) return null;

  return (
    <div ref={wrapRef} className="appearance">
      {open && (
        <div className="appearance-menu" role="menu" aria-label="Appearance">
          {THEME_CHOICES.map((c) => (
            <button
              key={c.value}
              type="button"
              role="menuitemradio"
              aria-checked={choice === c.value}
              onClick={() => apply(c.value)}
            >
              <Icon
                name={c.value === 'system' ? 'monitor' : c.value === 'dark' ? 'moon' : 'sun'}
                size={18}
                strokeWidth={1.9}
              />
              <span style={{ flex: 1 }}>{c.label}</span>
              {choice === c.value && (
                <span aria-hidden style={{ color: 'var(--accent-ink)', fontWeight: 900 }}>✓</span>
              )}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        className="appearance-fab"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Appearance: ${choice === 'system' ? 'system' : choice}. Change how the app looks.`}
        title="Change how the app looks"
      >
        {/* All three marks are in the page and the stylesheet picks one, so the button
            is right in the very first paint instead of appearing a moment later and
            changing afterwards. The script in the head has already said which one. */}
        <span className="appearance-marks" aria-hidden>
          <span className="appearance-mark" data-mark="light">
            <Icon name="sun" size={22} strokeWidth={1.9} />
          </span>
          <span className="appearance-mark" data-mark="dark">
            <Icon name="moon" size={22} strokeWidth={1.9} />
          </span>
          <span className="appearance-mark" data-mark="system">
            <Icon name="monitor" size={22} strokeWidth={1.9} />
          </span>
        </span>
      </button>
    </div>
  );
}
