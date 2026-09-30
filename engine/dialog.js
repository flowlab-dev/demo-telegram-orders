// The order dialog: a pure state machine.
//
//   handle(session, event, ctx) -> { session, actions }
//
// It never touches the network, the clock or the disk - the caller passes `ctx.now`
// and applies the returned actions. That is what lets the same file run the real
// Telegram bot, the browser demo and the tests without a second implementation.

import {
  CATEGORIES, ITEMS, SHOP, ZONES,
  categoryById, itemById, itemsInCategory, unitPriceCents, variantById, zoneById,
} from './catalog.js';
import { humanDate, money } from './format.js';
import { buildOrder } from './orders.js';
import { deliveryAllowed, quote } from './pricing.js';
import { SLOTS, slotById, slotsForDate, suggestDates } from './slots.js';
import * as T from './text.js';
import { parseDate, parseQuantity, validateAddress, validateName, validateNote, validatePhone } from './validate.js';

/** Order of the questions. nextStep() walks this list and skips what is already known. */
const FLOW = ['category', 'item', 'variant', 'qty', 'date', 'slot', 'zone', 'address', 'notes', 'name', 'phone', 'confirm'];

export function newSession() {
  return { step: 'idle', draft: {}, trail: [], greeted: false };
}

export function handle(session, event, ctx) {
  const s = clone(session || newSession());
  const out = [];
  const api = { session: s, actions: out, ctx };

  if (event.type === 'command') return command(api, event);
  if (event.type === 'callback') return callback(api, event);
  if (event.type === 'text') return text(api, event);
  if (event.type === 'unsupported') {
    out.push(send(T.cannotSeeAttachments()));
    return ask(api);
  }
  return { session: s, actions: out };
}

