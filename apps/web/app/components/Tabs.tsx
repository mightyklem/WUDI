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
 * The strip sits on a surface of its own. It used to be two buttons floating on the
 * tinted page background, and whichever one was selected sat directly on top of whatever
 * came below it, so the tab and the content read as one object. The surface draws the
 * line, and the gap below it keeps them apart.
 *
 * The colours live in the stylesheet rather than here, so the strip is a class and the
 * theme moves it without anybody editing a component.
 */
export default function Tabs<K extends string>({
  tabs,
  value,
  onChange,
  variant = 'accent',
}: {
  tabs: TabDef<K>[];
  value: K;
  onChange: (key: K) => void;
  /**
   * Which accent the strip carries.
   *
   * 'accent' is the teal one, which is dark enough to be filled. 'gold' is the trainer's,
   * which is light, so it tints the track and the chosen tab is a white pill on top of
   * it -- a filled gold block was louder than the one button on the page that is an
   * action.
   */
  variant?: 'accent' | 'gold';
}) {
  return (
    <div
      role="tablist"
      className={variant === 'gold' ? 'tabs tabs-gold' : 'tabs'}
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
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
            className="btn tabs-btn"
          >
            {t.label}
            {typeof t.count === 'number' && t.count > 0 ? ` (${t.count})` : ''}
          </button>
        );
      })}
    </div>
  );
}
