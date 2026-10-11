const r = await fetch('https://learnovize.com/onboarding');
const html = await r.text();
console.log('RESULT status ' + r.status + '  bytes ' + html.length);
for (const n of ['pick it up', 'Loading', 'Become a trainer', 'short bio', 'Apply to teach', 'About you', 'Your skill']) {
  console.log('RESULT contains "' + n + '" : ' + html.includes(n));
}
// client components render a shell server-side; question text only appears after hydration
const scripts = (html.match(/<script/g) || []).length;
console.log('RESULT script tags in html: ' + scripts);
console.log('RESULT has nav/shell markup: ' + html.includes('bottomnav'));