/** The question for the step the session is on right now. */
export function prompt(session, ctx) {
  const d = session.draft;
  switch (session.step) {
    case 'idle':
      return {
        text: session.greeted ? T.anythingElse() : T.greeting(ctx.now, ctx.firstName),
        keyboard: mainMenu(),
      };

    case 'resume':
      return {
        text: 'You already have an order in progress. Would you like to carry on with it, or start a new one?',
        keyboard: rows([[btn('resume', 'Carry on', 'go')], [btn('resume', 'Start a new order', 'new')]]),
      };

    case 'question':
      return { text: T.ASK_QUESTION, keyboard: rows([[btn('question', '← Back', 'back')]]) };

    case 'category':
      return {
        text: 'What are we baking for you?',
        keyboard: rows([
          ...CATEGORIES.map((c) => [btn('category', `${c.title} - ${c.note}`, c.id)]),
          [btn('category', '← Back', 'back')],
        ]),
      };

    case 'item': {
      const category = categoryById(d.categoryId);
      return {
        text: `<b>${category.title}</b> - ${category.note}.\n\nPick one:`,
        keyboard: rows([
          ...itemsInCategory(category.id).map((i) => [btn('item', itemButton(i), i.id)]),
          [btn('item', '← Back', 'back')],
        ]),
      };
    }

    case 'variant': {
      const item = itemById(d.itemId);
      return {
        text: `<b>${item.title}</b>\n${item.description}\n\nWhich size?`,
        keyboard: rows([
          ...item.variants.map((v) => [btn('variant', `${v.title} - ${money(v.priceCents)}`, v.id)]),
          [btn('variant', '← Back', 'back')],
        ]),
      };
    }

    case 'qty': {
      const item = itemById(d.itemId);
      const shortcuts = [];
      for (let n = 1; n <= Math.min(item.maxQty, 6); n += 1) shortcuts.push(btn('qty', String(n), String(n)));
      return {
        text: `How many?${item.maxQty > 6 ? `\n\nTap a number, or type any number up to ${item.maxQty}.` : ''}`,
        keyboard: rows([...chunk(shortcuts, 3), [btn('qty', '← Back', 'back')]]),
      };
    }

    case 'date': {
      const item = itemById(d.itemId);
      const lead = categoryById(item.categoryId).leadHours;
      const dates = suggestDates(ctx.now, lead, 4);
      return {
        text: [
          `Which day would you like it?`,
          '',
          `This one needs ${lead} hours, so the earliest is <b>${humanDate(dates[0])}</b>.`,
          'Tap a day, or type one - day first: 25.09, 25 Sep or 2026-09-25.',
        ].join('\n'),
        keyboard: rows([
          ...chunk(dates.map((iso) => btn('date', humanDate(iso), iso)), 2),
          [btn('date', '← Back', 'back')],
        ]),
      };
    }

    case 'slot': {
      const item = itemById(d.itemId);
      const lead = categoryById(item.categoryId).leadHours;
      const open = slotsForDate(d.dateIso, ctx.now, lead);
      return {
        text: `<b>${humanDate(d.dateIso)}</b> - when suits you?`,
        keyboard: rows([
          ...open.map((sl) => [btn('slot', sl.title, sl.id)]),
          [btn('slot', '← Back', 'back')],
        ]),
      };
    }

    case 'zone': {
      const q = quote(d);
      const canDeliver = deliveryAllowed(d);
      const offered = ZONES.filter((z) => z.pickup || canDeliver);
      return {
        text: [
          'Pickup or delivery?',
          '',
          `Your order so far: ${T.esc(q.itemLabel)} × ${q.qty} - ${money(q.subtotalCents)}.`,
          canDeliver
            ? `Delivery is added on top; pickup is free, ${SHOP.pickup.from}-${SHOP.pickup.to}.`
            : `Delivery starts at ${money(SHOP.deliveryMinimumCents)} per order, so this one is pickup - or go back and add a little more.`,
        ].join('\n'),
        keyboard: rows([
          ...offered.map((z) => [btn('zone', z.unserved ? z.title : `${z.title}${z.feeCents ? ` - ${money(z.feeCents)}` : ' - free'}`, z.id)]),
          [btn('zone', '← Back', 'back')],
        ]),
      };
    }

    case 'address':
      return {
        text: 'What is the delivery address?\n\nStreet, house number and flat - the driver reads exactly what you write.',
        keyboard: rows([[btn('address', '← Back', 'back')]]),
      };

    case 'notes': {
      const item = itemById(d.itemId);
      return {
        text: [
          'Anything we should know?',
          '',
          item.allowsInscription
            ? 'Allergies, a message to pipe on the cake, a doorbell that never works - write it here.'
            : 'Allergies, packaging, a doorbell that never works - write it here.',
        ].join('\n'),
        keyboard: rows([[btn('notes', 'Nothing to add', 'skip')], [btn('notes', '← Back', 'back')]]),
      };
    }

    case 'name': {
      const buttons = [];
      if (ctx.firstName) buttons.push([btn('name', `Use "${ctx.firstName}"`, 'self')]);
      buttons.push([btn('name', '← Back', 'back')]);
      return { text: 'Whose name should the order be under?', keyboard: rows(buttons) };
    }

    case 'phone':
      return {
        text: 'And a phone number, in case the bakehouse needs to reach you on the day.',
        keyboard: rows([[btn('phone', '← Back', 'back')]]),
      };

    case 'confirm':
      return {
        text: T.summary(session),
        keyboard: rows([
          [btn('confirm', 'Confirm the order ✅', 'yes')],
          [btn('confirm', 'Change something', 'edit')],
          [btn('confirm', 'Cancel the order', 'cancel')],
        ]),
      };

    case 'edit':
      return {
        text: 'What would you like to change?',
        keyboard: rows([
          [btn('edit', 'The item', 'item')],
          [btn('edit', 'The day or time', 'day')],
          [btn('edit', 'Pickup or delivery', 'delivery')],
          [btn('edit', 'The note', 'note')],
          [btn('edit', 'Name or phone', 'contact')],
          [btn('edit', '← Back to the order', 'back')],
        ]),
      };

    default:
      return { text: T.greeting(ctx.now, ctx.firstName), keyboard: mainMenu() };
  }
}

// ---------------------------------------------------------------- commands

function command(api, event) {
  const { session: s, ctx } = api;
  switch (event.name) {
    case 'start':
      if (hasProgress(s)) {
        s.step = 'resume';
        return ask(api);
      }
      reset(s);
      return ask(api);

    case 'cancel':
      if (!hasProgress(s) && s.step === 'idle') {
        api.actions.push(send(T.NOTHING_TO_CANCEL, mainMenu()));
        return done(api);
      }
      reset(s);
      api.actions.push(send(T.CANCELLED));
      return ask(api);

    case 'menu':
      api.actions.push(send(T.menuCard()));
      if (s.step === 'idle') return ask(api);
      return done(api);

    case 'help':
      api.actions.push(send(T.hoursCard()));
      if (s.step === 'idle') return ask(api);
      return done(api);

    case 'idle': {
      // The confirmation promises "write here if you need to change something",
      // so anything typed outside an order goes to a person instead of being refused.
      if (!body) { api.actions.push(send(T.unexpectedText())); return ask(api); }
      api.actions.push({ type: 'owner', kind: 'question', text: T.ownerQuestion({ name: ctx.firstName, username: ctx.username }, body) });
      api.actions.push(send(T.messageForwarded()));
      return ask(api);
    }

    default:
      api.actions.push(send(T.unexpectedText()));
      return ask(api);
  }
}

