// Pickup and delivery time windows, and the rule that decides which of them
// are still reachable given the item's lead time.

import { SHOP } from './catalog.js';
import { DAY_MS, dateToTs, isClosedDay, isoDate, startOfDay } from './format.js';

export const SLOTS = [
  { id: 'am', title: 'Morning 08:00-12:00', start: '08:00' },
  { id: 'pm', title: 'Afternoon 12:00-18:00', start: '12:00' },
];

export function slotById(id) {
  return SLOTS.find((s) => s.id === id) || null;
}

/** The earliest moment an order for this item can be handed over. */
export function earliestTs(now, leadHours) {
  return now + leadHours * 60 * 60 * 1000;
}

export function slotsForDate(iso, now, leadHours) {
  if (isClosedDay(iso)) return [];
  const limit = earliestTs(now, leadHours);
  return SLOTS.filter((s) => dateToTs(iso, s.start) >= limit);
}

/** Up to `count` dates that still have at least one reachable slot. */
export function suggestDates(now, leadHours, count = 4) {
  const out = [];
  const first = startOfDay(earliestTs(now, leadHours));
  for (let i = 0; out.length < count && i <= SHOP.maxDaysAhead; i += 1) {
    const iso = isoDate(first + i * DAY_MS);
    if (slotsForDate(iso, now, leadHours).length > 0) out.push(iso);
  }
  return out;
}

export function lastBookableIso(now) {
  return isoDate(startOfDay(now) + SHOP.maxDaysAhead * DAY_MS);
}
