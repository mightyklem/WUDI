/**
 * Shared vocabulary for the classroom. Everything the room needs to agree on lives
 * here so the stage, the toolbar and the side panel cannot drift apart.
 */

export type Role = 'admin' | 'trainer' | 'moderator' | 'participant';

export type ChatMsg = {
  key: string;
  from: string;
  who: string;
  text: string;
  at: number;
  reactions: Record<string, string[]>;
};

export type Poll = {
  id: string;
  question: string;
  options: string[];
  open: boolean;
  /** Set when results are shown to learners, so votes are not revealed by default. */
  revealed?: boolean;
  votes: Record<number, number>;
  seen: Set<string>;
};

export type Reaction = { key: string; emoji: string; who: string; x: number };

export const REACTION_CHOICES = ['👏', '❤️', '😂', '💡', '🙋'] as const;

/** A hand that has been raised but not yet granted speech. */
export type Hand = { identity: string; at: number };

export const enc = new TextEncoder();
export const dec = new TextDecoder();

/**
 * Chat and the hand list arrive keyed on participant identity, which is a database
 * id like cmuyynvyr0000uk8sssz6hj9d. Show something a person recognises: the
 * email local part, falling back to the full address and then the id.
 */
export function displayName(p?: { identity: string; name?: string }): string {
  const raw = p?.name || p?.identity || 'someone';
  const local = raw.split('@')[0];
  return (local || raw).trim();
}

/** Stable key for a locally created message or reaction. */
export function localKey(from: string): string {
  return `${from}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Initials for an avatar placeholder, e.g. "ada.okonkwo" -> "AO". */
export function initials(who: string): string {
  const parts = who.split(/[.\s_-]+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0] ?? '';
  const second = (parts[1]?.[0] ?? parts[0][1] ?? '').toString();
  return (first + second).toUpperCase();
}

/** How many tiles fit in a grid of the given column count, for "n people" labels. */
export function gridShape(count: number): { cols: number; rows: number } {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count <= 4) return { cols: 2, rows: 2 };
  if (count <= 9) return { cols: 3, rows: 3 };
  if (count <= 16) return { cols: 4, rows: 4 };
  return { cols: 5, rows: Math.ceil(count / 5) };
}