// --------------------------------------------------------------- callbacks

function callback(api, event) {
  const { session: s, ctx } = api;
  const parsed = parseData(event.data);
  api.actions.push({ type: 'ack' });

  if (!parsed) return ask(api);

  // A button from a message further up the chat: say so and re-ask where we are.
  if (parsed.step !== s.step) {
    api.actions.push(send(T.stale()));
    return ask(api);
  }

  if (parsed.value === 'back') return back(api);

  switch (s.step) {
    case 'idle':
      if (parsed.value === 'order') return goForward(api, 'category');
      if (parsed.value === 'menu') { api.actions.push(send(T.menuCard())); return ask(api); }
      if (parsed.value === 'hours') { api.actions.push(send(T.hoursCard())); return ask(api); }
      if (parsed.value === 'ask') { s.step = 'question'; return ask(api); }
      return ask(api);

    case 'resume':
      if (parsed.value === 'go') { s.step = resumeStep(s); return ask(api); }
      reset(s);
      return goForward(api, 'category');

    case 'category': {
      if (!categoryById(parsed.value)) return ask(api);
      push(s);
      s.draft.categoryId = parsed.value;
      return advance(api);
    }

    case 'item': {
      const item = itemById(parsed.value);
      if (!item || item.categoryId !== s.draft.categoryId) return ask(api);
      push(s);
      s.draft.itemId = item.id;
      if (item.maxQty === 1) s.draft.qty = 1;
      return advance(api);
    }

    case 'variant': {
      const item = itemById(s.draft.itemId);
      if (!variantById(item, parsed.value)) return ask(api);
      push(s);
      s.draft.variantId = parsed.value;
      return advance(api);
    }

    case 'qty': {
      const item = itemById(s.draft.itemId);
      const check = parseQuantity(parsed.value, item.maxQty);
      if (!check.ok) return ask(api);
      push(s);
      s.draft.qty = check.value;
      return advance(api);
    }

    case 'date': {
      const item = itemById(s.draft.itemId);
      const lead = categoryById(item.categoryId).leadHours;
      const check = parseDate(parsed.value, ctx.now, lead);
      if (!check.ok) { api.actions.push(send(dateError(check))); return ask(api); }
      push(s);
      s.draft.dateIso = check.value;
      return advance(api);
    }

    case 'slot': {
      const item = itemById(s.draft.itemId);
      const lead = categoryById(item.categoryId).leadHours;
      const open = slotsForDate(s.draft.dateIso, ctx.now, lead);
      if (!open.some((sl) => sl.id === parsed.value)) {
        api.actions.push(send(T.ERRORS.slot_gone(s.draft.dateIso)));
        s.draft.dateIso = null;
        s.step = 'date';
        return ask(api);
      }
      push(s);
      s.draft.slotId = parsed.value;
      return advance(api);
    }

    case 'zone': {
      const zone = zoneById(parsed.value);
      if (!zone) return ask(api);
      if (zone.unserved) { api.actions.push(send(T.ERRORS.zone_unserved())); return ask(api); }
      if (!zone.pickup && !deliveryAllowed(s.draft)) {
        api.actions.push(send(T.ERRORS.delivery_minimum(SHOP.deliveryMinimumCents)));
        return ask(api);
      }
      push(s);
      s.draft.zoneId = zone.id;
      if (zone.pickup) s.draft.address = null;
      return advance(api);
    }

    case 'notes':
      if (parsed.value === 'skip') { push(s); s.draft.notes = ''; return advance(api); }
      return ask(api);

    case 'name':
      if (parsed.value === 'self' && ctx.firstName) {
        const check = validateName(ctx.firstName);
        if (check.ok) { push(s); s.draft.name = check.value; return advance(api); }
      }
      return ask(api);

    case 'confirm':
      if (parsed.value === 'yes') return placeOrder(api);
      if (parsed.value === 'edit') { push(s); s.step = 'edit'; return ask(api); }
      if (parsed.value === 'cancel') { reset(s); api.actions.push(send(T.CANCELLED)); return ask(api); }
      return ask(api);

    case 'edit': {
      const d = s.draft;
      push(s);
      if (parsed.value === 'item') {
        // A different item changes both the lead time and the basket, so the day and the
        // delivery choice go with it - otherwise the summary can show a delivery the
        // basket is no longer big enough for.
        d.categoryId = null; d.itemId = null; d.variantId = null; d.qty = null;
        d.dateIso = null; d.slotId = null; d.zoneId = null; d.address = null;
        s.step = 'category';
      }
      else if (parsed.value === 'day') { d.dateIso = null; d.slotId = null; s.step = 'date'; }
      else if (parsed.value === 'delivery') { d.zoneId = null; d.address = null; s.step = 'zone'; }
      else if (parsed.value === 'note') { d.notes = null; s.step = 'notes'; }
      else if (parsed.value === 'contact') { d.name = null; d.phone = null; s.step = 'name'; }
      return ask(api);
    }

    default:
      return ask(api);
  }
}

