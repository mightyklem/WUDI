import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareAccountName, accountChangedSinceApproval } from '../src/account-name.js';

test('the same name written two ways is a match', () => {
  assert.equal(compareAccountName('OKAFOR AUGUSTINE', 'Augustine Okafor').result, 'match');
  assert.equal(compareAccountName('AUGUSTINE OKAFOR', 'AUGUSTINE OKAFOR').result, 'match');
});

test('case, punctuation and spacing do not matter', () => {
  assert.equal(compareAccountName('okafor, augustine', 'OKAFOR  AUGUSTINE').result, 'match');
  assert.equal(compareAccountName('Okafor Augustine', 'Okafor-Augustine').result, 'match');
});

test('a middle initial is the same name', () => {
  assert.equal(compareAccountName('AUGUSTINE M OKAFOR', 'Augustine Okafor').result, 'match');
  assert.equal(compareAccountName('AUGUSTINE O', 'Augustine Okafor').result, 'match');
});

test('a missing surname is partial, not a mismatch', () => {
  const r = compareAccountName('AUGUSTINE', 'Augustine Okafor');
  assert.equal(r.result, 'partial');
  assert.match(r.detail, /OKAFOR/);
});

test('a different given name is a mismatch', () => {
  const r = compareAccountName('CHINEDU OKAFOR', 'Augustine Okafor');
  assert.equal(r.result, 'mismatch');
  assert.match(r.detail, /CHINEDU/);
});

test('an entirely different name is a mismatch', () => {
  assert.equal(compareAccountName('BLESSING ADEYEMI', 'Augustine Okafor').result, 'mismatch');
});

test('titles are ignored', () => {
  assert.equal(compareAccountName('MR AUGUSTINE OKAfor', 'Augustine Okafor').result, 'match');
  assert.equal(compareAccountName('DR MRS AUGUSTINE OKAFOR', 'Augustine Okafor').result, 'match');
});

test('no name on either side is unknown', () => {
  assert.equal(compareAccountName('', 'Augustine Okafor').result, 'unknown');
  assert.equal(compareAccountName('AUGUSTINE OKAFOR', '').result, 'unknown');
  assert.equal(compareAccountName('AUGUSTINE OKAFOR', null, undefined).result, 'unknown');
});

test('the best of several names is the one reported', () => {
  // The account matches the second name, not the first.
  const r = compareAccountName('OKAFOR AUGUSTINE', 'Chinedu Okafor', 'Augustine Okafor');
  assert.equal(r.result, 'match');
});

test('initials on the account can still be checked', () => {
  assert.equal(compareAccountName('A O', 'Augustine Okafor').result, 'match');
  assert.equal(compareAccountName('X Y', 'Augustine Okafor').result, 'mismatch');
});

test('an account changed after approval is flagged', () => {
  const approved = new Date('2026-01-10T10:00:00Z');
  assert.equal(accountChangedSinceApproval(approved, new Date('2026-02-01T10:00:00Z')), true);
  assert.equal(accountChangedSinceApproval(approved, new Date('2026-01-01T10:00:00Z')), false);
  assert.equal(accountChangedSinceApproval(null, new Date('2026-02-01T10:00:00Z')), false);
  assert.equal(accountChangedSinceApproval(approved, null), false);
});

// A business account: the name the trainer gives it against the name the bank has.
// These two spellings are the same business, and calling them different would put a
// warning in front of every business account in the product.

test('a business written Ltd against Limited is the same name', () => {
  assert.equal(compareAccountName('MKO SOLAR LIMITED', 'MKO Solar Ltd').result, 'match');
  assert.equal(compareAccountName('MKO SOLAR LTD', 'MKO Solar Limited').result, 'match');
  assert.equal(compareAccountName('MKO SOLAR LTD', 'MKO Solar').result, 'match');
});

test('business endings are only stripped when they stand for each other', () => {
  // NIGERIA and GROUP are part of which business this is, so they are not stripped
  // and the two names are not the same. This is close, not identical, so it is
  // "partial" rather than a mismatch.
  assert.equal(compareAccountName('SOLAR NIGERIA LIMITED', 'SOLAR SERVICES').result, 'partial');
  assert.equal(compareAccountName('MKO GROUP LIMITED', 'MKO HOLDINGS').result, 'partial');
});

test('a business account in a different business is a mismatch', () => {
  assert.equal(compareAccountName('MKO SOLAR LIMITED', 'BLESSING ADEYEMI').result, 'mismatch');
});

test('a personal account declared in someone else name is a mismatch', () => {
  assert.equal(compareAccountName('OKAFOR AUGUSTINE', 'Chinedu Okonkwo').result, 'mismatch');
});
