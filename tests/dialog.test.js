// The order dialog, driven exactly the way a customer drives it: taps and typing.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createChat } from '../engine/harness.js';

const NOW = Date.parse('2026-09-23T00:42:00Z'); // Wednesday night
const ctx = { now: NOW, firstName: 'Nadia', username: 'nadia_k' };

function chat(extra = {}) {
  return createChat({ ...ctx, ...extra });
}

function orderACake(c) {
  c.start();
  c.tapLike('Place an order');
  c.tapLike('Celebration cakes');
  c.tapLike('Dark chocolate');
  c.tapLike('10 servings');
  c.tapLike('1');
  c.tapLike('Fri 25 Sep');
  c.tapLike('Afternoon');
  return c;
}

test('a full order ends in a stored order, a confirmation and a message to the owner', () => {
  const c = orderACake(chat());
  c.tapLike('city centre');
  c.type('12 Harbour Lane, flat 4');
  c.type('Happy birthday Mira - no nuts please');
  c.tapLike('Use "Nadia"');
  c.type('+1 415 555 0199');
  assert.match(c.lastText(), /Total: \$76\.00/);

  c.tapLike('Confirm');
  assert.equal(c.orders.length, 1);
  const order = c.orders[0];
  assert.equal(order.totals.subtotalCents, 7000);
  assert.equal(order.totals.deliveryCents, 600);
  assert.equal(order.totals.totalCents, 7600);
  assert.equal(order.handover.method, 'delivery');
  assert.equal(order.handover.date, '2026-09-25');
  assert.equal(order.customer.phone, '+1 415 555 0199');
  assert.match(order.number, /^CED-\d{4}-001$/);

  const owner = c.ownerMessages.filter((m) => m.kind === 'order');
  assert.equal(owner.length, 1);
  assert.match(owner[0].text, /New order CED-/);
  assert.match(owner[0].text, /\$76\.00/);
  assert.match(c.messages.at(-2).text, /Booked!/);
  assert.match(c.lastText(), /Anything else/); // back to the main menu, ready for the next order
});

test('pickup skips the address question and costs nothing', () => {
  const c = orderACake(chat());
  c.tapLike('pick it up');
  assert.match(c.lastText(), /Anything we should know/);
  c.tapLike('Nothing to add');
  c.tapLike('Use "Nadia"');
  c.type('+1 415 555 0199');
  c.tapLike('Confirm');
  assert.equal(c.orders[0].totals.deliveryCents, 0);
  assert.equal(c.orders[0].handover.address, null);
});

test('a basket under the delivery minimum is never offered delivery at all', () => {
  const c = chat();
  c.start();
  c.tapLike('Place an order');
  c.tapLike('Bread boxes');
  c.tapLike('Seeded rye');
  c.tapLike('1');
  c.tapLike('Thu 24 Sep');
  c.tapLike('Morning');
  assert.match(c.lastText(), /Delivery starts at \$25\.00/);
  const labels = c.keyboard().rows.flat().map((b) => b.text);
  assert.deepEqual(labels.filter((l) => /Delivery/.test(l)), [], 'no delivery button may be shown');
  c.tapLike('pick it up');
  assert.match(c.lastText(), /Anything we should know/);
});

test('a big enough basket is offered every delivery zone', () => {
  const c = orderACake(chat());
  const labels = c.keyboard().rows.flat().map((b) => b.text);
  assert.equal(labels.filter((l) => /Delivery/.test(l)).length, 3);
});

test('an address outside the delivery zones is explained, not silently accepted', () => {
  const c = orderACake(chat());
  c.tapLike('further than 12 km');
  assert.match(c.lastText(), /Pickup or delivery/);
  assert.ok(c.messages.some((m) => /do not deliver further than 12 km/.test(m.text)));
});

test('a cake cannot be ordered for tomorrow - the 48 hours are explained', () => {
  const c = chat();
  c.start();
  c.tapLike('Place an order');
  c.tapLike('Celebration cakes');
  c.tapLike('Lemon');
  c.tapLike('6 servings');
  c.tapLike('1');
  c.type('tomorrow');
  assert.match(c.messages.at(-2).text, /too soon/);
  assert.match(c.lastText(), /Which day/);
});