// ------------------------------------------------------------------- text

function text(api, event) {
  const { session: s, ctx } = api;
  const body = String(event.text || '').trim();

  if (s.step === 'question') {
    if (!body) { api.actions.push(send(T.askForWords())); return ask(api); }
    api.actions.push({ type: 'owner', kind: 'question', text: T.ownerQuestion({ name: ctx.firstName, username: ctx.username }, body) });
    s.step = 'idle';
    api.actions.push(send(T.questionSent()));
    return ask(api);
  }

  switch (s.step) {
    case 'qty': {
      const item = itemById(s.draft.itemId);
      const check = parseQuantity(body, item.maxQty);
      if (!check.ok) { api.actions.push(send(qtyError(check, item.maxQty))); return ask(api); }
      push(s);
      s.draft.qty = check.value;
      return advance(api);
    }

    case 'date': {
      const item = itemById(s.draft.itemId);
      const lead = categoryById(item.categoryId).leadHours;
      const check = parseDate(body, ctx.now, lead);
      if (!check.ok) { api.actions.push(send(dateError(check))); return ask(api); }
      push(s);
      s.draft.dateIso = check.value;
      return advance(api);
    }

    case 'address': {
      const check = validateAddress(body);
      if (!check.ok) { api.actions.push(send(T.ERRORS[`address_${check.reason}`]())); return ask(api); }
      push(s);
      s.draft.address = check.value;
      return advance(api);
    }

    case 'notes': {
      const check = validateNote(body);
      if (!check.ok) { api.actions.push(send(T.ERRORS.note_too_long())); return ask(api); }
      push(s);
      s.draft.notes = check.value;
      return advance(api);
    }

    case 'name': {
      const check = validateName(body);
      if (!check.ok) { api.actions.push(send(T.ERRORS[`name_${check.reason}`]())); return ask(api); }
      push(s);
      s.draft.name = check.value;
      return advance(api);
    }

    case 'phone': {
      const check = validatePhone(body);
      if (!check.ok) { api.actions.push(send(T.ERRORS[`phone_${check.reason}`]())); return ask(api); }
      push(s);
      s.draft.phone = check.value;
      return advance(api);
    }

    case 'idle': {
      // The confirmation promises "write here if you need to change something",
      // so anything typed outside an order goes to a person instead of being refused.
      if (!body) { api.actions.push(send(T.unexpectedText())); return ask(api); }
      api.actions.push({ type: 'owner', kind: 'question', text: T.ownerQuestion({ name: ctx.firstName, username: ctx.username }, body) });
      api.actions.push(send(T.messageForwarded()));
      return ask(api);
    }

    default:
      api.actions.push(send(T.unexpectedText()));
      return ask(api);
  }
}

// -------------------------------------------------------------- machinery

function placeOrder(api) {
  const { session: s, ctx } = api;
  // Prices or distances may have drifted while the chat was open - check once more.
  const zone = zoneById(s.draft.zoneId);
  if (zone && !zone.pickup && !deliveryAllowed(s.draft)) {
    api.actions.push(send(T.ERRORS.delivery_minimum(SHOP.deliveryMinimumCents)));
    s.draft.zoneId = null;
    s.draft.address = null;
    s.step = 'zone';
    return ask(api);
  }
  const item = itemById(s.draft.itemId);
  const lead = categoryById(item.categoryId).leadHours;
  if (!slotsForDate(s.draft.dateIso, ctx.now, lead).some((sl) => sl.id === s.draft.slotId)) {
    api.actions.push(send(T.ERRORS.slot_gone(s.draft.dateIso)));
    s.draft.dateIso = null;
    s.draft.slotId = null;
    s.step = 'date';
    return ask(api);
  }

  const order = buildOrder(s, ctx);
  api.actions.push({ type: 'save_order', order });
  api.actions.push(send(T.confirmed(order)));
  api.actions.push({ type: 'owner', kind: 'order', text: T.ownerAlert(order), order });
  reset(s);
  return ask(api);
}

