// Turning a finished draft into the order record that is stored and sent to the owner.

import { humanDate, humanTime, isoDate } from './format.js';
import { quote } from './pricing.js';
import { slotById } from './slots.js';
import { zoneById } from './catalog.js';

/** CED-2309-014 - date of the order plus a running number, readable over the phone. */
export function orderNumber(now, sequence) {
  const iso = isoDate(now);
  return `CED-${iso.slice(8, 10)}${iso.slice(5, 7)}-${String(sequence).padStart(3, '0')}`;
}

export function buildOrder(session, ctx) {
  const d = session.draft;
  const q = quote(d);
  const zone = zoneById(d.zoneId);
  return {
    number: orderNumber(ctx.now, ctx.sequence),
    placedAt: new Date(ctx.now).toISOString(),
    chatId: ctx.chatId ?? null,
    telegramUser: ctx.username ? `@${ctx.username}` : null,
    customer: { name: d.name, phone: d.phone },
    item: {
      id: d.itemId,
      variantId: d.variantId || null,
      label: q.itemLabel,
      qty: q.qty,
      unitCents: q.unitCents,
    },
    handover: {
      date: d.dateIso,
      dateLabel: humanDate(d.dateIso),
      slotId: d.slotId,
      slotLabel: slotById(d.slotId) ? slotById(d.slotId).title : null,
      method: zone && zone.pickup ? 'pickup' : 'delivery',
      zoneId: d.zoneId,
      zoneTitle: zone ? zone.cardTitle : null,
      address: d.address || null,
    },
    notes: d.notes || null,
    totals: {
      subtotalCents: q.subtotalCents,
      deliveryCents: q.deliveryCents,
      totalCents: q.totalCents,
    },
    status: 'new',
    receivedAtLabel: humanTime(ctx.now),
  };
}