test('a Monday is refused because the bakehouse is closed', () => {
  const c = chat();
  c.start();
  c.tapLike('Place an order');
  c.tapLike('Bread boxes');
  c.tapLike('Sourdough');
  c.tapLike('2');
  c.type('2026-09-28');
  assert.match(c.messages.at(-2).text, /Monday - the bakehouse is closed/);
});

test('typed dates in several formats are all understood', () => {
  for (const typed of ['25.09', '25 Sep', 'Sep 25', '2026-09-25']) {
    const c = chat();
    c.start();
    c.tapLike('Place an order');
    c.tapLike('Celebration cakes');
    c.tapLike('vanilla');
    c.tapLike('6 servings');
    c.tapLike('1');
    c.type(typed);
    assert.match(c.lastText(), /Fri 25 Sep/, `failed for "${typed}"`);
  }
});

test('nonsense in a text field is answered with a specific hint, not a generic error', () => {
  const c = chat();
  c.start();
  c.tapLike('Place an order');
  c.tapLike('Office platters');
  c.tapLike('Cookie box');
  c.type('two boxes');
  assert.match(c.messages.at(-2).text, /plain number/);
  c.type('99');
  assert.match(c.messages.at(-2).text, /up to 10/);
  c.type('2');
  assert.match(c.lastText(), /Which day/);
});

test('a phone number with letters is refused, a real one is kept as typed', () => {
  const c = orderACake(chat());
  c.tapLike('pick it up');
  c.tapLike('Nothing to add');
  c.type('Nadia K');
  c.type('call me');
  assert.match(c.messages.at(-2).text, /Numbers only/);
  c.type('+1 415 555 0199');
  assert.match(c.lastText(), /Here is your order/);
});

test('a button from an earlier message is recognised instead of corrupting the order', () => {
  const c = orderACake(chat());
  c.tapRaw('category|cake', 'Celebration cakes (old button)');
  assert.match(c.messages.at(-2).text, /earlier step/);
  assert.match(c.lastText(), /Pickup or delivery/);
  assert.equal(c.session.draft.itemId, 'chocolate');
});

test('"Back" returns to the previous question with the earlier answers intact', () => {
  const c = orderACake(chat());
  c.tapLike('pick it up');
  c.tapLike('← Back');
  assert.match(c.lastText(), /Pickup or delivery/);
  c.tapLike('← Back');
  assert.match(c.lastText(), /when suits you/);
  assert.equal(c.session.draft.itemId, 'chocolate');
});

test('changing the item mid-summary re-asks only what that change invalidates', () => {
  const c = orderACake(chat());
  c.tapLike('pick it up');
  c.type('Message on top: Congratulations Amir');
  c.type('Sofia Ruiz');
  c.type('+34 000 000 019');
  assert.match(c.lastText(), /Here is your order/);

  c.tapLike('Change something');
  c.tapLike('The item');
  c.tapLike('Celebration cakes');
  c.tapLike('vanilla');
  c.tapLike('16 servings');
  c.tapLike('1');
  c.tapLike('Sat 26 Sep');
  c.tapLike('Morning');
  // The basket changed, so pickup-or-delivery is asked again; name, phone and note are kept.
  assert.match(c.lastText(), /Pickup or delivery/);
  c.tapLike('pick it up');
  assert.match(c.lastText(), /Here is your order/);
  assert.match(c.lastText(), /Classic vanilla layer cake, 16 servings/);
  assert.match(c.lastText(), /Sofia Ruiz/);
  c.tapLike('Confirm');
  assert.equal(c.orders[0].totals.totalCents, 9200);
});

