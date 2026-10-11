import test from 'node:test';
import assert from 'node:assert/strict';
import { feeBorneByUs } from '../../../apps/web/lib/payments.ts';

// A 1500 naira seat: 1.5% is 22.50, plus the 100 flat fee (not waived, that only
// applies under 2500) makes 122.50, which rounds to 123.
const ASKED = 1500;
const FEE = 123;

test('with pass-fees off we bear the whole fee', () => {
  // Customer pays exactly the price; Paystack takes the fee out of it.
  assert.equal(feeBorneByUs({ chargedNgn: 1500, askedNgn: ASKED, providerFeeNgn: FEE }), FEE);
});

test('with pass-fees on we bear nothing', () => {
  // Customer pays 1623: the 1500 price plus the 123 fee they covered.
  assert.equal(feeBorneByUs({ chargedNgn: 1623, askedNgn: ASKED, providerFeeNgn: FEE }), 0);
});

test('a partial pass-through only charges us what is left', () => {
  // Charged 1550 against a 1500 price: 50 of the fee was covered by the customer.
  assert.equal(feeBorneByUs({ chargedNgn: 1550, askedNgn: ASKED, providerFeeNgn: FEE }), 73);
});

test('never returns a negative fee', () => {
  // An overpayment larger than the fee must not turn into money owed to us.
  assert.equal(feeBorneByUs({ chargedNgn: 5000, askedNgn: ASKED, providerFeeNgn: FEE }), 0);
  assert.equal(feeBorneByUs({ chargedNgn: 1500, askedNgn: ASKED, providerFeeNgn: 0 }), 0);
});

test('a mock payment with no provider fee bears nothing', () => {
  assert.equal(feeBorneByUs({ chargedNgn: 10000, askedNgn: 10000, providerFeeNgn: 0 }), 0);
});

test('the trainer is not short-changed when fees are passed on', () => {
  // This is the regression that matters. Before the fix the net was computed as
  // price - fee - commission, which under pass-fees quietly took 123 off the trainer
  // even though Paystack had already kept it.
  const commission = 0.25;
  const oldNet = ASKED - FEE - Math.round(ASKED * commission);
  const borne = feeBorneByUs({ chargedNgn: 1623, askedNgn: ASKED, providerFeeNgn: FEE });
  const newNet = ASKED - borne - Math.round(ASKED * commission);
  assert.equal(oldNet, 1002);
  assert.equal(newNet, 1125);
  assert.equal(newNet - oldNet, 123, 'the trainer recovers exactly the fee the customer paid');
});

test('nothing changes when fees are not passed on', () => {
  const borne = feeBorneByUs({ chargedNgn: 1500, askedNgn: ASKED, providerFeeNgn: FEE });
  const net = ASKED - borne - Math.round(ASKED * 0.25);
  assert.equal(net, 1002, 'the pre-existing behaviour must be untouched');
});