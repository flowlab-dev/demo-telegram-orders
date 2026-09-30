// Input checks. Every function returns either { ok: true, value } or { ok: false, reason },
// so the dialog can answer with a specific, human explanation instead of "invalid input".

import { SHOP } from './catalog.js';
import { DAY_MS, MONTH_NAMES, isClosedDay, isoDate, startOfDay } from './format.js';
import { slotsForDate } from './slots.js';

const LETTER = /\p{L}/u;

export function parseQuantity(text, maxQty) {
  const trimmed = String(text || '').trim();
  if (!/^\d{1,3}$/.test(trimmed)) return { ok: false, reason: 'not_a_number' };
  const n = Number(trimmed);
  if (n < 1) return { ok: false, reason: 'too_small' };
  if (n > maxQty) return { ok: false, reason: 'too_many', max: maxQty };
  return { ok: true, value: n };
}

export function validateName(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (value.length < 2) return { ok: false, reason: 'too_short' };
  if (value.length > 60) return { ok: false, reason: 'too_long' };
  if (!LETTER.test(value)) return { ok: false, reason: 'no_letters' };
  return { ok: true, value };
}

export function validatePhone(text) {
  const raw = String(text || '').trim();
  if (/[A-Za-z]/.test(raw)) return { ok: false, reason: 'has_letters' };
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 7) return { ok: false, reason: 'too_short' };
  if (digits.length > 15) return { ok: false, reason: 'too_long' };
  // Kept exactly as the customer typed it (spacing tidied) - the owner has to dial it.
  return { ok: true, value: raw.replace(/\s+/g, ' ') };
}

export function validateAddress(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (value.length < 8) return { ok: false, reason: 'too_short' };
  if (value.length > 140) return { ok: false, reason: 'too_long' };
  if (!/\d/.test(value)) return { ok: false, reason: 'no_number' };
  return { ok: true, value };
}

export function validateNote(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (value.length > 120) return { ok: false, reason: 'too_long' };
  return { ok: true, value };
}

/**
 * Accepts what people actually type at night: 2026-09-25, 25.09, 25/09,
 * 25 Sep, Sep 25, today, tomorrow. Returns an ISO date that is open,
 * far enough ahead for this item's lead time and inside the booking window.
 */
export function parseDate(text, now, leadHours) {
  const raw = String(text || '').trim().toLowerCase();
  if (!raw) return { ok: false, reason: 'unreadable' };

  const today = startOfDay(now);
  let iso = null;

  if (raw === 'today') iso = isoDate(today);
  else if (raw === 'tomorrow') iso = isoDate(today + DAY_MS);

  if (!iso) {
    const full = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (full) iso = `${full[1]}-${full[2]}-${full[3]}`;
  }
  if (!iso) {
    const dm = raw.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/);
    if (dm) iso = buildIso(Number(dm[3] || 0), Number(dm[2]), Number(dm[1]), today);
  }
  if (!iso) {
    const named = raw.match(/^(\d{1,2})\s*([a-z]{3,9})$/) || flip(raw.match(/^([a-z]{3,9})\s*(\d{1,2})$/));
    if (named) {
      const month = MONTH_NAMES.findIndex((m) => named[2].startsWith(m.toLowerCase())) + 1;
      if (month > 0) iso = buildIso(0, month, Number(named[1]), today);
    }
  }
  if (!iso) return { ok: false, reason: 'unreadable' };

  const ts = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(ts) || isoDate(ts) !== iso) return { ok: false, reason: 'unreadable' };
  if (ts < today) return { ok: false, reason: 'in_the_past' };
  if (ts > today + SHOP.maxDaysAhead * DAY_MS) return { ok: false, reason: 'too_far', maxDays: SHOP.maxDaysAhead };
  if (isClosedDay(iso)) return { ok: false, reason: 'closed_day', iso };
  if (slotsForDate(iso, now, leadHours).length === 0) return { ok: false, reason: 'too_soon', iso, leadHours };
  return { ok: true, value: iso };
}

function flip(match) {
  return match ? [match[0], match[2], match[1]] : null;
}

/** Day/month without a year means the next occurrence of that day. */
function buildIso(year, month, day, todayTs) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const pad = (n) => String(n).padStart(2, '0');
  if (year) {
    const y = year < 100 ? 2000 + year : year;
    return `${y}-${pad(month)}-${pad(day)}`;
  }
  const thisYear = new Date(todayTs).getUTCFullYear();
  const candidate = `${thisYear}-${pad(month)}-${pad(day)}`;
  if (Date.parse(`${candidate}T00:00:00Z`) >= todayTs) return candidate;
  return `${thisYear + 1}-${pad(month)}-${pad(day)}`;
}
