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
