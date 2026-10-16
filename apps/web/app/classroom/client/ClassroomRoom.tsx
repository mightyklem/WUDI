'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react';
import { Track, type Room, type TrackPublishOptions } from 'livekit-client';
import { useClassroomData, useModeration, type ConnectState } from './useClassroom';
import { displayName, type Role } from './model';
import Stage from './Stage';
import ControlBar from './ControlBar';
import SidePanel from './SidePanel';

type Tab = 'chat' | 'people' | 'polls' | 'giveaway';

export default function ClassroomRoom({
  room,
  sessionId,
  sessionTitle,
  role,
  myId,
  subtitle,
  state,
  quality,
  retryIn,
  retryNow,
onLeave,
    mediaIssue,
    onEnd,
  }: {
  room: Room;
  sessionId: string;
  sessionTitle: string;
  role: Role;
  myId: string;
  subtitle: string;
  state: ConnectState;
  quality: number;
  retryIn: number;
  retryNow: () => void;
onLeave: () => void;
    mediaIssue?: string | null;
    onEnd: () => void;
}) {
  const d = useClassroomData(room, myId, role);
  const mod = useModeration(sessionId);
  const [panel, setPanel] = useState<Tab | null>(null);
  const [view, setView] = useState<'auto' | 'grid' | 'speaker'>('auto');
  const [spotlight, setSpotlight] = useState<string | null>(null);

const lp = room.localParticipant;
  const handUp = d.hands.has(myId);

  // Whether this browser can share a screen at all, decided before anyone taps a button.
  // iOS Safari has no getDisplayMedia, so on an iPhone the Share control is a promise the
  // device cannot keep. Offering it and failing quietly is worse than not offering it: a
  // trainer pressing Share three times in front of a class concludes the platform is
  // broken rather than that their phone cannot do it.
  const canScreenShare = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const md = navigator.mediaDevices as (MediaDevices & { getDisplayMedia?: unknown }) | undefined;
    // getDisplayMedia is gated on a secure context, so a page loaded over plain http can
    // pass a feature test and still fail at the moment of use.
    return typeof md?.getDisplayMedia === 'function' && window.isSecureContext !== false;
  }, []);

  /**
   * The browser says why and we keep it. Both toggles used to catch and discard, so a
   * blocked permission, a busy device and a phone with no camera were all indistinguishable
   * from a button that did nothing -- which is exactly what was reported.
   *
   * Each of these has a different fix the person can actually apply, so the message has to
   * name one rather than admit defeat.
   */
  const explain = useCallback((what: string, e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (/notallowed|permission|denied|security/i.test(msg)) {
      return `Your ${what} is blocked. Allow it in this site's settings, then reload.`;
    }
    if (/notfound|nonexistent|devicesnotfound/i.test(msg)) {
      return `No ${what} was found on this device.`;
    }
    if (/notreadable|trackstart|inuse|busy/i.test(msg)) {
      return `Your ${what} is already in use by another app. Close that and try again.`;
    }
    if (/notsupported|unsupported|typeerror/i.test(msg)) {
      return `This browser cannot share your screen. On a phone, screen sharing is usually unavailable -- ask the trainer to share instead.`;
    }
    return `Could not start your ${what}: ${msg}`;
  }, []);

  const toggleMic = useCallback(async () => {
    try {
      await lp.setMicrophoneEnabled(!lp.isMicrophoneEnabled);
    } catch (e) {
      d.setNotice(explain('microphone', e));
    }
  }, [d, explain, lp]);

  const toggleCam = useCallback(async () => {
    try {
      await lp.setCameraEnabled(!lp.isCameraEnabled);
    } catch (e) {
      d.setNotice(explain('camera', e));
    }
  }, [d, explain, lp]);

  /* ---------------- front / rear camera ---------------- */

  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);

  const loadCams = useCallback(async () => {
    try {
      const list = (await navigator.mediaDevices.enumerateDevices())
        .filter((x) => x.kind === 'videoinput');
      setCams(list);
    } catch { /* no camera permission yet, or none at all; the control simply stays hidden */ }
  }, []);

  // Device labels and ids are only populated once permission has been granted, so asking
  // before the camera is on returns an unusable list -- which is why there used to be no
  // way to reach the rear camera: nothing ever asked for it again afterwards.
  useEffect(() => { if (lp.isCameraEnabled) void loadCams(); }, [lp.isCameraEnabled, loadCams]);

  // The device actually publishing, which is not necessarily the one we asked for: the
  // browser can substitute another when the chosen one is unavailable.
  const currentCamId = useMemo(() => {
    const track = lp.getTrackPublication(Track.Source.Camera)?.track;
    return track?.mediaStreamTrack?.getSettings()?.deviceId ?? null;
  }, [lp, lp.isCameraEnabled, cams]);

  const canFlip = lp.isCameraEnabled && cams.length > 1;

  const flipCamera = useCallback(async () => {
    if (!canFlip) return;
    const at = cams.findIndex((c) => c.deviceId === currentCamId);
    // -1 means we could not tell which one is live, so start from the top rather than
    // picking an arbitrary neighbour of an unknown index.
    const next = cams[(at + 1) % cams.length];
    if (!next) return;
    try {
      await lp.setCameraEnabled(true, { deviceId: next.deviceId });
    } catch (e) {
      d.setNotice(explain('camera', e));
    }
  }, [canFlip, cams, currentCamId, d, explain, lp]);

  const toggleShare = useCallback(async () => {
    if (!canScreenShare) {
      d.setNotice(explain('screen share', new Error('not supported')));
      return;
    }
    try {
      if (lp.isScreenShareEnabled) {
        await lp.setScreenShareEnabled(false);
        return;
      }
      // The second argument is capture options, the third is how the track is
    // published. Both matter here: 'detail' keeps text crisp, and a hard cap on
    // bitrate and frame rate frees the bandwidth that keeps a learner's own audio
    // and video smooth while a slide is on screen.
    await lp.setScreenShareEnabled(
      true,
      { contentHint: 'detail' },
      {
        videoEncoding: { maxBitrate: 1_500_000, maxFramerate: 15 },
        screenShareEncoding: { maxBitrate: 1_500_000, maxFramerate: 15 },
        // Never simulcast a screen: every viewer needs the same legible frame, and
        // the low layers would smear the text.
        simulcast: false,
      } as TrackPublishOptions,
    );
    } catch (e) {
      d.setNotice(explain('screen share', e));
    }
  }, [canScreenShare, d, explain, lp]);

  const end = useCallback(async () => {
    await mod.act('end');
    onEnd();
  }, [mod, onEnd]);

  const count = d.remotes.length + 1;
  const qualityLabel = quality >= 3 ? 'Good' : quality === 2 ? 'Fair' : quality === 1 ? 'Poor' : 'Lost';

  const status = useMemo(() => {
    if (state === 'connecting') return { text: 'Connecting…', live: false };
    if (state === 'retrying') return { text: retryIn ? `Reconnecting in ${retryIn}s` : 'Reconnecting…', live: true };
    if (state === 'failed') return { text: 'Could not join', live: false };
    return { text: 'Live', live: true };
  }, [state, retryIn]);

  return (
    // serverUrl and token are declared as required-but-undefined so the component can
    // accept an externally owned room. This room is created and connected by
    // useRoomConnection, so LiveKitRoom is used purely for its React context and
    // never initiates a connection of its own.
    <LiveKitRoom
      room={room}
      serverUrl={undefined}
      token={undefined}
      connect={false}
      audio={false}
      video={false}
    >
<div className="croom">
        {/* Without this, remote audio is subscribed but never attached to an
            element and the room is completely silent. LiveKit does not attach
            remote audio on its own; it has to be rendered somewhere. It was
            dropped in the rebuild and took every sound with it. */}
        <RoomAudioRenderer />
        <header className="croom-head">
          <div className="croom-head-title">
            {sessionTitle}
            <span>{subtitle}</span>
          </div>
          <div className="croom-head-spacer" />
          <span className="croom-chip" title={`Connection: ${qualityLabel}`}>
            <span className="croom-signal" data-q={quality} aria-hidden>
              <i /><i /><i />
            </span>
            {qualityLabel}
          </span>
          <span className="croom-chip">{count} in room</span>
          {status.live && <span className="croom-live">{status.text}</span>}
          {!status.live && state !== 'connected' && (
            <span className="croom-chip" onClick={retryNow} role="button" tabIndex={0}>
              {status.text} · retry
            </span>
          )}
        </header>

        <div className="croom-body">
          <div className="croom-main">
            <Stage
              room={room}
              role={role}
              reactions={d.reactions}
              view={view}
              spotlight={spotlight}
              onSpotlight={(id) => setSpotlight((cur) => (cur === id ? null : id))}
            />
            {mediaIssue && (
              <p className="croom-media-issue" role="alert">{mediaIssue}</p>
            )}
            <ControlBar
              role={role}
              micOn={!!d.local?.mic}
              camOn={!!d.local?.cam}
              shareOn={!!d.local?.share}
              mayPublish={d.mayPublish}
        canScreenShare={canScreenShare}
        canFlip={canFlip}
        onFlip={flipCamera}
              handUp={handUp}
              panel={panel}
              onPanel={(p) => setPanel((cur) => (cur === p ? null : (p as Tab)))}
              onMic={() => void toggleMic()}
              onCam={() => void toggleCam()}
              onShare={() => void toggleShare()}
              onHand={() => void d.raiseHand(!handUp)}
              onReaction={(e) => void d.popReaction(e)}
              onLeave={onLeave}
              onEnd={() => void end()}
              busy={mod.busy}
            />
          </div>
<SidePanel
            room={room}
            sessionId={sessionId}
            role={role}
            myId={myId}
            tab={panel}
            onTab={(t) => setPanel(t)}
            onClose={() => setPanel(null)}
            d={d}
            mod={mod}
          />
        </div>
      </div>
    </LiveKitRoom>
  );
}