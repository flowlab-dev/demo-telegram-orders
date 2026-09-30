// The simulated night: the page's numbers have to come out of the engine, every time.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SCENARIOS, runNight } from '../demo/scenarios.js';

test('the night runs end to end and the totals add up', () => {
  const night = runNight();
  assert.equal(night.chats.length, SCENARIOS.length);
  assert.equal(night.orders.length, 8);
  assert.equal(night.questions, 1);
  assert.equal(night.revenueCents, night.orders.reduce((sum, o) => sum + o.totals.totalCents, 0));
  assert.equal(night.revenueCents, 74000);
});

test('order numbers run in sequence with no gaps or repeats', () => {
  const numbers = runNight().orders.map((o) => o.number);
  assert.equal(new Set(numbers).size, numbers.length);
  const sequence = numbers.map((n) => Number(n.slice(-3)));
  assert.deepEqual(sequence, sequence.map((_, i) => i + 1));
});

test('the chats that should not produce an order do not produce one', () => {
  const night = runNight();
  const by = (id) => night.chats.find((c) => c.scenario.id === id).chat;

  assert.equal(by('abandoned').orders.length, 0, 'walked away halfway');
  assert.equal(by('cancelled').orders.length, 0, 'cancelled at the summary');
  assert.equal(by('cancelled').ownerMessages.length, 0, 'a cancelled order must not reach the owner');
  assert.equal(by('question').orders.length, 0);
  assert.equal(by('question').ownerMessages[0].kind, 'question');
});

test('the awkward chats end the way they should', () => {
  const night = runNight();
  const by = (id) => night.chats.find((c) => c.scenario.id === id).chat;

  const far = by('out-of-zone');
  assert.equal(far.orders[0].handover.method, 'pickup', 'too far to deliver - becomes pickup');
  assert.equal(far.orders[0].totals.deliveryCents, 0);

  const changed = by('changed-mind');
  assert.equal(changed.orders.length, 1, 'changing the size must not create two orders');
  assert.match(changed.orders[0].item.label, /16 servings/);

  const soon = by('too-soon');
  assert.equal(soon.orders.length, 1);
  assert.ok(soon.messages.some((m) => /too soon/.test(m.text)), 'the 48 hours were explained');

  const typos = by('typos');
  assert.equal(typos.orders.length, 1);
  assert.ok(typos.messages.some((m) => /plain number/.test(m.text)));
  assert.ok(typos.messages.some((m) => /Monday - the bakehouse is closed/.test(m.text)));
});

test('every order the night produced is complete enough to bake', () => {
  for (const order of runNight().orders) {
    assert.ok(order.customer.name && order.customer.phone, `${order.number} has no contact`);
    assert.ok(order.handover.date && order.handover.slotId, `${order.number} has no handover time`);
    assert.ok(order.totals.totalCents > 0, `${order.number} has no price`);
    if (order.handover.method === 'delivery') assert.ok(order.handover.address, `${order.number} is delivery with no address`);
    assert.ok(Date.parse(order.handover.date) >= Date.parse(order.placedAt.slice(0, 10)), 'handover cannot be before the order');
  }
});
