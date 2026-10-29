'use client';

import { useCallback, useEffect, useState } from 'react';
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
 * ThemePicker — the appearance menu, without its own floating button.
 *
 * Controlled by the parent (MoreMenu) via `open`/`onClose`. Renders the three
 * theme choices (system / light / dark) exactly as AppearanceToggle did.
 */

type ThemePickerProps = {
  open: boolean;
  onClose: () => void;
};

export default function ThemePicker({ open, onClose }: ThemePickerProps) {
  const [choice, setChoice] = useState<ThemeChoice>('system');

  // Read what is already stored rather than deciding here, so the menu shows the
  // choice that is really in force.
  useEffect(() => {
    let stored: ThemeChoice = 'system';
    try {
      const raw = localStorage.getItem(THEME_KEY);
      if (raw === 'light' || raw === 'dark' || raw === 'system') stored = raw;
    } catch {
      // ignore
    }
    setChoice(stored);
  }, []);

  // When the choice is 'system', the app follows the operating system as it changes.
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
    onClose();
  }, [onClose]);

  if (!open) return null;

  return (
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
  );
}
