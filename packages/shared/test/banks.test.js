import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bankCodeFor, transferableBanks } from '../src/banks.js';

test('the real bank code is used, not the provider internal id', () => {
  // UBA, exactly as Paystack returns it.
  assert.equal(bankCodeFor({ code: '033', longcode: '033153513' }), '033');
  assert.equal(bankCodeFor({ code: '044', longcode: '044150149' }), '044');
  assert.equal(bankCodeFor({ code: '011', longcode: '011151003' }), '011');
});

test('a bank with no internal id still works', () => {
  assert.equal(bankCodeFor({ code: '104', longcode: '' }), '104');
  assert.equal(bankCodeFor({ code: '104' }), '104');
});

test('the internal id is only used when there is nothing else', () => {
  assert.equal(bankCodeFor({ code: '', longcode: '090659' }), '090659');
  assert.equal(bankCodeFor({ code: null, longcode: '090659' }), '090659');
});

test('nothing at all is nothing', () => {
  assert.equal(bankCodeFor({ code: '', longcode: '' }), null);
  assert.equal(bankCodeFor(null), null);
  assert.equal(bankCodeFor(undefined), null);
  assert.equal(bankCodeFor('nonsense'), null);
});

test('only banks that can receive a transfer are offered', () => {
  const banks = [
    { name: 'Good Bank', code: '011', longcode: '011151003', country: 'Nigeria', active: true, supports_transfer: true },
    { name: 'Dormant Bank', code: '012', country: 'Nigeria', active: false, supports_transfer: true },
    { name: 'No Transfers', code: '013', country: 'Nigeria', active: true, supports_transfer: false },
    { name: 'Not Nigeria', code: '999', country: 'Ghana', active: true, supports_transfer: true },
  ];
  const list = transferableBanks(banks);
  assert.equal(list.length, 1);
  assert.equal(list[0].code, '011');
  assert.equal(list[0].name, 'Good Bank');
});
