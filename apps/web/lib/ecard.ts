import { putPublic } from '@/lib/storage';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Platform e-card template (FR-10.6): flat brand card rendered as SVG —
 * tiny over the wire, sharp on any screen, no designer needed.
 */
export async function renderECard(opts: {
  title: string;
  trainer: string;
  when: string;
  cert: string;
  slug: string;
}): Promise<{ key: string; url: string }> {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080">` +
    `<rect width="1080" height="1080" fill="#0B1F14"/>` +
    `<rect x="40" y="40" width="1000" height="1000" fill="none" stroke="#FFB020" stroke-width="6"/>` +
    `<text x="90" y="170" font-family="Arial" font-size="44" fill="#FFB020" font-weight="bold">LEARNOVIZE LIVE</text>` +
    `<text x="90" y="300" font-family="Arial" font-size="72" fill="#FFFFFF" font-weight="bold">${esc(opts.title.slice(0, 60))}</text>` +
    `<text x="90" y="380" font-family="Arial" font-size="40" fill="#DFF2E5">${esc(opts.trainer.slice(0, 50))}</text>` +
    `<text x="90" y="450" font-family="Arial" font-size="36" fill="#FFFFFF">${esc(opts.when.slice(0, 60))}</text>` +
    `<text x="90" y="520" font-family="Arial" font-size="36" fill="#FFB020">${esc(opts.cert.slice(0, 60))}</text>` +
    `<text x="90" y="950" font-family="Arial" font-size="32" fill="#DFF2E5">learnovize · /t/${esc(opts.slug)}/register</text>` +
    `</svg>`;
  const key = `ecards/${opts.slug}-${Date.now().toString(36)}.svg`;
  const url = await putPublic(key, new TextEncoder().encode(svg), 'image/svg+xml');
  return { key, url };
}
