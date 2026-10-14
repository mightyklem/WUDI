#!/usr/bin/env node
/**
 * Generate the Ed25519 keypair that signs certificates.
 *
 * Run once. The PRIVATE half goes into an environment variable and is never written
 * anywhere else -- not into the repo, not into the database, not into a build artefact.
 * Losing it means no new certificate can ever be signed, so back it up offline
 * somewhere that is not this laptop and not the database.
 *
 *   node scripts/generate-cert-key.mjs
 *
 * Then set both variables:
 *   CERT_SIGNING_PRIVATE_KEY  <- the PRIVATE key, Netlify, secret
 *   CERT_SIGNING_PUBLIC_KEY   <- the PUBLIC key, published openly
 */

import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');

const priv = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString().trim();
const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString().trim();

console.log('');
console.log('  CERT_SIGNING_PRIVATE_KEY  (secret — never commit, never print in public)');
console.log('  ------------------------------------------------------------------------');
console.log(priv.split('\n').map((l) => `  ${l}`).join('\n'));
console.log('');
console.log('  CERT_SIGNING_PUBLIC_KEY  (publish this — anyone may have it)');
console.log('  ------------------------------------------------------------------------');
console.log(pub.split('\n').map((l) => `  ${l}`).join('\n'));
console.log('');
console.log('  Add the private key to Netlify under Site configuration -> Environment.');
console.log('  The public key belongs on the verification page, not just in the settings.');
console.log('');
console.log('  Back the private key up offline. If it is lost, nothing new can be signed,');
console.log('  and every certificate already issued keeps verifying against the old key.');
console.log('');