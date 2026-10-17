'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react';
import { Track, type Room, type TrackPublishOptions, type VideoCaptureOptions } from 'livekit-client';
// The same constant the webhook decides presence with. A literal typed in here would be a
// second source of truth that quietly drifts from the one that marks somebody absent.
import { PRESENT_THRESHOLD } from '@learnovize/shared';
import { useClassroomData, useModeration, type ConnectState } from './useClassroom';
import { displayName, type Role } from './model';
import Stage from './Stage';
import ControlBar from './ControlBar';
import SidePanel from './SidePanel';

type Tab = 'chat' | 'people' | 'polls' | 'giveaway';

function AttendanceChip({
  room,
  minPct,
  startsAt,
  endsAt,
}: {
  room: Room;
  minPct: number;
  startsAt: number;
  endsAt: number;
}) {
  // Ticks once a second so the countdown moves, but the chip only changes when the minute
  // does -- text rewriting every second is unreadable and makes the phone work.
  const [minute, setMinute] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setMinute(Math.floor(Date.now() / 60000)), 1000);
    return () => clearInterval(id);
  }, []);

  const now = Date.now();
  const span = endsAt - startsAt;
  if (!Number.isFinite(span) || span <= 0) return null;

  // The threshold is measured against the SCHEDULED length -- that is what the webhook
  // uses -- so a class that runs over cannot cost anybody their attendance. Taken from our
  // own records rather than the media server's clock, which is not the thing deciding.
  //
  // Measured from when THIS person connected, not from the scheduled start. Someone who
  // joins twenty minutes late still has to be present for the required share of the class,
  // and telling them otherwise would be the one message in the room that is actually wrong.
  //
  // Using joinedAt is also correct across a drop: the webhook accumulates windows rather
  // than overwriting, so each reconnect genuinely starts a fresh stretch that counts.
  const since = room.localParticipant.joinedAt?.getTime() ?? now;
  const needed = span * PRESENT_THRESHOLD;
  const left = Math.max(0, needed - (now - since));

  const mmss = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
  const done = left <= 0;
  const pct = Math.round(PRESENT_THRESHOLD * 100);

  return (
    <span
      className="croom-chip croom-attend"
      data-done={done || undefined}
      data-min={minute}
      title={
        done
          ? `Your attendance for this session is secured: you need ${pct}% of the class and you have it. Your certificate needs ${minPct}% of the sessions.`
          : `Stay ${mmss} more to reach ${pct}% of this class and count as present. Your certificate needs ${minPct}% of the sessions.`
      }
    >
      {done ? '✓ Attendance' : `⏱ ${mmss} to count`}
      <span className="croom-attend-pct">{pct}%</span>
    </span>
  );
}

export default function ClassroomRoom({
  room,
  sessionId,
  sessionTitle,
  role,
  myId,
  subtitle,
  minPct,
  introStartsAt,
  introEndsAt,
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
  minPct: number;
  introStartsAt: string;
  introEndsAt: string;
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

  /* ---------------- choosing a camera ---------------- */

  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [camId, setCamId] = useState<string | null>(null);
  const [camBusy, setCamBusy] = useState(false);

  const loadCams = useCallback(async () => {
    try {
      const list = (await navigator.mediaDevices.enumerateDevices())
        .filter((x) => x.kind === 'videoinput');
      setCams(list);
      // Seed from what is actually publishing, so the control opens on the live camera
      // rather than the first one the device happens to list.
      const live = lp.getTrackPublication(Track.Source.Camera)?.track
        ?.mediaStreamTrack?.getSettings()?.deviceId;
      setCamId((cur) => cur ?? live ?? list[0]?.deviceId ?? null);
    } catch { /* no permission yet, or no camera; the control simply stays hidden */ }
  }, [lp]);

  // Device ids and labels are only populated once permission has been granted, so asking
  // before the camera is on returns an unusable list.
  useEffect(() => { if (lp.isCameraEnabled) void loadCams(); }, [lp.isCameraEnabled, loadCams]);

  /**
   * Publish a different camera.
   *
   * setCameraEnabled cannot do this, and no amount of constraint tweaking will make it.
   * Read from the client's own implementation rather than assumed:
   *
   *     if (enabled) { if (track) { await track.unmute() } else { createTracks(options) } }
   *     else         { await track.mute() }
   *
   * Disabling MUTES -- the publication and its MediaStreamTrack survive. Enabling then
   * finds a track and unmutes it, so the options are never read at all: the requested
   * deviceId is discarded and the same camera comes back. There is no switchCamera in this
   * client version to do it properly either. The track has to be unpublished outright
   * before any constraint means anything, and only then does createTracks run with them.
   *
   * This is the same path the lobby uses, which is why choosing a camera there worked while
   * switching in the room did not.
   */
  const selectCamera = useCallback(async (deviceId: string) => {
    if (!deviceId || deviceId === camId) return;
    setCamBusy(true);
    const chosen = cams.find((c) => c.deviceId === deviceId);
    try {
      const pub = lp.getTrackPublication(Track.Source.Camera);
      if (pub?.track) {
        // stopOnUnpublish, so the device is released before the next one is asked to open.
        await lp.unpublishTrack(pub.track, true);
      }
      await lp.setCameraEnabled(true, { deviceId });
      setCamId(deviceId);
    } catch (e) {
      d.setNotice(explain('camera', e));
    } finally {
      setCamBusy(false);
      void loadCams();
    }
}, [camId, cams, d, explain, loadCams, lp]);

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
            {/* Two rows on a phone, one on a desktop.
                This was a single non-wrapping flex row, so on a 480px screen the title and
                the clock fought the chips for the same line: the time broke into a column of
                single characters and "Live" was pushed off the edge entirely. Identity on
                its own row, status on its own row, and neither has to give way. */}
            <div className="croom-head-top">
              <img className="croom-head-logo" src="/learnovize-mark-stacked.svg" alt="Learnovize" width={26} height={26} />
              <div className="croom-head-title">
                <b>{sessionTitle}</b>
                <span>{subtitle}</span>
              </div>
              {status.live
                ? <span className="croom-live">{status.text}</span>
                : state !== 'connected' && (
                  <button type="button" className="croom-live" data-off onClick={retryNow}>
                    {status.text} · retry
                  </button>
                )}
            </div>

            <div className="croom-head-bar">
              <AttendanceChip
                room={room}
                minPct={minPct}
                startsAt={Date.parse(introStartsAt)}
                endsAt={Date.parse(introEndsAt)}
              />
              <span className="croom-chip" title={`Connection: ${qualityLabel}`}>
                <span className="croom-signal" data-q={quality} aria-hidden>
                  <i /><i /><i />
                </span>
                {qualityLabel}
              </span>
              <span className="croom-chip">{count} in room</span>
            </div>
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
        cams={cams}
        camId={camId}
        camBusy={camBusy}
        onSelectCamera={selectCamera}
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
