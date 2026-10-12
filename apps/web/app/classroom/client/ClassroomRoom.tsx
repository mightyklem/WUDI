'use client';
import { useCallback, useMemo, useState } from 'react';
import { LiveKitRoom } from '@livekit/components-react';
import type { Room, TrackPublishOptions } from 'livekit-client';
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
  onEnd: () => void;
}) {
  const d = useClassroomData(room, myId, role);
  const mod = useModeration(sessionId);
  const [panel, setPanel] = useState<Tab | null>(null);
  const [view, setView] = useState<'auto' | 'grid' | 'speaker'>('auto');
  const [spotlight, setSpotlight] = useState<string | null>(null);

  const lp = room.localParticipant;
  const handUp = d.hands.has(myId);

  const toggleMic = useCallback(async () => {
    try {
      await lp.setMicrophoneEnabled(!lp.isMicrophoneEnabled);
    } catch { /* denied or no device; the control reflects real state on the next tick */ }
  }, [lp]);

  const toggleCam = useCallback(async () => {
    try {
      await lp.setCameraEnabled(!lp.isCameraEnabled);
    } catch { /* ignore */ }
  }, [lp]);

  const toggleShare = useCallback(async () => {
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
    } catch { /* a denied picker or a busy device must not break the room */ }
  }, [lp]);

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
            <ControlBar
              role={role}
              micOn={!!d.local?.mic}
              camOn={!!d.local?.cam}
              shareOn={!!d.local?.share}
              mayPublish={d.mayPublish}
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