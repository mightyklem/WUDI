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
  return (
    <div
      role="tablist"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
        gap: 6,
        background: 'var(--card)',
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
              background: active ? fill : 'var(--pill)',
              color: active ? inkOn(fill) : undefined,
              borderColor: active ? fill : 'transparent',
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
 * The trainer's yellow is a light colour, and white on it is about 1.9 to 1 -- the label
 * was technically drawn and practically unreadable. So the ink is worked out from the
 * fill: white on a dark one, near-black on a light one.
 */
function inkOn(fill: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(fill.trim());
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.45 ? '#241C00' : '#fff';
}
