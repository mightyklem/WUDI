'use client';

/**
 * A bottom sheet, in the shape every phone meeting app uses.
 *
 * A floating popover anchored to a button is the wrong shape for this. The toolbar sits at
 * the bottom of the screen, so a popover has to open upward, and the toolbar scrolls
 * horizontally -- which clips it. The menu was rendering and being cut off before anybody
 * could see it, which is why the arrow did nothing.
 *
 * A sheet is anchored to the bottom of the VIEWPORT, not to a button, so nothing can clip
 * it, and it is the shape a thumb can reach on a phone.
 */
export default function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <>
      {/* A tap outside closes it. Without this the sheet has no way out on a phone except
          the chevron, and a person will swipe the page instead. */}
      <div className="croom-sheet-scrim" onClick={onClose} aria-hidden />
      <div className="croom-sheet" role="dialog" aria-modal="true" aria-label={title}>
        {/* The grab handle. A tap target, not decoration. */}
        <button
          type="button"
          className="croom-sheet-handle"
          onClick={onClose}
          aria-label="Close"
        >
          <span aria-hidden>⌃</span>
        </button>

        {title && <p className="croom-sheet-title">{title}</p>}

        <div className="croom-sheet-rows">{children}</div>
      </div>
    </>
  );
}

/** One line in a sheet: an icon and a label, the width of the sheet. */
export function SheetRow({
  icon,
  label,
  onClick,
  disabled,
  danger,
  checked,
}: {
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Used for "end meeting for everyone", which is not the same kind of thing as leaving. */
  danger?: boolean;
  /** A tick on the row that is currently selected. */
  checked?: boolean;
}) {
  return (
    <button
      type="button"
      className="croom-sheet-row"
      onClick={onClick}
      disabled={disabled}
      data-danger={danger || undefined}
      aria-current={checked ? 'true' : undefined}
    >
      {icon && <span className="croom-sheet-icon" aria-hidden>{icon}</span>}
      <span className="croom-sheet-label">{label}</span>
      {checked && <span className="croom-sheet-tick" aria-hidden>✓</span>}
    </button>
  );
}