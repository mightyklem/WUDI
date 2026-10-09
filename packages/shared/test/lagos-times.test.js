import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lagosDayLabel, lagosSpanLabel, lagosWhenLabel, utcToLagosParts,
} from '../../../apps/web/lib/lagos.ts';

// 2026-10-09 is a Friday, and Lagos is UTC+1 all year.
test('a UTC instant becomes the Lagos wall-clock time', () => {
  const p = utcToLagosParts('2026-10-09T12:13:14.916Z');
  assert.equal(p.time, '13:13');
  assert.equal(p.date, '2026-10-09');
});

test('an evening class does not slip to the wrong day', () => {
  assert.equal(utcToLagosParts('2026-10-09T22:00:00Z').time, '23:00');
  // 23:30 UTC is 00:30 the NEXT day in Lagos.
  const late = utcToLagosParts('2026-10-09T23:30:00Z');
  assert.equal(late.time, '00:30');
  assert.equal(late.date, '2026-10-10', 'past midnight rolls to the next Lagos day');
});

test('clock times read the way a Nigerian would say them', () => {
  assert.equal(lagosWhenLabel('2026-10-09T12:13:00Z'), 'Fri 9 Oct, 1:13pm WAT');
  assert.equal(lagosWhenLabel('2026-10-09T18:00:00Z'), 'Fri 9 Oct, 7pm WAT');
  assert.equal(lagosWhenLabel('2026-10-09T08:00:00Z'), 'Fri 9 Oct, 9am WAT');
  assert.equal(lagosWhenLabel('2026-10-09T00:30:00Z'), 'Fri 9 Oct, 1:30am WAT');
});

test('midnight and noon are not rendered as a zero hour', () => {
  // 00:00 Lagos is 23:00 UTC the previous day.
  assert.equal(lagosWhenLabel('2026-10-08T23:00:00Z'), 'Fri 9 Oct, 12am WAT');
  // Noon in Lagos is 11:00 UTC.
  assert.equal(lagosWhenLabel('2026-10-09T11:00:00Z'), 'Fri 9 Oct, 12pm WAT');
});

test('a same-day session states its date once', () => {
  assert.equal(
    lagosSpanLabel('2026-10-09T12:00:00Z', '2026-10-09T14:00:00Z'),
    'Fri 9 Oct, 1pm – 3pm WAT',
  );
});

test('a session running past midnight names both days', () => {
  const span = lagosSpanLabel('2026-10-09T22:00:00Z', '2026-10-10T01:00:00Z');
  assert.match(span, /Fri 9 Oct 11pm/);
  assert.match(span, /Sat 10 Oct 2am/);
});

test('an unparseable instant yields nothing rather than "Invalid Date"', () => {
  assert.equal(lagosWhenLabel('not-a-date'), '');
  assert.equal(lagosDayLabel(''), '');
  assert.equal(lagosSpanLabel('nope', 'also-nope'), '');
});

test('every rendered time carries the zone, so it cannot be misread as local', () => {
  assert.match(lagosWhenLabel('2026-10-09T12:13:00Z'), /WAT$/);
  assert.match(lagosSpanLabel('2026-10-09T12:00:00Z', '2026-10-09T14:00:00Z'), /WAT$/);
});