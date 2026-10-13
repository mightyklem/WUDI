import { readFileSync } from 'node:fs';

/**
 * Header overflow check.
 *
 * There is no headless browser in this project, so this cannot render the page.
 * What it does instead is assert two things that together are what actually
 * prevents sideways scrolling:
 *
 *   1. The stylesheet really does contain the guarantees -- no overflow on the
 *      bar, min-width:0 on the logo, a clamp() on the icon targets. If someone
 *      deletes one of these the check fails, which is the point.
 *   2. The worst-case minimum width of the bar fits every viewport width.
 *
 * The arithmetic uses the smallest value each rule can produce, so it is a
 * lower bound on what will actually be rendered.
 */
const css = readFileSync('apps/web/app/globals.css', 'utf8');

/* ---------------- 1. the guarantees are present ---------------- */

const MUST_HAVE = [
  { re: /\.logo\s*\{[^}]*min-width:\s*0/, why: 'logo must be allowed to shrink or it pushes the bar sideways' },
  { re: /\.logo\s*\{[^}]*text-overflow:\s*ellipsis/, why: 'logo must ellipsis rather than overflow' },
  { re: /\.navicon\s*\{[^}]*width:\s*clamp\(/, why: 'icon targets must be clamp() sized so 5 fit at 320px' },
  { re: /\.navicon\s*\{[^}]*flex:\s*0 0 auto/, why: 'nav icons must never shrink; they are the navigation' },
  // These are <a> elements. Without a colour of their own they take the user
  // agent's link blue and sit as bright blue glyphs in a teal header -- which is
  // exactly what happened, and it only shows at rest because hover and the
  // active state both set their own colour.
  { re: /\.navicon\s*\{[^}]*color:\s*var\(--mut\)/, why: 'nav icons must declare a resting colour or they render link-blue' },
  { re: /\.navicon\[aria-current='page'\]\s*\{[^}]*color:\s*#fff/, why: 'the active icon must invert to white on the teal fill' },
];

let failed = 0;
console.log('  stylesheet guarantees:');
for (const g of MUST_HAVE) {
  const ok = g.re.test(css);
  if (!ok) failed++;
  console.log(`    ${ok ? 'PASS' : 'FAIL'}  ${g.why}`);
}

// The bar must not clip or scroll. Any overflow declaration inside the .topbar
// rule is the exact defect being fixed.
const topbarBlock = (css.match(/\.topbar\s*\{([\s\S]*?)\n\}/) || [])[1] ?? '';
const hasOverflow = /overflow/.test(topbarBlock);
console.log(`    ${hasOverflow ? 'FAIL' : 'PASS'}  .topbar sets no overflow (nothing clipped, nothing scrollable)`);
if (hasOverflow) failed++;

const mediaBlock = (css.match(/@media \(max-width: 560px\)\s*\{([\s\S]*?)\n\}/) || [])[1] ?? '';
const collapses = /\.topbar-action-label\s*\{\s*display:\s*none/.test(mediaBlock)
  && /\.topbar-action-icon\s*\{\s*display:\s*block/.test(mediaBlock);
console.log(`    ${collapses ? 'PASS' : 'FAIL'}  below 560px the action labels collapse to icons`);
if (!collapses) failed++;

/* ---------------- 2. worst-case width fits ---------------- */

const VIEWPORTS = [320, 375, 768, 1280];
const WRAP_PAD = 44; // .wrap padding is 22px each side, unchanged

/** 10vw, not vw/100 -- that is 1vw, which made the clamp return its floor always. */
function clamp(lo, vw, hi) { return Math.max(lo, Math.min(vw * 0.10, hi)); }

console.log('\n  worst-case minimum bar width:');
let overflow = 0;
for (const vw of VIEWPORTS) {
  const narrow = vw <= 560;
  const icon = Math.round(clamp(36, vw, 44));
  const nav = icon * 3 + 4 * 2;                 // 3 icons, 2 gaps of 4
  // The logo may shrink to just its mark; the text can ellipsis to nothing.
  const logoMin = narrow ? 22 + 7 : 26 + 9;
  // Below 560px each action is an icon in a 10px-padded button.
  const action = narrow ? 17 + 20 : 0;
  const actions = action ? action * 2 : 95 + 62;
  const gaps = (narrow ? 6 : 10) * 4;
  const total = WRAP_PAD + logoMin + nav + actions + gaps;

  const ok = total <= vw;
  if (!ok) overflow++;
  console.log(
    `    ${String(vw).padStart(4)}px  icon=${String(icon).padStart(2)}  nav=${String(nav).padStart(3)}  ` +
    `logo>=${String(logoMin).padStart(2)}  actions=${String(actions).padStart(3)}  ` +
    `gaps=${String(gaps).padStart(2)}  => ${String(total).padStart(4)}px  ` +
    (ok ? 'fits' : `OVERFLOWS by ${total - vw}px`),
  );
}

console.log(
  `\n  ${failed === 0 && overflow === 0
    ? 'PASS - the bar cannot scroll sideways at any tested width'
    : `FAIL - ${failed} stylesheet problem(s), ${overflow} viewport(s) overflowing`}`,
);
process.exit(failed === 0 && overflow === 0 ? 0 : 1);