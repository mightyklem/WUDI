import test from 'node:test';
import assert from 'node:assert/strict';
import { personName, hasRealName } from '../src/rules.js';

/**
 * What to print when we have to name a person.
 *
 * These exist because there were three separate decisions about this. The giveaway derived
 * a name from an email, the roster did the same, and the certificate printed the email
 * address itself -- so a paid graduate held a PDF with "mightyklemaugustine@gmail.com"
 * across the middle of it, which is exactly the document nobody shows an employer.
 */

test('a real name wins over everything else', () => {
  assert.equal(personName({ fullName: 'Amaka Obi', email: 'amaka@x.com' }), 'Amaka Obi');
});

test('a name is trimmed before it is used', () => {
  // This string is laid out in the middle of a PDF. Leading and trailing whitespace shows
  // up as the name sitting off-centre.
  assert.equal(personName({ fullName: '  Amaka Obi  ', email: 'a@b.com' }), 'Amaka Obi');
});

test('a blank or whitespace name falls back rather than printing nothing', () => {
  assert.equal(personName({ fullName: '   ', email: 'amaka@x.com' }), 'amaka');
  assert.equal(personName({ fullName: '', email: 'amaka@x.com' }), 'amaka');
  assert.equal(personName({ email: 'amaka.obi@x.com' }), 'amaka.obi');
});

test('the fallback is the local part, never the whole address', () => {
  // The whole point. An email address on a certificate is not a name.
  const n = personName({ email: 'mightyklemaugustine@gmail.com' });
  assert.equal(n, 'mightyklemaugustine');
  assert.ok(!n.includes('@'), 'an email address reached a certificate');
});

test('nothing in, nothing out -- rather than the word undefined', () => {
  assert.equal(personName(null), null);
  assert.equal(personName(undefined), null);
  assert.equal(personName({}), null);
  assert.equal(personName({ email: '   ' }), null);
  assert.equal(personName({ fullName: null, email: null }), null);
});

test('an address with no local part does not produce an empty name', () => {
  assert.equal(personName({ email: '@domain.com' }), null);
});

test('hasRealName separates a supplied name from a derived one', () => {
  // Used where the difference matters: telling somebody their certificate says
  // "mightyklemaugustine" because they never gave a name is more honest than presenting
  // the mangled version as if it were their name.
  assert.equal(hasRealName({ fullName: 'Amaka Obi', email: 'a@b.com' }), true);
  assert.equal(hasRealName({ fullName: '  ', email: 'a@b.com' }), false);
  assert.equal(hasRealName({ fullName: null, email: 'a@b.com' }), false);
  assert.equal(hasRealName(null), false);
  assert.equal(hasRealName(undefined), false);
});

test('a supplied name always beats a derived one, in both helpers', () => {
  const u = { fullName: 'Amaka Obi', email: 'amaka@x.com' };
  assert.equal(personName(u), 'Amaka Obi');
  assert.equal(hasRealName(u), true);
});