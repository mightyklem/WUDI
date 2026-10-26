import { putPublic } from '@/lib/storage';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Greedy word-wrap for SVG, which has no text wrapping of its own. */
function wrap(text: string, perLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= perLine) {
      cur = next;
    } else {
      if (cur) lines.push(cur);
      cur = w.length > perLine ? w.slice(0, perLine - 1) + '…' : w;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines.slice(0, maxLines);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'L';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Platform e-card template (FR-10.6): speaker-card rendered as SVG —
 * tiny over the wire, sharp on any screen, no designer needed.
 *
 * Portrait 1080x1350 (4:5) so it fills a phone feed and survives
 * WhatsApp/X/LinkedIn previews. Learnovize paper background, deep-green
 * header and footer bands, amber accents. Trainer's uploaded profile
 * photo is embedded as a data URI (best effort — external <image> refs
 * are dropped by most link-preview crawlers, and a missing photo falls
 * back to initials).
 */
export async function renderECard(opts: {
  title: string;
  trainer: string;
  when: string;
  cert: string;
  slug: string;
  topic?: string | null;
  description?: string | null;
  photoUrl?: string | null;
  /** Optional social handle / contact line, e.g. "@judyscorner". */
  handle?: string | null;
}): Promise<{ key: string; url: string }> {
  // Brand tokens (Design System v0).
  const GREEN900 = '#0B1F14';
  const GREEN700 = '#0E7A3D';
  const GREEN100 = '#DFF2E5';
  const AMBER = '#FFB020';
  const INK = '#121212';
  const MUT = '#5C5C5C';
  const PAPER = '#F7F7F5';
  const LINE = '#E6E6E2';

  const title = opts.title.trim() || 'Live class';
  const trainer = opts.trainer.trim() || 'Learnovize trainer';
  const topic = (opts.topic || '').trim();
  const desc = (opts.description || '').trim();
  const when = opts.when.trim();
  const handle = (opts.handle || '').trim();

  const titleLines = wrap(title, 26, 3);
  const descLines = desc ? wrap(desc, 48, 3) : [];

  // Trainer photo → data URI, best effort. Absolute http[s] only; anything
  // else (relative path, data already, empty) falls back to initials.
  let photoDataUri: string | null = null;
  let photoMime = '';
  if (opts.photoUrl && /^https?:\/\//.test(opts.photoUrl)) {
    try {
      const res = await fetch(opts.photoUrl);
      const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (res.ok && ['image/jpeg', 'image/png', 'image/webp'].includes(ct)) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 0 && buf.length <= 1_500_000) {
          photoMime = ct;
          photoDataUri = `data:${ct};base64,${buf.toString('base64')}`;
        }
      }
    } catch {
      photoDataUri = null;
    }
  }

  const photoBlock = photoDataUri
    ? `<clipPath id="phclip"><rect x="90" y="300" width="420" height="520" rx="36"/></clipPath>` +
      `<rect x="90" y="300" width="420" height="520" rx="36" fill="${GREEN100}"/>` +
      `<image href="${photoDataUri}" x="90" y="300" width="420" height="520" preserveAspectRatio="xMidYMid slice" clip-path="url(#phclip)"/>` +
      `<rect x="90" y="300" width="420" height="520" rx="36" fill="none" stroke="${LINE}" stroke-width="2"/>`
    : `<rect x="90" y="300" width="420" height="520" rx="36" fill="${GREEN700}"/>` +
      `<text x="300" y="590" font-family="Arial" font-size="140" fill="#FFFFFF" font-weight="bold" text-anchor="middle">${esc(initials(trainer))}</text>` +
      `<rect x="90" y="300" width="420" height="520" rx="36" fill="none" stroke="${LINE}" stroke-width="2"/>`;

  let y = 340;
  const titleSvg = titleLines
    .map((ln) => {
      const s = `<text x="550" y="${y}" font-family="Arial" font-size="56" fill="${INK}" font-weight="bold">${esc(ln)}</text>`;
      y += 66;
      return s;
    })
    .join('');
  const topicSvg = topic
    ? `<rect x="550" y="${y + 6}" width="${Math.min(46 + topic.slice(0, 28).length * 15, 430)}" height="44" rx="22" fill="${GREEN100}"/>` +
      `<text x="573" y="${y + 36}" font-family="Arial" font-size="28" fill="${GREEN700}" font-weight="bold">${esc(topic.slice(0, 28))}</text>`
    : '';
  if (topic) y += 66;

  let dy = 920;
  const descSvg = descLines
    .map((ln) => {
      const s = `<text x="90" y="${dy}" font-family="Arial" font-size="30" fill="${MUT}">${esc(ln)}</text>`;
      dy += 40;
      return s;
    })
    .join('');

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">` +
    `<rect width="1080" height="1350" fill="${PAPER}"/>` +
    // Header band: brand lockup + LIVE pill.
    `<rect width="1080" height="220" fill="${GREEN900}"/>` +
    `<text x="90" y="105" font-family="Arial" font-size="46" fill="#FFFFFF" font-weight="bold">LEARNOVIZE</text>` +
    `<rect x="90" y="130" width="150" height="44" rx="22" fill="${AMBER}"/>` +
    `<text x="165" y="160" font-family="Arial" font-size="26" fill="${GREEN900}" font-weight="bold" text-anchor="middle">● LIVE</text>` +
    `<text x="990" y="105" font-family="Arial" font-size="28" fill="${GREEN100}" text-anchor="end">SPEAKER</text>` +
    // Photo left, title + topic right.
    photoBlock +
    `<g>${titleSvg}${topicSvg}</g>` +
    // Trainer name under the photo.
    `<text x="90" y="862" font-family="Arial" font-size="36" fill="${INK}" font-weight="bold">${esc(trainer.slice(0, 34))}</text>` +
    `<text x="90" y="${descLines.length ? 898 : 900}" font-family="Arial" font-size="28" fill="${handle ? GREEN700 : MUT}">${esc((handle || 'Hosted on Learnovize').slice(0, 44))}</text>` +
    // Description.
    `<g>${descSvg}</g>` +
    // Date/time pill.
    (when
      ? `<rect x="90" y="1040" width="900" height="72" rx="36" fill="${GREEN900}"/>` +
        `<text x="540" y="1086" font-family="Arial" font-size="32" fill="#FFFFFF" font-weight="bold" text-anchor="middle">🗓  ${esc(when.slice(0, 52))}</text>`
      : '') +
    // Cert / free badge.
    `<text x="90" y="1162" font-family="Arial" font-size="30" fill="${AMBER}" font-weight="bold">${esc(opts.cert.slice(0, 60))}</text>` +
    // Footer band: register link.
    `<rect y="1210" width="1080" height="140" fill="${GREEN900}"/>` +
    `<text x="90" y="1272" font-family="Arial" font-size="30" fill="#FFFFFF" font-weight="bold">Register free</text>` +
    `<text x="90" y="1310" font-family="Arial" font-size="28" fill="${GREEN100}">learnovize · /t/${esc(opts.slug)}/register</text>` +
    `</svg>`;
  const key = `ecards/${opts.slug}-${Date.now().toString(36)}.svg`;
  const url = await putPublic(key, new TextEncoder().encode(svg), 'image/svg+xml');
  return { key, url };
}
