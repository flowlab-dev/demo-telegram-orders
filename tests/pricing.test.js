// Money, order records and the owner's summary.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ITEMS, ZONES, itemById, unitPriceCents } from '../engine/catalog.js';
import { money } from '../engine/format.js';
import { orderNumber } from '../engine/orders.js';
import { deliveryAllowed, quote } from '../engine/pricing.js';
import { nightSummary } from '../engine/text.js';
import { createChat } from '../engine/harness.js';

const NOW = Date.parse('2026-09-23T00:42:00Z');

test('money never loses a cent to floating point', () => {
  assert.equal(money(0), '$0.00');
  assert.equal(money(5), '$0.05');
  assert.equal(money(10400), '$104.00');
  assert.equal(money(21900), '$219.00');
});

test('a quote is unit price times quantity plus the delivery fee', () => {
  const q = quote({ itemId: 'lemon', variantId: '16', qty: 2, zoneId: 'b' });
  assert.equal(q.unitCents, 10400);
  assert.equal(q.subtotalCents, 20800);
  assert.equal(q.deliveryCents, 1100);
  assert.equal(q.totalCents, 21900);
  assert.equal(q.itemLabel, 'Lemon & elderflower cake, 16 servings');
});

test('pickup is free and an unserved zone is charged nothing by mistake', () => {
  assert.equal(quote({ itemId: 'rye', qty: 2, zoneId: 'pickup' }).deliveryCents, 0);
  assert.equal(quote({ itemId: 'rye', qty: 2, zoneId: 'far' }).deliveryCents, 0);
});

test('the delivery minimum is a basket rule, not a total rule', () => {
  assert.equal(deliveryAllowed({ itemId: 'rye', qty: 1 }), false, '$9 basket');
  assert.equal(deliveryAllowed({ itemId: 'rye', qty: 3 }), true, '$27 basket');
  assert.equal(deliveryAllowed({ itemId: 'vanilla', variantId: '6', qty: 1 }), true);
});

test('every catalogue item has a price and a sane limit', () => {
  for (const item of ITEMS) {
    const prices = item.variants ? item.variants.map((v) => v.priceCents) : [item.priceCents];
    for (const price of prices) {
      assert.ok(Number.isInteger(price) && price > 0, `${item.id} has a bad price`);
    }
    assert.ok(item.maxQty >= 1 && item.maxQty <= 20, `${item.id} has a bad maxQty`);
    assert.ok(item.description && item.description.length > 10, `${item.id} needs a real description`);
    assert.equal(unitPriceCents(item, item.variants ? item.variants[0].id : null), prices[0]);
  }
  assert.equal(itemById('nope'), null);
  assert.ok(ZONES.some((z) => z.pickup) && ZONES.some((z) => z.unserved));
});

test('order numbers carry the date and run in sequence', () => {
  assert.equal(orderNumber(NOW, 1), 'CED-2309-001');
  assert.equal(orderNumber(NOW, 42), 'CED-2309-042');
  assert.notEqual(orderNumber(NOW, 1), orderNumber(NOW + 86400000, 1));
});

test('the night summary adds up exactly what was booked', () => {
  const c = createChat({ now: NOW, firstName: 'Nadia', sequence: 1 });
  c.start();
  c.tapLike('Place an order'); c.tapLike('Bread boxes'); c.tapLike('Sourdough'); c.tapLike('4');
  c.tapLike('Thu 24 Sep'); c.tapLike('Morning'); c.tapLike('pick it up'); c.tapLike('Nothing to add');
  c.type('Nadia'); c.type('+1 415 555 0199'); c.tapLike('Confirm');

  const text = nightSummary(c.orders, 1, NOW - 6 * 3600000, NOW);
  assert.match(text, /1 order · \$56\.00/);
  assert.match(text, /Sourdough duo × 4/);
  assert.match(text, /1 question waiting/);
  assert.match(nightSummary([], 0, NOW - 3600000, NOW), /No orders came in tonight/);
});
