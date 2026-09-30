// Input checks, including the ones people only hit at 2 a.m.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseDate, parseQuantity, validateAddress, validateName, validateNote, validatePhone } from '../engine/validate.js';

const NOW = Date.parse('2026-09-23T00:42:00Z');

test('quantities', () => {
  assert.deepEqual(parseQuantity('3', 10), { ok: true, value: 3 });
  assert.equal(parseQuantity('0', 10).reason, 'too_small');
  assert.equal(parseQuantity('11', 10).reason, 'too_many');
  assert.equal(parseQuantity('three', 10).reason, 'not_a_number');
  assert.equal(parseQuantity('2.5', 10).reason, 'not_a_number');
  assert.equal(parseQuantity('', 10).reason, 'not_a_number');
  assert.equal(parseQuantity('-1', 10).reason, 'not_a_number');
});

test('names', () => {

  assert.deepEqual(validateName('  Sofia   Ruiz '), { ok: true, value: 'Sofia Ruiz' });
  assert.equal(validateName('S').reason, 'too_short');
  assert.equal(validateName('12345').reason, 'no_letters');
  assert.equal(validateName('x'.repeat(61)).reason, 'too_long');
  assert.equal(validateName('Ольга').ok, true, 'non-latin names are names too');
});

test('phone numbers', () => {
  assert.equal(validatePhone('+1 415 555 0199').value, '+1 415 555 0199');
  assert.equal(validatePhone('(415) 555-0199').ok, true);
  assert.equal(validatePhone('call me maybe').reason, 'has_letters');
  assert.equal(validatePhone('12345').reason, 'too_short');
  assert.equal(validatePhone('1'.repeat(16)).reason, 'too_long');
});

test('addresses need a house number', () => {
  assert.equal(validateAddress('12 Harbour Lane, flat 4').ok, true);
  assert.equal(validateAddress('Harbour Lane').reason, 'no_number');
  assert.equal(validateAddress('12 St').reason, 'too_short');
  assert.equal(validateAddress(`12 ${'a'.repeat(140)}`).reason, 'too_long');
});

test('notes are trimmed and capped', () => {
  assert.deepEqual(validateNote('  no   nuts  '), { ok: true, value: 'no nuts' });
  assert.equal(validateNote('x'.repeat(121)).reason, 'too_long');
});

test('dates: what is accepted', () => {
  for (const typed of ['25.09', '25/09', '25 Sep', 'sep 25', '2026-09-25']) {
    assert.deepEqual(parseDate(typed, NOW, 48), { ok: true, value: '2026-09-25' }, typed);
  }
  assert.equal(parseDate('tomorrow', NOW, 12).value, '2026-09-24', 'bread only needs 12 hours');
});

test('dates: what is refused, and why', () => {
  assert.equal(parseDate('tomorrow', NOW, 48).reason, 'too_soon');
  assert.equal(parseDate('2026-09-28', NOW, 48).reason, 'closed_day');
  assert.equal(parseDate('2026-09-01', NOW, 48).reason, 'in_the_past');
  assert.equal(parseDate('2027-12-01', NOW, 48).reason, 'too_far');
  assert.equal(parseDate('next friday', NOW, 48).reason, 'unreadable');
  assert.equal(parseDate('31.02', NOW, 48).reason, 'unreadable');
  assert.equal(parseDate('', NOW, 48).reason, 'unreadable');
});

test('a day/month without a year means the next one that is still ahead', () => {
  const december = Date.parse('2026-12-20T10:00:00Z');
  assert.equal(parseDate('05.01', december, 12).value, '2027-01-05');
});
