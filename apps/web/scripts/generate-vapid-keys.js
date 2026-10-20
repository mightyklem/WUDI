// Generates the VAPID keypair for web push.
//
// Run once:  node scripts/generate-vapid-keys.js
//
// The PUBLIC key goes in the browser and is safe to ship. The PRIVATE key signs the push
// requests and must never leave the server -- it lives in Netlify's environment, not in the
// repository and not in a client bundle.
const webpush = require('web-push');

const keys = webpush.generateVAPIDKeys();

console.log('');
console.log('  Add these to Netlify (Site settings -> Environment variables):');
console.log('');
console.log(`  VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`  VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`  VAPID_SUBJECT=mailto:notifications@learnovize.com`);
console.log('');
console.log('  VAPID_PUBLIC_KEY is also needed by the client, but it is fetched from');
console.log('  /api/push/key at runtime, so it does not need to be public env.');
console.log('');
