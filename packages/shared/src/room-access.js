/**
 * Who may publish in a room, given their role and whether a speech grant exists.
 *
 * This is a rule, not a detail, and it is kept pure so it can be tested. It was
 * previously inlined at the call site as `canPublishOverride: canSpeak`, which
 * meant every trainer was minted a listen-only token: `false ?? true` is
 * `false`, not `true`, so the fallback never fired. The trainer's camera and mic
 * could not turn on and the empty stage reported that nobody had arrived.
 *
 * The lesson is that the fallback in mintRoomToken cannot save a caller that
 * passes a deliberate `false` for the wrong reason. Decide the permission here,
 * where it can be checked.
 */
export function canPublishInRoom(role, hasSpeechGrant) {
  // Staff are here to teach or to settle a dispute. A trainer who cannot publish
  // cannot teach, and a moderator who cannot publish cannot grant anyone speech.
  if (role === 'trainer' || role === 'moderator' || role === 'admin') return true;
  // A learner may publish only while a grant is live. The grant is re-read on
  // every join, so a reconnect does not silently take the floor away.
  if (role === 'participant') return !!hasSpeechGrant;
  return false;
}