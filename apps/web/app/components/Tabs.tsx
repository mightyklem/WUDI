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
  return (
    <div
      role="tablist"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
        gap: 8,
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
              background: active ? (accent || 'var(--accent)') : undefined,
              color: active ? '#fff' : undefined,
              borderColor: active ? (accent || 'var(--accent)') : undefined,
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