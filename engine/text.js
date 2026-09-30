// Every sentence the bot says. Kept apart from the logic so the owner can
// reword the shop's voice without touching the dialog, and so the tests can check
// in one place that nothing unfinished ever ships.

import { CATEGORIES, SHOP, ZONES, itemsInCategory } from './catalog.js';
import { humanDate, humanTime, money } from './format.js';
import { quote } from './pricing.js';
import { slotById } from './slots.js';

/** Telegram is sent parse_mode=HTML, so anything a customer typed is escaped first. */
export function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function partOfDay(now) {
  const hour = new Date(now).getUTCHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function greeting(now, firstName) {
  const who = firstName ? `, ${esc(firstName)}` : '';
  return [
    `${partOfDay(now)}${who}! 👋`,
    '',
    `You are chatting with <b>${SHOP.name}</b>. I take orders at any hour - the bakehouse reads them when the ovens go on.`,
    '',
    'What would you like to do?',
  ].join('\n');
}

export function menuCard() {
  const blocks = CATEGORIES.map((category) => {
    const lines = itemsInCategory(category.id).map((item) => {
      if (item.variants) {
        const range = item.variants.map((v) => `${v.title} ${money(v.priceCents)}`).join(' · ');
        return `• <b>${item.title}</b>\n   ${item.description}\n   ${range}`;
      }
      return `• <b>${item.title}</b> - ${money(item.priceCents)}\n   ${item.description}`;
    });
    return `<b>${category.title.toUpperCase()}</b> (${category.note})\n${lines.join('\n')}`;
  });
  return `${blocks.join('\n\n')}\n\nPrices include tax. Delivery is added at the end.`;
}

export function hoursCard() {
  // Built from ZONES so the card can never drift away from what the bot charges.
  const zones = ZONES.map((z) => {
    if (z.unserved) return `• ${z.cardTitle} - we cannot deliver that far, but pickup is always open`;
    if (z.pickup) return `• ${z.cardTitle} - free, ${SHOP.pickup.from}-${SHOP.pickup.to}`;
    return `• ${z.cardTitle} - ${money(z.feeCents)}`;
  }).join('\n');
  return [
    '<b>Pickup, delivery and hours</b>',
    '',
    `Open Tuesday to Sunday, ${SHOP.pickup.from}-${SHOP.pickup.to} (${SHOP.timezoneLabel}). Closed on Mondays.`,
    '',
    zones,
    '',
    `Delivery needs a basket of at least ${money(SHOP.deliveryMinimumCents)}.`,
    '',
    '<b>How much notice we need</b>',
    ...CATEGORIES.map((c) => `• ${c.title} - ${c.leadHours} hours`),
  ].join('\n');
}

export const ASK_QUESTION = [
  'Of course. Type your question here and I will pass it to the bakehouse.',
  '',
  `Someone answers in person from ${SHOP.pickup.from} (${SHOP.timezoneLabel}). If it cannot wait, write to ${SHOP.humanHandoff} directly.`,
].join('\n');

export function anythingElse() {
  return 'Anything else I can do for you?';
}

export function questionSent() {
  return `Passed on. ✅ The bakehouse will reply in this chat from ${SHOP.pickup.from} (${SHOP.timezoneLabel}). Anything else I can do right now?`;
}

/** A free-typed message outside an order is a message for a person, not an error. */
export function messageForwarded() {
  return `Got it - I have passed that to the bakehouse, and someone will reply here from ${SHOP.pickup.from} (${SHOP.timezoneLabel}).`;
}

export function askForWords() {
  return 'Write your question as a message and I will pass it on - or tap Back to return to the menu.';
}

export function cannotSeeAttachments() {
  return 'I cannot open pictures, voice notes or files - please describe it in words and I will pass it on.';
}

export const CANCELLED = 'No problem - I have dropped that order. Nothing was sent to the bakehouse. Start again whenever you like.';

export const NOTHING_TO_CANCEL = 'There is no order in progress. Tap "Place an order" whenever you are ready.';

export function stale() {
  return 'That button belongs to an earlier step - here is where we are now.';
}

export function unexpectedText() {
  return 'I did not catch that. Please use the buttons below, or type /cancel to start over.';
}

export function summary(session) {
  const d = session.draft;
  const q = quote(d);
  const lines = [
    '<b>Here is your order</b>',
    '',
    `🧁 ${esc(q.itemLabel)} × ${q.qty} - ${money(q.subtotalCents)}`,
    `📅 ${humanDate(d.dateIso)}, ${slotById(d.slotId).title}`,
  ];
  if (d.address) lines.push(`🚚 Delivery to ${esc(d.address)} - ${money(q.deliveryCents)}`);
  else lines.push('🏠 Pickup at the bakehouse - free');
  if (d.notes) lines.push(`📝 ${esc(d.notes)}`);
  lines.push(`👤 ${esc(d.name)}, ${esc(d.phone)}`);
  lines.push('', `<b>Total: ${money(q.totalCents)}</b>`, 'Payment on pickup or on delivery - card or cash.');
  return lines.join('\n');
}

export function confirmed(order) {
  return [
    `Booked! ✅ Your order number is <b>${order.number}</b>.`,
    '',
    `${esc(order.item.label)} × ${order.item.qty}, ready ${order.handover.dateLabel}, ${esc(order.handover.slotLabel)}.`,
    order.handover.method === 'delivery'
      ? `We deliver to ${esc(order.handover.address)}.`
      : `Pickup at the bakehouse, ${SHOP.pickup.from}-${SHOP.pickup.to}.`,
    `Total ${money(order.totals.totalCents)}.`,
    '',
    `The bakehouse sees this order right away and will confirm in this chat from ${SHOP.pickup.from}. Need to change something? Write here, quote ${order.number}, and a person will pick it up.`,
  ].join('\n');
}

/** What lands on the owner's phone the moment an order is finished. */
export function ownerAlert(order) {
  const lines = [
    `🧾 <b>New order ${order.number}</b> (${order.receivedAtLabel})`,
    `${esc(order.item.label)} × ${order.item.qty}`,
    `${order.handover.dateLabel}, ${esc(order.handover.slotLabel)}`,
    order.handover.method === 'delivery'
      ? `Deliver: ${esc(order.handover.address)} (${esc(order.handover.zoneTitle)})`
      : 'Pickup',
  ];
  if (order.notes) lines.push(`Note: ${esc(order.notes)}`);
  lines.push(`${esc(order.customer.name)}, ${esc(order.customer.phone)}${order.telegramUser ? ` (${esc(order.telegramUser)})` : ''}`);
  lines.push(`<b>${money(order.totals.totalCents)}</b>`);
  return lines.join('\n');
}

export function ownerQuestion(chat, question) {
  return [
    `💬 <b>Question from ${esc(chat.name || 'a customer')}</b>${chat.username ? ` (@${esc(chat.username)})` : ''}`,
    esc(question),
    '',
    'Reply in the bot chat - the customer sees it there.',
  ].join('\n');
}

/** The one message the owner reads with the first coffee. */
export function nightSummary(orders, questions, fromTs, toTs) {
  if (orders.length === 0 && questions === 0) {
    return `☀️ <b>Night summary</b> (${humanTime(fromTs)}-${humanTime(toTs)})\n\nNo orders came in tonight.`;
  }
  const total = orders.reduce((sum, o) => sum + o.totals.totalCents, 0);
  const lines = [
    `☀️ <b>Night summary</b> (${humanTime(fromTs)}-${humanTime(toTs)})`,
    '',
    `<b>${orders.length} order${orders.length === 1 ? '' : 's'} · ${money(total)}</b>`,
    '',
  ];
  for (const o of orders) {
    lines.push(`• ${o.number} - ${esc(o.item.label)} × ${o.item.qty}, ${o.handover.dateLabel} ${o.handover.method === 'delivery' ? '🚚' : '🏠'} - ${money(o.totals.totalCents)}`);
  }
  if (questions > 0) {
    lines.push('', `${questions} question${questions === 1 ? '' : 's'} waiting for a personal answer.`);
  }
  return lines.join('\n');
}

export const ERRORS = {
  qty_not_a_number: (max) => `Please send a plain number, from 1 to ${max}.`,
  qty_too_small: () => 'At least one, please.',
  qty_too_many: (max) => `We can bake up to ${max} of these in one order. For a bigger run, send /start and choose "Talk to a human" - the bakehouse arranges those personally.`,
  name_too_short: () => 'I need a name for the order - at least two characters.',
  name_too_long: () => 'That name is too long for the label. Up to 60 characters, please.',
  name_no_letters: () => 'That does not look like a name. Letters, please.',
  phone_has_letters: () => 'Numbers only, please - "+", spaces and dashes are fine. For example: +1 415 555 0199.',
  phone_too_short: () => 'That number looks too short. Please include the area code.',
  phone_too_long: () => 'That number looks too long. Please check it.',
  address_too_short: () => 'Please send the full address - street, house number and flat if any.',
  address_too_long: () => 'That address is too long for the driver. Up to 140 characters, please.',
  address_no_number: () => 'The address needs a house or building number.',
  note_too_long: () => 'Please keep the note under 120 characters.',
  date_unreadable: () => 'I could not read that date. Try day first - 25.09, 25 Sep or 2026-09-25 - or use the buttons.',
  date_in_the_past: () => 'That day has passed. Which day ahead works for you?',
  date_too_far: (days) => `We take orders up to ${days} days ahead.`,
  date_closed_day: (iso) => `${humanDate(iso)} is a Monday - the bakehouse is closed. Pick another day.`,
  date_too_soon: (iso, hours) => `${humanDate(iso)} is too soon: this one needs ${hours} hours in the oven and on the bench. Pick a later day, or use the buttons below.`,
  slot_gone: (iso) => `Nothing is left on ${humanDate(iso)} for this item. Please pick another day.`,
  delivery_minimum: (min) => `Delivery starts at ${money(min)} per order. This one is under that, so pickup it is - or go back and add a little more.`,
  zone_unserved: () => 'We do not deliver further than 12 km - the cakes do not travel well. Pickup is free, and the bakehouse is open until 18:00.',
};