/** Move to the first question in FLOW that still has no answer. */
function advance(api) {
  const { session: s } = api;
  const from = FLOW.indexOf(s.step);
  for (let i = from + 1; i < FLOW.length; i += 1) {
    const step = FLOW[i];
    if (applicable(step, s.draft) && !answered(step, s.draft)) { s.step = step; return ask(api); }
  }
  s.step = 'confirm';
  return ask(api);
}

function goForward(api, step) {
  push(api.session);
  api.session.step = step;
  return ask(api);
}

function back(api) {
  const { session: s } = api;
  const previous = s.trail.pop();
  if (!previous) { reset(s); return ask(api); }
  s.step = previous.step;
  s.draft = previous.draft;
  return ask(api);
}

function applicable(step, draft) {
  const item = itemById(draft.itemId);
  if (step === 'variant') return Boolean(item && item.variants);
  if (step === 'qty') return Boolean(item && item.maxQty > 1);
  if (step === 'address') {
    const zone = zoneById(draft.zoneId);
    return Boolean(zone && !zone.pickup);
  }
  return true;
}

function answered(step, draft) {
  const key = {
    category: 'categoryId', item: 'itemId', variant: 'variantId', qty: 'qty',
    date: 'dateIso', slot: 'slotId', zone: 'zoneId', address: 'address',
    notes: 'notes', name: 'name', phone: 'phone',
  }[step];
  if (!key) return false;
  const value = draft[key];
  return value !== null && value !== undefined && value !== false;
}

/** Where "carry on" puts a customer who came back with /start. */
function resumeStep(s) {
  for (const step of FLOW) {
    if (applicable(step, s.draft) && !answered(step, s.draft)) return step;
  }
  return 'confirm';
}

function hasProgress(s) {
  return Boolean(s.draft && Object.keys(s.draft).some((k) => s.draft[k] !== null && s.draft[k] !== undefined));
}

function ask(api) {
  const p = prompt(api.session, api.ctx);
  if (api.session.step === 'idle') api.session.greeted = true;
  api.actions.push(send(p.text, p.keyboard));
  return { session: api.session, actions: api.actions };
}

function done(api) {
  return { session: api.session, actions: api.actions };
}

function reset(s) {
  // `greeted` survives a reset: nobody wants "Good evening" three times in one chat.
  s.step = 'idle';
  s.draft = {};
  s.trail = [];
}

function push(s) {
  s.trail.push({ step: s.step, draft: clone(s.draft) });
  if (s.trail.length > 30) s.trail.shift();
}

function send(text, keyboard) {
  return keyboard ? { type: 'send', text, keyboard } : { type: 'send', text };
}

function mainMenu() {
  return rows([
    [btn('idle', '🧁 Place an order', 'order')],
    [btn('idle', '📋 Menu & prices', 'menu')],
    [btn('idle', '🚚 Pickup, delivery & hours', 'hours')],
    [btn('idle', '💬 Talk to a human', 'ask')],
  ]);
}

function itemButton(item) {
  if (item.variants) {
    const cheapest = Math.min(...item.variants.map((v) => v.priceCents));
    return `${item.title} - from ${money(cheapest)}`;
  }
  return `${item.title} - ${money(item.priceCents)}`;
}

function qtyError(check, max) {
  if (check.reason === 'too_many') return T.ERRORS.qty_too_many(max);
  if (check.reason === 'too_small') return T.ERRORS.qty_too_small();
  return T.ERRORS.qty_not_a_number(max);
}

function dateError(check) {
  if (check.reason === 'closed_day') return T.ERRORS.date_closed_day(check.iso);
  if (check.reason === 'too_soon') return T.ERRORS.date_too_soon(check.iso, check.leadHours);
  if (check.reason === 'too_far') return T.ERRORS.date_too_far(check.maxDays);
  if (check.reason === 'in_the_past') return T.ERRORS.date_in_the_past();
  return T.ERRORS.date_unreadable();
}

/** Split a flat list of buttons into rows of `size`, so wide keyboards stay readable. */
function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function rows(list) {
  return { rows: list };
}

/** Telegram allows 64 bytes of callback_data - "step|value" stays far below that. */
function btn(step, label, value) {
  return { text: label, data: `${step}|${value}` };
}

function parseData(data) {
  const raw = String(data || '');
  const sep = raw.indexOf('|');
  if (sep < 0) return null;
  return { step: raw.slice(0, sep), value: raw.slice(sep + 1) };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export const INTERNAL = { FLOW, applicable, answered, parseData };
export { ITEMS, SLOTS, slotById };
