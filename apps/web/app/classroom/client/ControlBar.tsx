'use client';
import { useEffect, useRef, useState } from 'react';
import Icon, { type IconName } from '@/components/Icon';
import { REACTION_CHOICES, type Role } from './model';
import Sheet, { SheetRow } from './Sheet';

/**
 * The toolbar is a row in the flex column, never an overlay. That is the whole
 * point: the previous version absolutely positioned it inside the stage, so it
 * covered the bottom of every shared slide -- the part of the screen the class is
 * actually about. Overflow actions collapse into a bottom sheet so the row can
 * never wrap onto the video either.
 *
 * Every menu is a SHEET, not a popover. The toolbar scrolls horizontally, which
 * clips a popover anchored inside it, so a popover that opens upward from a bar
 * at the bottom of the screen renders and is then cut off before anybody sees
 * it. A sheet is anchored to the viewport and nothing can clip it.
 */
export default function ControlBar({
  role,
  micOn,
  camOn,
  shareOn,
  mayPublish,
  canScreenShare,
  cams,
  camId,
  camBusy,
  onSelectCamera,
  mics,
  micId,
  micBusy,
  onSelectMic,
  canFullscreen,
  isFullscreen,
  onFullscreen,
  handUp,
  panel,
  onPanel,
  onMic,
  onCam,
  onShare,
  onHand,
  onReaction,
  onLeave,
  onEnd,
  onReport,
  busy,
}: {
  role: Role;
  micOn: boolean;
  camOn: boolean;
  shareOn: boolean;
  mayPublish: boolean;
  /** False where the browser has no getDisplayMedia, so the control is disabled with a reason. */
  canScreenShare: boolean;
  /** Video inputs the device reports. Populated only once camera permission is granted. */
  cams: MediaDeviceInfo[];
  camId: string | null;
  camBusy: boolean;
  onSelectCamera: (deviceId: string) => void;
  /** Audio inputs. A laptop can have a built-in mic, a headset and a USB interface at once. */
  mics: MediaDeviceInfo[];
  micId: string | null;
  micBusy: boolean;
  onSelectMic: (deviceId: string) => void;
  /** False where the browser cannot go fullscreen, so the control is hidden rather than dead. */
  canFullscreen: boolean;
  isFullscreen: boolean;
  onFullscreen: () => void;
  handUp: boolean;
  panel: string | null;
  onPanel: (p: string | null) => void;
  onMic: () => void;
  onCam: () => void;
  onShare: () => void;
  onHand: () => void;
  onReaction: (emoji: string) => void;
  onLeave: () => void;
  onEnd: () => void;
  /** Opens the in-class report flow (problem / abuse against the trainer). */
  onReport: () => void;
  busy: boolean;
}) {
  // One sheet at a time.
  const [sheet, setSheet] = useState<'more' | 'mic' | 'cam' | 'leave' | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const isTrainer = role === 'trainer';
  const close = () => setSheet(null);

  // Escape closes the sheet. A keyboard user has no other way out of a dialog.
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sheet]);

  // The bar scrolls sideways, so the controls that do not fit are the ones a phone cannot
  // reach. Rather than guess from the viewport width, measure whether the CONTENT overflows
  // the container -- the container is as wide as the screen on a phone, so measuring it said
  // "plenty of room" on a 400px phone and the buttons were pushed off the edge.
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const check = () => {
      const el = barRef.current;
      if (!el) return;
      setCompact(el.scrollWidth > el.clientWidth + 4 || window.innerWidth < 430);
    };
    check();
    window.addEventListener('resize', check);
    const t = setInterval(check, 1000);
    return () => {
      window.removeEventListener('resize', check);
      clearInterval(t);
    };
  }, [cams.length, mics.length, sheet]);

  const openSheet = (which: 'more' | 'mic' | 'cam' | 'leave') =>
    setSheet((cur) => (cur === which ? null : which));

  return (
    <>
      <div className="croom-bar" ref={barRef}>
        {/* Mic, with an arrow that opens the input list. */}
        <div className="croom-btngroup">
          <Btn
            on={micOn}
            off={!micOn}
            icon={micOn ? 'mic' : 'mic-off'}
            label="Mute"
            disabled={!mayPublish}
            onClick={onMic}
          />
          {micOn && mics.length > 1 && (
            <Caret
              label="Choose a microphone"
              expanded={sheet === 'mic'}
              onClick={() => openSheet('mic')}
            />
          )}
        </div>

        {/* Camera, with an arrow that opens the input list. */}
        <div className="croom-btngroup">
          <Btn
            on={camOn}
            off={!camOn}
            icon={camOn ? 'camera' : 'camera-off'}
            label="Camera"
            disabled={!mayPublish}
            onClick={onCam}
          />
          {camOn && cams.length > 1 && (
            <Caret
              label="Choose a camera"
              expanded={sheet === 'cam'}
              onClick={() => openSheet('cam')}
            />
          )}
        </div>

        <Btn
          on={shareOn}
          icon="share"
          label="Share"
          disabled={!mayPublish || !canScreenShare}
          reason={
            !mayPublish
              ? 'The trainer has not given you speaking rights yet'
              : 'This browser cannot share your screen'
          }
          onClick={onShare}
        />

        {!compact && (
          <Btn
            on={handUp}
            icon="hand"
            label={handUp ? 'Lower' : 'Raise'}
            onClick={onHand}
          />
        )}

        {!compact && (
          <button
            type="button"
            className="croom-btn"
            aria-pressed={panel === 'chat'}
            onClick={() => onPanel(panel === 'chat' ? null : 'chat')}
          >
            <b><Icon name="chat" size={19} /></b>
            <span>Chat</span>
          </button>
        )}
        {!compact && (
          <button
            type="button"
            className="croom-btn"
            aria-pressed={panel === 'people'}
            onClick={() => onPanel(panel === 'people' ? null : 'people')}
          >
            <b><Icon name="people" size={19} /></b>
            <span>People</span>
          </button>
        )}
        {!compact && (
          <button
            type="button"
            className="croom-btn"
            aria-pressed={panel === 'polls'}
            onClick={() => onPanel(panel === 'polls' ? null : 'polls')}
          >
            <b><Icon name="poll" size={19} /></b>
            <span>Polls</span>
          </button>
        )}

        <button
          type="button"
          className="croom-btn"
          aria-expanded={sheet === 'more'}
          onClick={() => openSheet('more')}
        >
          <b><Icon name="more" size={19} /></b>
          <span>More</span>
        </button>

        {/* Leave. Two ways out, because "I am stepping away" and "the class is over" are
            different decisions, and having them as two separate buttons put the
            destructive one a thumb away from the ordinary one. */}
        <button
          type="button"
          className="croom-btn leave"
          aria-expanded={sheet === 'leave'}
          onClick={() => openSheet('leave')}
        >
          <b><Icon name="leave" size={19} /></b>
          <span>Leave</span>
        </button>
      </div>

      {/* ---------------- the sheets ---------------- */}

      <Sheet open={sheet === 'mic'} onClose={close} title="Microphone">
        {mics.map((m, i) => (
          <SheetRow
            key={m.deviceId}
            label={m.label || `Microphone ${i + 1}`}
            checked={m.deviceId === micId}
            disabled={micBusy}
            onClick={() => { onSelectMic(m.deviceId); close(); }}
          />
        ))}
      </Sheet>

      <Sheet open={sheet === 'cam'} onClose={close} title="Camera">
        {cams.map((c, i) => (
          <SheetRow
            key={c.deviceId}
            label={c.label || `Camera ${i + 1}`}
            checked={c.deviceId === camId}
            disabled={camBusy}
            onClick={() => { onSelectCamera(c.deviceId); close(); }}
          />
        ))}
      </Sheet>

      <Sheet open={sheet === 'more'} onClose={close} title="More">
        {canFullscreen && (
          <SheetRow
            icon="⛶"
            label={isFullscreen ? 'Leave full screen' : 'View full screen'}
            onClick={() => { onFullscreen(); close(); }}
          />
        )}
        {/* On a narrow screen these have nowhere else to live. */}
        {compact && (
          <SheetRow icon="💬" label="Chat" onClick={() => { onPanel(panel === 'chat' ? null : 'chat'); close(); }} />
        )}
        {compact && (
          <SheetRow icon="👥" label="People" onClick={() => { onPanel(panel === 'people' ? null : 'people'); close(); }} />
        )}
        {compact && (
          <SheetRow icon="📊" label="Polls" onClick={() => { onPanel(panel === 'polls' ? null : 'polls'); close(); }} />
        )}

        <SheetRow
          icon="✋"
          label={handUp ? 'Lower your hand' : 'Raise your hand'}
          onClick={() => { onHand(); close(); }}
        />

        <SheetRow
          icon="⚠"
          label="Report a problem"
          onClick={() => { onReport(); close(); }}
        />

        <p className="croom-sheet-title" style={{ marginTop: 10 }}>React</p>
        <div className="croom-sheet-reactions">
          {REACTION_CHOICES.map((e) => (
            <button
              key={e}
              type="button"
              className="croom-sheet-emoji"
              aria-label={`React ${e}`}
              onClick={() => { onReaction(e); close(); }}
            >
              {e}
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={sheet === 'leave'} onClose={close} title="Leave the class">
        <SheetRow icon="🚪" label="Take a break" onClick={() => { onLeave(); close(); }} />
        {isTrainer && (
          <SheetRow
            icon="⏹"
            label="End meeting for everyone"
            danger
            disabled={busy}
            onClick={() => { onEnd(); close(); }}
          />
        )}
      </Sheet>
    </>
  );
}

/**
 * The little arrow on the corner of a button.
 *
 * It is a separate control from the button it belongs to, so pressing Mute still mutes
 * and pressing the arrow opens the picker. One button that did both would make choosing a
 * microphone the same gesture as muting it, and somebody reaching for the arrow would
 * silence themselves.
 */
function Caret({
  label,
  expanded,
  onClick,
}: {
  label: string;
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="croom-caret"
      aria-label={label}
      aria-expanded={expanded}
      onClick={onClick}
    >
      <span aria-hidden>▾</span>
    </button>
  );
}

function Btn({
  on, off, icon, label, disabled, reason, onClick,
}: {
  on?: boolean;
  off?: boolean;
  icon: string;
  label: string;
  disabled?: boolean;
  /** Why it is disabled, spoken on hover and read by assistive tech. */
  reason?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="croom-btn"
      aria-pressed={on}
      data-off={off || undefined}
      disabled={disabled}
      title={reason}
      onClick={onClick}
    >
      <b><Icon name={icon as IconName} size={19} /></b>
      <span>{label}</span>
    </button>
  );
}