'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Track, type Room, type RemoteTrack, type RemoteTrackPublication } from 'livekit-client';
import { useTracks, VideoTrack } from '@livekit/components-react';
import { displayName, gridShape, initials, type Reaction, type Role } from './model';

type Tile = {
  key: string;
  identity: string;
  name: string;
  track: RemoteTrack | undefined;
  speaking: boolean;
  camOn: boolean;
  self: boolean;
  role: Role;
};

export default function Stage({
  room,
  role,
  reactions,
  view,
  spotlight,
  onSpotlight,
}: {
  room: Room;
  role: Role;
  reactions: Reaction[];
  view: 'auto' | 'grid' | 'speaker';
  spotlight: string | null;
  onSpotlight: (identity: string | null) => void;
}) {
  const [reactionsVisible, setReactionsVisible] = useState(true);
  // Landscape presentation mode. A slide deserves a real 16:9 block rather than
  // being stretched across whatever shape the window happens to be, which crops
  // nothing but letterboxes badly and leaves the presenter squashed into a corner.
  const [wide, setWide] = useState(false);

  const screenShares = useTracks([{ source: Track.Source.ScreenShare, withPlaceholder: false }]);
  const cameras = useTracks([{ source: Track.Source.Camera, withPlaceholder: false }]);

  const share = screenShares[0] ?? null;

  const tiles = useMemo<Tile[]>(() => {
    const out: Tile[] = [];
    for (const t of cameras) {
      const p = t.participant;
      out.push({
        key: p.identity,
        identity: p.identity,
        name: displayName(p),
        track: t as unknown as RemoteTrack,
        speaking: p.isSpeaking,
        camOn: true,
        self: p === room.localParticipant,
        role: readRole(p),
      });
    }
    return out;
  }, [cameras, room]);

  const hasCamera = tiles.length > 0;

  // Speaker view: whoever is talking, or the spotlighted person, else the first camera.
  const speaker = useMemo(() => {
    if (spotlight) return tiles.find((t) => t.identity === spotlight) ?? null;
    return tiles.find((t) => t.speaking) ?? tiles[0] ?? null;
  }, [spotlight, tiles]);

  const mode: 'share' | 'grid' | 'speaker' =
    share ? 'share' : view === 'grid' && hasCamera ? 'grid' : view === 'speaker' && hasCamera ? 'speaker' : hasCamera ? 'speaker' : 'speaker';

  const others = useMemo(
    () => tiles.filter((t) => t.identity !== speaker?.identity),
    [tiles, speaker],
  );

  // While a slide fills the stage, the presenter's face stays visible as an inset.
  // A learner watching a presentation still needs to see the person explaining it,
  // and dropping the camera into a thumbnail row made it easy to miss.
  const pipTrack = useMemo(() => {
    if (!share) return null;
    const presenter = share.participant;
    const own = cameras.find((t) => t.participant.identity === presenter.identity);
    return own ?? cameras.find((t) => t.participant.isSpeaking) ?? cameras[0] ?? null;
  }, [share, cameras]);

  return (
    <div className="croom-stage" data-wide={wide && !!share}>
      <div className="croom-video-wrap">
        {share && (
          <button
            type="button"
            className="croom-wide-btn"
            aria-pressed={wide}
            onClick={() => setWide((v) => !v)}
            title={wide ? 'Back to filling the stage' : 'Present in landscape 16:9'}
          >
            {wide ? '⤡ Fill' : '⛶ 16:9'}
          </button>
        )}
        {mode === 'share' && share ? (
          <>
            <VideoTrack
              trackRef={share as never}
              className="croom-video"
              data-share="true"
              // contain, never cover: cropping a slide silently removes the part
              // being taught.
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
            {pipTrack && <Pip track={pipTrack} name={displayName(pipTrack.participant)} />}
          </>
        ) : mode === 'grid' && hasCamera ? (
          <div className="croom-grid" style={gridStyle(tiles.length)}>
            {tiles.map((t) => (
              <VideoTile key={t.key} tile={t} onClick={() => onSpotlight(t.identity)} />
            ))}
          </div>
        ) : speaker ? (
          <VideoTile tile={speaker} big onClick={() => onSpotlight(speaker.identity)} />
        ) : (
          <EmptyStage role={role} room={room} />
        )}

        <div className="croom-stage-label">
          {mode === 'share' && share
            ? `🖥 ${displayName(share.participant)} is presenting`
            : speaker
              ? `${speaker.name}${speaker.speaking ? ' · speaking' : ''}`
              : ''}
        </div>

        {/* Reactions float above the stage so a speaker notices without leaving it. */}
        {reactionsVisible && reactions.map((r) => (
          <span key={r.key} className="croom-float" style={{ left: `${r.x}%` }} aria-hidden>
            {r.emoji}
          </span>
        ))}
      </div>

      {/* Filmstrip. Present when a share is running, when in grid/speaker view with
          more than one camera, or whenever someone is spotlighted. */}
      {(others.length > 0 || !!share) && mode !== 'grid' && (
        <div className="croom-strip" role="list" aria-label="Participants">
          {others.map((t) => (
            <Thumb key={t.key} tile={t} onClick={() => onSpotlight(t.identity)} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * What an empty stage should say.
 *
 * "Waiting for the trainer to start" was shown whenever no camera was
 * publishing -- including to the trainer, whose own camera was simply off. That
 * reads as broken: the header says "Live", someone is in the room, and the stage
 * insists nobody has arrived. The three cases are genuinely different and each
 * needs a different next step.
 */
function EmptyStage({ role, room }: { role: Role; room: Room }) {
  const me = room.localParticipant;
  const isLearner = role === 'participant';
  const others = room.remoteParticipants.size;

  const turnOn = async () => {
    try {
      await me.setCameraEnabled(true);
      await me.setMicrophoneEnabled(true);
    } catch { /* refused device; the toolbar still shows the real state */ }
  };

  if (isLearner) {
    return (
      <div className="croom-waiting">
        <p>{others > 0 ? 'The trainer has not started their camera yet.' : 'You are first in. The trainer will be here shortly.'}</p>
        <p className="muted" style={{ fontSize: 13 }}>You are muted. Raise your hand if you want to speak.</p>
      </div>
    );
  }

  return (
    <div className="croom-waiting">
      <p>Your camera is off, so there is nothing on the stage.</p>
      <button type="button" className="croom-send" style={{ alignSelf: 'center' }} onClick={() => void turnOn()}>
        Turn on camera and mic
      </button>
      {others > 0 && (
        <p className="muted" style={{ fontSize: 13 }}>
          {others} {others === 1 ? 'person is' : 'people are'} waiting for you.
        </p>
      )}
    </div>
  );
}

function gridStyle(count: number) {
  const { cols, rows } = gridShape(count);
  return {
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
  } as const;
}

function readRole(p: { identity: string; metadata?: string }): Role {
  try {
    const r = JSON.parse(p.metadata || '{}').role;
    return r === 'admin' || r === 'moderator' || r === 'participant' || r === 'trainer' ? r : 'participant';
  } catch {
    return 'participant';
  }
}

/** Presenter inset. Draggable, and flips side near an edge so it stays reachable. */
function Pip({ track, name }: { track: unknown; name: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef<{ dx: number; dy: number } | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  const onDown = useCallback((e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    dragging.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const onMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    setPos({
      x: Math.max(8, Math.min(window.innerWidth - 120, e.clientX - dragging.current.dx)),
      y: Math.max(8, Math.min(window.innerHeight - 120, e.clientY - dragging.current.dy)),
    });
  }, []);

  const onUp = useCallback(() => { dragging.current = null; }, []);

  useEffect(() => {
    if (pos) return;
    // Default to the bottom-right, but sit on the left if that is closer, so a
    // thumb never covers the only control in the way.
    const right = window.innerWidth - 14;
    setPos({ x: right, y: window.innerHeight - 120 });
  }, [pos]);

  return (
    <div
      ref={ref}
      className="croom-pip"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      style={{
        position: 'fixed',
        left: pos?.x, top: pos?.y, right: 'auto', bottom: 'auto',
        touchAction: 'none',
        cursor: 'grab',
      }}
      title="Drag to move"
    >
      <VideoTrack trackRef={track as never} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <div className="croom-thumb-name">{name}</div>
    </div>
  );
}

function VideoTile({ tile, big, onClick }: { tile: Tile; big?: boolean; onClick?: () => void }) {
  return (
    <div
      className="croom-tile"
      data-speaking={tile.speaking}
      onClick={onClick}
      style={{ flex: big ? 1 : undefined, cursor: onClick ? 'pointer' : 'default', width: '100%', height: big ? '100%' : undefined }}
      title={onClick ? `Spotlight ${tile.name}` : undefined}
    >
      <VideoTrack
        trackRef={tile.track as never}
        className="croom-video"
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <div className="croom-thumb-name">
        {tile.self ? 'You' : tile.name}
        {!tile.camOn && ' · camera off'}
        {tile.speaking && ' · speaking'}
      </div>
    </div>
  );
}

function Thumb({ tile, onClick }: { tile: Tile; onClick: () => void }) {
  return (
    <button
      type="button"
      className="croom-thumb"
      data-speaking={tile.speaking}
      data-self={tile.self}
      onClick={onClick}
      aria-label={`Spotlight ${tile.name}`}
    >
      {tile.track ? (
        <VideoTrack trackRef={tile.track as never} className="croom-video" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span className="croom-avatar">{initials(tile.name)}</span>
      )}
      <span className="croom-thumb-name">
        {tile.self ? 'You' : tile.name}
        {tile.speaking ? ' · speaking' : ''}
      </span>
    </button>
  );
}