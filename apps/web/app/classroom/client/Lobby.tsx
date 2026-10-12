'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { initials, type Role } from './model';

export type LobbyDevice = { deviceId: string; label: string; kind: 'audioinput' | 'videoinput' };

/**
 * Pre-join check, in the spirit of Google Meet's lobby and Zoom's device dialog.
 *
 * Both products understood the same thing: a person who discovers their mic is
 * muted, or that they joined with the wrong camera, discovers it at the worst
 * possible moment -- in front of a class. Asking first costs five seconds and
 * removes an entire category of support problem.
 *
 * Learners join muted and camera-off by default, because this is a taught class
 * rather than a meeting: nobody appears on camera until the trainer grants
 * permission to speak.
 */
export default function Lobby({
  role,
  joining,
  onJoin,
  error,
}: {
  role: Role;
  joining: boolean;
  onJoin: (opts: { mic: boolean; cam: boolean; deviceId: string }) => void;
  error: string | null;
}) {
  const [devices, setDevices] = useState<LobbyDevice[]>([]);
  const [micId, setMicId] = useState('');
  const [camId, setCamId] = useState('');
  const isLearner = role === 'participant';
  // A learner arrives muted with the camera off, because they are not permitted
  // to publish until the trainer allows it. Staff are here to teach, so they
  // start live -- defaulting them off too meant every trainer had to turn
  // themselves on from a cold join.
  const [micOn, setMicOn] = useState(!isLearner);
  const [camOn, setCamOn] = useState(!isLearner);
  const [perms, setPerms] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [probe, setProbe] = useState<{ mic: boolean; cam: boolean }>({ mic: false, cam: false });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Ask once on mount. Permissions requested without a reason are refused far
  // more often, so the copy states the purpose before the prompt appears.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        const mapped: LobbyDevice[] = list
          .filter((d): d is MediaDeviceInfo & { kind: 'audioinput' | 'videoinput' } =>
            d.kind === 'audioinput' || d.kind === 'videoinput')
          .map((d, i) => ({
            deviceId: d.deviceId,
            label: d.label || `${d.kind === 'audioinput' ? 'Microphone' : 'Camera'} ${i + 1}`,
            kind: d.kind,
          }));
        setDevices(mapped);
        setMicId((m) => m || mapped.find((d) => d.kind === 'audioinput')?.deviceId || '');
        setCamId((c) => c || mapped.find((d) => d.kind === 'videoinput')?.deviceId || '');
        setPerms('granted');
      } catch {
        if (!cancelled) setPerms('denied');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Start a live preview so the person can see and hear themselves before joining.
  useEffect(() => {
    let dead = false;
    const stop = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };
    if (!micOn && !camOn) { stop(); setProbe({ mic: false, cam: false }); return; }
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: camOn ? { deviceId: camId ? { exact: camId } : undefined, width: 1280, height: 720 } : false,
          audio: micOn ? { deviceId: micId ? { exact: micId } : undefined, echoCancellation: true, noiseSuppression: true } : false,
        });
        if (dead) { s.getTracks().forEach((t) => t.stop()); return; }
        stop();
        streamRef.current = s;
        setProbe({ mic: s.getAudioTracks().length > 0, cam: s.getVideoTracks().length > 0 });
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.muted = true;
          void videoRef.current.play().catch(() => {});
        }
      } catch {
        if (!dead) setProbe({ mic: false, cam: false });
      }
    })();
    return () => { dead = true; };
  }, [micOn, camOn, micId, camId]);

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  return (
    <div className="croom-lobby">
      <div className="croom-lobby-stage">
        {camOn && probe.cam ? (
          <video ref={videoRef} playsInline muted autoPlay />
        ) : (
          <div className="croom-waiting">
            <div
              aria-hidden
              style={{
                width: 108, height: 108, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'radial-gradient(circle at 50% 35%, #1d3b30, #0b1410 70%)',
                fontSize: 34, fontWeight: 650, color: '#cfe0d8',
              }}
            >
              {initials('you')}
            </div>
            <p style={{ margin: 0 }}>{camOn ? 'Camera is not starting' : 'Camera is off'}</p>
          </div>
        )}
        <div className="croom-stage-label">
          {isLearner ? 'You will join as a listener' : 'Ready to teach'}
        </div>
      </div>

      <div className="croom-lobby-bar">
        <button
          type="button"
          className="croom-btn"
          data-off={!micOn}
          aria-pressed={micOn}
          onClick={() => setMicOn((v) => !v)}
        >
          <b>{micOn ? '🎙' : '🔇'}</b>
          <span>{micOn ? 'Mic on' : 'Mic off'}</span>
        </button>
        <button
          type="button"
          className="croom-btn"
          data-off={!camOn}
          aria-pressed={camOn}
          onClick={() => setCamOn((v) => !v)}
        >
          <b>{camOn ? '📷' : '🚫'}</b>
          <span>{camOn ? 'Cam on' : 'Cam off'}</span>
        </button>

        {micOn && devices.some((d) => d.kind === 'audioinput') && (
          <select
            className="croom-input"
            style={{ maxWidth: 190 }}
            value={micId}
            aria-label="Microphone"
            onChange={(e) => setMicId(e.target.value)}
          >
            {devices.filter((d) => d.kind === 'audioinput').map((d) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
            ))}
          </select>
        )}
        {camOn && devices.some((d) => d.kind === 'videoinput') && (
          <select
            className="croom-input"
            style={{ maxWidth: 190 }}
            value={camId}
            aria-label="Camera"
            onChange={(e) => setCamId(e.target.value)}
          >
            {devices.filter((d) => d.kind === 'videoinput').map((d) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
            ))}
          </select>
        )}

        <button
          type="button"
          className="croom-btn leave"
          style={{ minWidth: 130 }}
          disabled={joining}
          onClick={() => { cleanup(); onJoin({ mic: micOn, cam: camOn, deviceId: camId }); }}
        >
          <b>{joining ? '…' : '→'}</b>
          <span>{joining ? 'Joining' : isLearner ? 'Join as listener' : 'Join class'}</span>
        </button>
      </div>

      {error && <p className="croom-notice" style={{ margin: 12 }}>{error}</p>}
      {perms === 'denied' && (
        <p className="croom-notice" style={{ margin: 12 }}>
          Camera and microphone were blocked. You can still join and listen, or allow
          access in your browser's site settings and reload.
        </p>
      )}
      {perms === 'granted' && (micOn || camOn) && !(probe.mic || probe.cam) && (
        <p className="croom-notice" style={{ margin: 12 }}>
          Nothing is coming through. Check the device is in use by another app, then try again.
        </p>
      )}
    </div>
  );
}