test('cancelling at the summary stores nothing and tells the owner nothing', () => {
  const c = orderACake(chat());
  c.tapLike('pick it up');
  c.tapLike('Nothing to add');
  c.tapLike('Use "Nadia"');
  c.type('+1 415 555 0199');
  c.tapLike('Cancel the order');
  assert.equal(c.orders.length, 0);
  assert.equal(c.ownerMessages.length, 0);
  assert.match(c.messages.at(-2).text, /dropped that order/);
});

test('/cancel works at any step and /start offers to carry on', () => {
  const c = orderACake(chat());
  c.command('cancel');
  assert.equal(c.session.step, 'idle');

  const d = orderACake(chat());
  d.start();
  assert.match(d.lastText(), /order in progress/);
  d.tapLike('Carry on');
  assert.match(d.lastText(), /Pickup or delivery/);

  const e = orderACake(chat());
  e.start();
  e.tapLike('Start a new order');
  assert.match(e.lastText(), /What are we baking/);
  assert.equal(e.session.draft.itemId, undefined);
});

test('a question is handed to a human and never turns into an order', () => {
  const c = chat();
  c.start();
  c.tapLike('Talk to a human');
  c.type('Can you make the lemon cake gluten free?');
  assert.equal(c.orders.length, 0);
  const question = c.ownerMessages.find((m) => m.kind === 'question');
  assert.ok(question, 'the owner should receive the question');
  assert.match(question.text, /gluten free/);
  assert.match(c.messages.at(-2).text, /Passed on/);
});

test('an order placed for a slot that has just passed is sent back to the date question', () => {
  const c = orderACake(chat());
  c.tapLike('pick it up');
  c.tapLike('Nothing to add');
  c.tapLike('Use "Nadia"');
  c.type('+1 415 555 0199');
  // Three days go by with the summary still open on the customer's phone.
  c.setNow(Date.parse('2026-09-26T09:00:00Z'));
  c.tapLike('Confirm');
  assert.equal(c.orders.length, 0);
  assert.match(c.messages.at(-2).text, /Nothing is left on Fri 25 Sep/);
  assert.match(c.lastText(), /Which day/);
});

test('a message typed outside an order reaches a person, as the bot promised', () => {
  const c = chat();
  c.start();
  c.type('Can I change order CED-2309-001 to Saturday?');
  const forwarded = c.ownerMessages.find((m) => m.kind === 'question');
  assert.ok(forwarded, 'the confirmation promises a person will see this - so a person must');
  assert.match(forwarded.text, /CED-2309-001/);
  assert.match(c.messages.at(-2).text, /passed that to the bakehouse/);
});

test('typed text where buttons are expected gets a nudge, not silence', () => {
  const c = chat();
  c.start();
  c.tapLike('Place an order');
  c.type('the chocolate one');
  assert.match(c.messages.at(-2).text, /use the buttons/);
  assert.match(c.lastText(), /What are we baking/);
});

test('a photo or voice note is answered honestly instead of being taken as an empty note', () => {
  const c = orderACake(chat());
  c.tapLike('pick it up');
  assert.match(c.lastText(), /Anything we should know/);
  c.apply({ type: 'unsupported' }, '[photo]');
  assert.match(c.messages.at(-2).text, /cannot open pictures/);
  assert.equal(c.session.draft.notes, undefined, 'an unreadable message must not become the note');
});

test('menu and hours cards answer without starting an order', () => {
  const c = chat();
  c.start();
  c.tapLike('Menu & prices');
  assert.match(c.messages.at(-2).text, /CELEBRATION CAKES/);
  c.tapLike('Pickup, delivery & hours');
  assert.match(c.messages.at(-2).text, /Closed on Mondays/);
  assert.equal(c.session.step, 'idle');
});

test('HTML typed by a customer is escaped before it reaches the owner', () => {
  const c = orderACake(chat());
  c.tapLike('pick it up');
  c.type('<script>alert(1)</script> no nuts');
  c.type('Nadia');
  c.type('+1 415 555 0199');
  c.tapLike('Confirm');
  const owner = c.ownerMessages[0].text;
  assert.ok(!owner.includes('<script>'), 'raw tag must not reach the owner message');
  assert.match(owner, /&lt;script&gt;/);
});
