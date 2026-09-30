// Formatting helpers. All date maths is done in UTC so that the same input
// always produces the same output - on the server, in the browser demo and in tests.
// The shop's wall clock is treated as UTC and labelled "shop local time" for the customer.

import { SHOP } from './catalog.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const DAY_MS = 24 * 60 * 60 * 1000;

export function money(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  return `${sign}${SHOP.symbol}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' for a timestamp, in UTC. */
export function isoDate(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

/** Midnight UTC of the day that contains ts. */
export function startOfDay(ts) {
  return Date.parse(`${isoDate(ts)}T00:00:00Z`);
}

export function dateToTs(iso, time = '00:00') {
  return Date.parse(`${iso}T${time}:00Z`);
}

export function weekdayOf(iso) {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/** 'Fri 25 Sep' - short and unambiguous for an international customer. */
export function humanDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** '00:42' - used in the owner's night summary. */
export function humanTime(ts) {
  const d = new Date(ts);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export function isClosedDay(iso) {
  return SHOP.closedWeekdays.includes(weekdayOf(iso));
}

export const MONTH_NAMES = MONTHS;
