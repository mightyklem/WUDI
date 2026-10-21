'use client';

export type TabDef<K extends string = string> = {
  key: K;
  label: string;
  /** Optional count shown on the tab, so it says what is behind it before it is pressed. */
  count?: number;
};

/**
 * A tab strip whose tabs are all the same size.
 *
 * Uniform by construction rather than by eye: a grid with one equal column per tab, so two
 * buttons reading "Plan" and "Success stories" come out the same width instead of the short
 * one looking like the selected tab. Flex with `flex: 1` gets close, but the buttons still
 * size to their text, and a long label then pushes its neighbour out of line.
 *
 * The strip sits on a white surface of its own. It used to be two buttons floating on the
 * tinted page background, and whichever one was selected sat directly on top of whatever
 * came below it, so the tab and the content read as one object. The surface draws the
 * line, and the gap below it keeps them apart.
 */
export default function Tabs<K extends string>({
  tabs,
  value,
  onChange,
  accent,
}: {
  tabs: TabDef<K>[];
  value: K;
  onChange: (key: K) => void;
  /** Colour of the active tab, so a trainer's yellow reads yellow here too. */
  accent?: string;
}) {
  const fill = accent || 'var(--accent)';
  // A light fill -- the trainer's gold -- cannot carry a solid block. It was the loudest
  // thing on the screen, louder than the one button that is actually an action, and a
  // tab is navigation rather than a call to do something. So a light accent tints the
  // strip and the chosen tab is a white pill on top of it. The teal is dark, so it keeps
  // the filled treatment and stays the one bright thing where it is used.
  const light = isLight(fill);
  return (
    <div
      role="tablist"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
        gap: 6,
        background: light ? tint(fill, 0.18) : 'var(--card)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-md)',
        padding: 6,
      }}
    >
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            aria-pressed={active}
            onClick={() => onChange(t.key)}
            className="btn"
            style={{
              // Every tab the same size, whatever it says.
              width: '100%',
              minWidth: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontWeight: active ? 800 : 600,
              background: active ? (light ? 'var(--card)' : fill) : light ? 'transparent' : 'var(--pill)',
              color: active ? inkOn(fill) : undefined,
              borderColor: active ? (light ? deepen(fill, 0.55) : fill) : 'transparent',
            }}
          >
            {t.label}
            {typeof t.count === 'number' && t.count > 0 ? ` (${t.count})` : ''}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The colour of the writing on a filled tab.
 *
 * The trainer's yellow is a light colour, and white on it is about 1.7 to 1 -- the label
 * was technically drawn and practically unreadable. So the ink is worked out from the
 * fill: white on a dark one, near-black on a light one.
 */
function inkOn(fill: string): string {
  return luminance(fill) > 0.45 ? '#241C00' : '#fff';
}

/**
 * How light a fill is, 0 to 1. Anything that cannot be read as a hex colour -- a CSS
 * variable, say -- counts as dark, which is what the teal accent is.
 */
function luminance(fill: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(fill.trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** True when a fill is light enough that a solid block of it would shout. */
function isLight(fill: string): boolean {
  return luminance(fill) > 0.45;
}

/**
 * A fill mixed with white, so a light accent can still tint a surface.
 *
 * `amount` is how much of the accent goes into the result, so a tenth is a whisper of it
 * and not a colour of its own.
 */
function tint(fill: string, amount: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(fill.trim());
  if (!m) return 'var(--card)';
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(c * amount + 255 * (1 - amount));
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * A fill mixed with black, for the line that says which tab is chosen.
 *
 * The gold on the soft gold it sits on was about 1.5 to 1 -- the shape was there but it
 * did not draw the eye. Darkened, the same line is about 4.6 to 1 and the white pill
 * reads as the chosen one at a glance.
 */
function deepen(fill: string, amount: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(fill.trim());
  if (!m) return fill;
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(c * (1 - amount));
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `rgb(${r}, ${g}, ${b})`;
}

