// The three ways the app can look, and how the choice is kept.
//
// The choice is a single word in local storage: 'system', 'light' or 'dark'. What the
// page actually paints is a second thing -- 'light' or 'dark' -- and for 'system' that
// is whatever the operating system is asking for. Keeping the two apart is what lets
// somebody leave it on 'system' and still have it follow their phone into night mode
// without being asked again.

export type ThemeChoice = 'system' | 'light' | 'dark';
export type ThemeResolved = 'light' | 'dark';

export const THEME_KEY = 'learnovize.theme';

/** Fired on the window whenever the theme changes, so two open parts of the page agree. */
export const THEME_EVENT = 'learnovize:theme';

/** The three, in the order they are offered. */
export const THEME_CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** What the system is asking for right now. */
export function systemTheme(): ThemeResolved {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** What a choice turns into on screen. */
export function resolveTheme(choice: ThemeChoice): ThemeResolved {
  if (choice === 'light' || choice === 'dark') return choice;
  return systemTheme();
}

/**
 * The script that runs before the first paint.
 *
 * This is the whole reason the theme has to be set here and not in a component: a theme
 * applied after the page has painted is a white flash followed by a dark page, which is
 * worse than having no dark theme at all. So the choice is read, and the attribute is
 * put on the document, before anything is drawn.
 *
 * Kept as a string rather than as a component because it has to be a plain script in the
 * head of the document, not a bundle.
 */
export const THEME_BOOTSTRAP = `(function(){try{
var c=localStorage.getItem(${JSON.stringify(THEME_KEY)})||'system';
var d=(c==='light'||c==='dark')?c:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
var e=document.documentElement;
e.setAttribute('data-theme',d);
e.setAttribute('data-theme-choice',c);
}catch(e){}})();`;
