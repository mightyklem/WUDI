/**
 * Access to trainer identity documents.
 *
 * The consent a trainer ticks says, in plain words: "Staff who open it are recorded."
 * That is a promise about personal data under the Nigeria Data Protection Act 2023, so
 * the recording is not a nicety -- it is the thing that makes the consent truthful.
 *
 * Two things follow from taking it seriously:
 *
 *   The record is written on the route that serves the document, not in the screen that
 *   links to it. An audit trail that lives in the UI is one API call away from being
 *   bypassed, and the people it exists to account for are exactly the ones who can call
 *   the API.
 *
 *   It is written before the bytes are read, not after. A read that fails because the
 *   object is missing still leaves a row, and a staff member attempting to open a
 *   document is the event worth keeping -- not the successful ones.
 */

export const ID_ACCESS_AUDIT = {
  /** Written for every attempt to open an identity document that was granted. */
  VIEWED: 'id_document.viewed',
  /**
   * Written when staff asked for a document that does not belong to the trainer on
   * that approval. Kept separate from VIEWED so a refused attempt is never mistaken
   * for an access -- while still being on the record, which is the point.
   */
  REFUSED: 'id_document.access_refused',
  /**
   * How long a cloud signed URL stays valid. Five minutes is long enough for a reviewer
   * to open a document and look at it, short enough that a leaked link is not a lasting
   * grant to someone's passport.
   */
  SIGNED_URL_SECONDS: 300,
} as const;

/**
 * The access history for one trainer's documents.
 *
 * Matched on the storage key because keys are namespaced `id/<userId>/...`, which makes
 * the trainer's own uploads identifiable from the audit row alone. That keeps the
 * trainer's copy of the record derivable without adding a second write that could drift
 * from the first.
 */
export function idAccessQueryFor(userId: string) {
  return { action: ID_ACCESS_AUDIT.VIEWED, target: { startsWith: `id/${userId}/` } };
}

/**
 * A row for the trainer's own view of who opened their documents.
 *
 * The staff member's name is included deliberately. "Recorded" is worth very little to
 * the person whose passport it is if they are only told that *someone* looked; naming
 * the staff member is what makes the record usable as a transparency commitment, and it
 * is what they would need in order to complain about it.
 *
 * Names come from the audit row's actor, never from the free-text reason field, so a
 * crafted reason string cannot impersonate a colleague here.
 */
export function describeAccess(row: {
  createdAt: Date;
  actor?: { displayName?: string | null; email?: string | null } | null;
}) {
  const name = row.actor?.displayName?.trim();
  const email = row.actor?.email?.trim();
  return {
    at: row.createdAt,
    // Falls back to the local part of the staff address, which is still a person.
    by: name || (email ? email.split('@')[0] : 'staff'),
  };
}
