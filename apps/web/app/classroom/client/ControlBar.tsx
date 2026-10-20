'use client';
import { useEffect, useRef, useState } from 'react';
import Icon, { type IconName } from '@/components/Icon';
import { REACTION_CHOICES, type Role } from './model';

/**
 * The toolbar is a row in the flex column, never an overlay. That is the whole
 * point: the previous version absolutely positioned it inside the stage, so it
 * covered the bottom of every shared slide -- the part of the screen the class is
 * actually about. Overflow actions collapse into a popover on narrow screens so
 * the row can never wrap onto the video either.
 *
 * Device pickers live on a small caret attached to the mic and camera buttons
 * rather than as their own dropdowns in the row. A dropdown of camera names was
 * two hundred pixels wide and pushed every other control off the screen, which is
 * why the bar looked broken on a phone.
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
  busy: boolean;
}) {
  // One menu at a time. Three separate booleans meant two could open at once and
  // overlap each other.
  const [menu, setMenu] = useState<'more' | 'mic' | 'cam' | 'leave' | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const isTrainer = role === 'trainer';

  // A narrow phone cannot fit seven labelled buttons, and a wrapped row pushes the stage
  // up. Secondary actions move into a popover instead.
  //
  // Measured by whether the CONTENT overflows, not by the width of the container. The
  // container is as wide as the screen on a phone, so measuring it said "plenty of room"
  // on a 400px phone and the buttons were simply pushed off the edge -- the bar looked
  // broken and the panels were unreachable.
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const check = () => {
      const el = barRef.current;
      if (!el) return;
      // Content wider than the space available means the row does not fit.
      const overflowing = el.scrollWidth > el.clientWidth + 4;
      setCompact(overflowing || window.innerWidth < 430);
    };
    check();
    window.addEventListener('resize', check);
    // The device lists change the bar's width when they appear, so re-check after.
    const t = setInterval(check, 1000);
    return () => {
      window.removeEventListener('resize', check);
      clearInterval(t);
    };
  }, [cams.length, mics.length]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setMenu(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  const close = () => setMenu(null);

  return (
    <div className="croom-bar" ref={barRef}>
      {/* Mic, with a caret for picking a different input. */}
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
            expanded={menu === 'mic'}
            onClick={() => setMenu(menu === 'mic' ? null : 'mic')}
          />
        )}
      </div>

      {/* Camera, with a caret for picking a different one. */}
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
            expanded={menu === 'cam'}
            onClick={() => setMenu(menu === 'cam' ? null : 'cam')}
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

      {/* More. Always holds something worth opening -- full screen, then the panels and the
          hand on a narrow screen, then reactions. */}
      <div style={{ position: 'relative', display: 'flex' }}>
        <button
          type="button"
          className="croom-btn"
          aria-expanded={menu === 'more'}
          onClick={() => setMenu(menu === 'more' ? null : 'more')}
        >
          <b><Icon name="more" size={19} /></b>
          <span>More</span>
        </button>
        {menu === 'more' && (
          <div className="croom-menu" role="menu">
            {canFullscreen && (
              <button type="button" className="croom-mini" onClick={() => { onFullscreen(); close(); }}>
                {isFullscreen ? '⤡ Leave full screen' : '⛶ Full screen'}
              </button>
            )}
            {/* On a narrow screen these have nowhere else to live. */}
            {compact && (
              <button type="button" className="croom-mini" onClick={() => { onPanel(panel === 'chat' ? null : 'chat'); close(); }}>
                💬 Chat
              </button>
            )}
            {compact && (
              <button type="button" className="croom-mini" onClick={() => { onPanel(panel === 'people' ? null : 'people'); close(); }}>
                👥 People
              </button>
            )}
            {compact && (
              <button type="button" className="croom-mini" onClick={() => { onPanel(panel === 'polls' ? null : 'polls'); close(); }}>
                📊 Polls
              </button>
            )}
            {compact && (
              <button type="button" className="croom-mini" onClick={() => { onHand(); close(); }}>
                ✋ {handUp ? 'Lower hand' : 'Raise hand'}
              </button>
            )}
            <span className="croom-menu-label">React</span>
            {REACTION_CHOICES.map((e) => (
              <button
                key={e}
                type="button"
                className="croom-mini"
                aria-label={`React ${e}`}
                style={{ fontSize: 17 }}
                onClick={() => { onReaction(e); close(); }}
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Leave. Two ways out, because "I am stepping away" and "the class is over" are
          different decisions and having them as two separate buttons put the destructive
          one a thumb away from the ordinary one. */}
      <div style={{ position: 'relative', display: 'flex' }}>
        <button
          type="button"
          className="croom-btn leave"
          aria-expanded={menu === 'leave'}
          onClick={() => setMenu(menu === 'leave' ? null : 'leave')}
        >
          <b><Icon name="leave" size={19} /></b>
          <span>Leave</span>
        </button>
        {menu === 'leave' && (
          <div className="croom-menu" role="menu">
            <button type="button" className="croom-mini" onClick={() => { onLeave(); close(); }}>
              🚪 Take a break
            </button>
            {isTrainer && (
              <button
                type="button"
                className="croom-mini"
                disabled={busy}
                style={{ color: 'var(--danger, #b42318)' }}
                onClick={() => { onEnd(); close(); }}
              >
                ⏹ End meeting for everyone
              </button>
            )}
          </div>
        )}
      </div>

      {/* The device pickers. */}
      {menu === 'mic' && (
        <div className="croom-menu" role="menu" style={{ bottom: 'auto', top: 'calc(100% + 8px)' }}>
          <span className="croom-menu-label">Microphone</span>
          {mics.map((m, i) => (
            <button
              key={m.deviceId}
              type="button"
              className="croom-mini"
              disabled={micBusy}
              aria-pressed={m.deviceId === micId}
              onClick={() => { onSelectMic(m.deviceId); close(); }}
            >
              {m.deviceId === micId ? '✓ ' : ''}{m.label || `Microphone ${i + 1}`}
            </button>
          ))}
        </div>
      )}
      {menu === 'cam' && (
        <div className="croom-menu" role="menu" style={{ bottom: 'auto', top: 'calc(100% + 8px)' }}>
          <span className="croom-menu-label">Camera</span>
          {cams.map((c, i) => (
            <button
              key={c.deviceId}
              type="button"
              className="croom-mini"
              disabled={camBusy}
              aria-pressed={c.deviceId === camId}
              onClick={() => { onSelectCamera(c.deviceId); close(); }}
            >
              {c.deviceId === camId ? '✓ ' : ''}{c.label || `Camera ${i + 1}`}
            </button>
          ))}
        </div>
      )}
    </div>
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