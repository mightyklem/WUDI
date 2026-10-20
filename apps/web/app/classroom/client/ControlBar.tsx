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
  const [more, setMore] = useState(false);
  const barRef = useRef<HTMLDivElement | null>(null);
  const isTrainer = role === 'trainer';

  // A narrow phone cannot fit seven labelled buttons, and a wrapped row pushes
  // the stage up. Secondary actions move into a popover instead.
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const check = () => setCompact((barRef.current?.clientWidth ?? 999) < 430);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!more) return;
    const close = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setMore(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [more]);

  return (
    <div className="croom-bar" ref={barRef}>
      <Btn
        on={micOn}
        off={!micOn}
        icon={micOn ? 'mic' : 'mic-off'}
        label="Mute"
        disabled={!mayPublish}
        onClick={onMic}
      />
      {/* Every microphone, not a mute toggle alone. A laptop can have a built-in mic, a
          headset and a USB interface all plugged in at once, and the one you want is
          whichever is on the headset. There is no front-and-back flip for that. */}
      {micOn && mics.length > 0 && (
        <label className="croom-camsel">
          <span className="sr-only">Microphone</span>
          <select
            value={micId ?? ''}
            disabled={micBusy}
            aria-label="Choose a microphone"
            onChange={(e) => onSelectMic(e.target.value)}
          >
            {mics.map((m, i) => (
              <option key={m.deviceId} value={m.deviceId}>
                {m.label || `Microphone ${i + 1}`}
              </option>
            ))}
          </select>
        </label>
      )}
      <Btn
        on={camOn}
        off={!camOn}
        icon={camOn ? 'camera' : 'camera-off'}
        label="Camera"
        disabled={!mayPublish}
onClick={onCam}
        />
        {/* Every video input, not just a front/rear flip.
            A phone has two cameras and the answer is "the other one". A computer has however
            many are plugged in, plus OBS and vMix virtual cameras, and the answer there is
            usually a named list. A two-way flip cannot express the second case, and a
            trainer who has just started a virtual camera mid-class cannot un-start it. */}
        {camOn && cams.length > 0 && (
          <label className="croom-camsel">
            <span className="sr-only">Camera</span>
            <select
              value={camId ?? ''}
              disabled={camBusy}
              aria-label="Choose a camera"
              onChange={(e) => onSelectCamera(e.target.value)}
            >
              {cams.map((c, i) => (
                <option key={c.deviceId} value={c.deviceId}>
                  {c.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
        )}
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

      <div style={{ position: 'relative', display: 'flex' }}>
        <button
          type="button"
          className="croom-btn"
          aria-expanded={more}
          onClick={() => setMore((v) => !v)}
        >
          <b><Icon name="more" size={19} /></b>
          <span>More</span>
        </button>
        {more && (
          <div className="croom-menu" role="menu">
            {/* The menu used to contain only the panels that only exist on a narrow
                screen, plus reactions. On a desktop that left a button that opened a
                strip of emoji and nothing else, which reads as broken. It now always
                holds something worth opening. */}
            {canFullscreen && (
              <button type="button" className="croom-mini" onClick={() => { onFullscreen(); setMore(false); }}>
                {isFullscreen ? '⤡ Leave full screen' : '⛶ Full screen'}
              </button>
            )}
            {compact && (
              <button type="button" className="croom-mini" onClick={() => { onPanel(panel === 'chat' ? null : 'chat'); setMore(false); }}>
                💬 Chat
              </button>
            )}
            {compact && (
              <button type="button" className="croom-mini" onClick={() => { onPanel(panel === 'people' ? null : 'people'); setMore(false); }}>
                👥 People
              </button>
            )}
            {compact && (
              <button type="button" className="croom-mini" onClick={() => { onPanel(panel === 'polls' ? null : 'polls'); setMore(false); }}>
                📊 Polls
              </button>
            )}
            {compact && (
              <button type="button" className="croom-mini" onClick={() => { onHand(); setMore(false); }}>
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
                onClick={() => { onReaction(e); setMore(false); }}
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>

      <button type="button" className="croom-btn leave" onClick={onLeave}>
        <b><Icon name="leave" size={19} /></b>
        <span>Leave</span>
      </button>

      {isTrainer && (
        <button
          type="button"
          className="croom-btn danger"
          disabled={busy}
          onClick={onEnd}
          title="End the session for everyone"
        >
          <b><Icon name="power" size={19} /></b>
          <span>End</span>
        </button>
      )}
    </div>
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
