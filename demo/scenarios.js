// The simulated night used by the demo page and by the tests.
//
// These are not recordings and not screenshots: each line below is fed to the real
// dialog engine, and every number on the page (orders, revenue, answer time) comes
// out of running them. Cedarline Bakehouse, its customers and this night are invented.

import { createChat } from '../engine/harness.js';

/** The night the demo replays. Fixed date, so the page shows the same night every time. */
export const NIGHT_START = Date.parse('2026-09-23T22:05:00Z');

const MIN = 60 * 1000;

export const SCENARIOS = [
  {
    id: 'birthday-cake',
    at: 15 * MIN,
    customer: { firstName: 'Nadia', username: 'nadia_k' },
    title: 'Birthday cake, delivered',
    steps: [
      { start: true }, { tap: 'Place an order' }, { tap: 'Celebration cakes' },
      { tap: 'chocolate' }, { tap: '10 servings' }, { tap: '1' },
      { tapNth: { like: 'Sep', index: 0 } }, { tap: 'Afternoon' },
      { tap: 'city centre' }, { type: '12 Harbour Lane, flat 4' },
      { type: 'Happy birthday Mira - no nuts please' }, { tap: 'Use "Nadia"' },
      { type: '+1 415 555 0199' }, { tap: 'Confirm' },
    ],
  },
  {
    id: 'office-platters',
    at: 47 * MIN,
    customer: { firstName: 'Tobias', username: 'tobias_m' },
    title: 'Office breakfast for a Friday meeting',
    steps: [
      { start: true }, { tap: 'Place an order' }, { tap: 'Office platters' },
      { tap: 'Morning pastry' }, { type: '3' },
      { tapNth: { like: 'Sep', index: 0 } }, { tap: 'Morning' },
      { tap: 'outer districts' }, { type: 'Kestrel House, 88 Rowan Street, 2nd floor' },
      { type: 'Please ring reception, the office door is locked before 9' },
      { type: 'Tobias Meier' }, { type: '+49 30 0000 1188' }, { tap: 'Confirm' },
    ],
  },
  {
    id: 'too-soon',
    at: 92 * MIN,
    customer: { firstName: 'Priya', username: null },
    title: 'Wants a cake tomorrow - learns about the 48 hours, books anyway',
    steps: [
      { start: true }, { tap: 'Place an order' }, { tap: 'Celebration cakes' },
      { tap: 'Lemon' }, { tap: '6 servings' }, { tap: '1' },
      { type: 'tomorrow' },
      { tapNth: { like: 'Sep', index: 1 } }, { tap: 'Morning' },
      { tap: 'pick it up' }, { tap: 'Nothing to add' },
      { type: 'Priya' }, { type: '+44 7700 900461' }, { tap: 'Confirm' },
    ],
  },
  {
    id: 'question',
    at: 128 * MIN,
    customer: { firstName: 'Ellen', username: 'ellen_w' },
    title: 'A question only a human can answer',
    steps: [
      { start: true }, { tap: 'Talk to a human' },
      { type: 'Can you make the lemon cake without gluten for 20 people?' },
    ],
  },
  {
    id: 'out-of-zone',
    at: 171 * MIN,
    customer: { firstName: 'Marek', username: null },
    title: 'Lives too far for delivery - switches to pickup',
    steps: [
      { start: true }, { tap: 'Place an order' }, { tap: 'Bread boxes' },
      { tap: 'Sourdough' }, { type: '4' },
      { tapNth: { like: 'Sep', index: 0 } }, { tap: 'Morning' },
      { tap: 'further than 12 km' }, { tap: 'pick it up' },
      { tap: 'Nothing to add' }, { type: 'Marek Nowak' }, { type: '+48 000 000 122' }, { tap: 'Confirm' },
    ],
  },
  {
    id: 'changed-mind',
    at: 214 * MIN,
    customer: { firstName: 'Sofia', username: 'sofia_r' },
    title: 'Books, then changes the size before confirming',
    steps: [
      { start: true }, { tap: 'Place an order' }, { tap: 'Celebration cakes' },
      { tap: 'vanilla' }, { tap: '6 servings' }, { tap: '1' },
      { tapNth: { like: 'Sep', index: 1 } }, { tap: 'Afternoon' },
      { tap: 'pick it up' }, { type: 'Message on top: Congratulations Amir' },
      { type: 'Sofia Ruiz' }, { type: '+34 000 000 019' },
      { tap: 'Change something' }, { tap: 'The item' },
      { tap: 'Celebration cakes' }, { tap: 'vanilla' }, { tap: '16 servings' }, { tap: '1' },
      { tapNth: { like: 'Sep', index: 1 } }, { tap: 'Afternoon' },
      // a bigger cake means the delivery question comes back - she still wants pickup
      { tap: 'pick it up' }, { tap: 'Confirm' },
    ],
  },
  {
    id: 'typos',
    at: 259 * MIN,
    customer: { firstName: 'Junhao', username: null },
    title: 'Types instead of tapping, gets the date wrong twice',
    steps: [
      { start: true }, { tap: 'Place an order' }, { tap: 'Office platters' },
      { tap: 'Cookie box' }, { type: 'two boxes' }, { type: '2' },
      { type: 'next friday' }, { type: '28.09' }, { type: '25.09' }, { tap: 'Morning' },
      { tap: 'city centre' }, { type: '5 Alder Court' },
      { tap: 'Nothing to add' }, { type: 'Junhao' }, { type: '+65 0000 0132' }, { tap: 'Confirm' },
    ],
  },
  {
    id: 'abandoned',
    at: 296 * MIN,
    customer: { firstName: 'Aria', username: null },
    title: 'Starts an order and gives up halfway',
    steps: [
      { start: true }, { tap: 'Place an order' }, { tap: 'Celebration cakes' },
      { tap: 'chocolate' }, { tap: '16 servings' },
    ],
  },
  {
    id: 'bread-run',
    at: 331 * MIN,
    customer: { firstName: 'Olu', username: 'olu_b' },
    title: 'Bread for the morning, pickup',
    steps: [
      { start: true }, { tap: 'Place an order' }, { tap: 'Bread boxes' },
      { tap: 'rye' }, { type: '6' },
      { tapNth: { like: 'Sep', index: 0 } }, { tap: 'Morning' },
      { tap: 'pick it up' }, { tap: 'Nothing to add' },
      { type: 'Olu' }, { type: '+234 000 000 7781' }, { tap: 'Confirm' },
    ],
  },
  {
    id: 'cancelled',
    at: 372 * MIN,
    customer: { firstName: 'Dana', username: null },
    title: 'Fills everything in, then cancels',
    steps: [
      { start: true }, { tap: 'Place an order' }, { tap: 'Office platters' },
      { tap: 'Sandwich' }, { type: '1' },
      { tapNth: { like: 'Sep', index: 0 } }, { tap: 'Afternoon' },
      { tap: 'pick it up' }, { tap: 'Nothing to add' },
      { type: 'Dana' }, { type: '+1 312 555 0110' }, { tap: 'Cancel the order' },
    ],
  },
  {
    id: 'late-cake',
    at: 409 * MIN,
    customer: { firstName: 'Henrik', username: 'henrik_s' },
    title: 'Last order before opening - big cake, delivered',
    steps: [
      { start: true }, { tap: 'Place an order' }, { tap: 'Celebration cakes' },
      { tap: 'Lemon' }, { tap: '16 servings' }, { tap: '2' },
      { tapNth: { like: 'Sep', index: 2 } }, { tap: 'Afternoon' },
      { tap: 'outer districts' }, { type: 'Sailmaker Yard 3, gate code 4417' },
      { type: 'Two cakes for a wedding rehearsal - please keep them cool' },
      { type: 'Henrik Sandvik' }, { type: '+47 000 00 112' }, { tap: 'Confirm' },
    ],
  },
];

/**
 * Replays the night through the real engine.
 * Returns the chats (for the transcript on screen) and what the owner would see.
 */
export function runNight({ start = NIGHT_START, scenarios = SCENARIOS } = {}) {
  const chats = [];
  const orders = [];
  const ownerMessages = [];
  let sequence = 1;

  for (const scenario of scenarios) {
    const chat = createChat({
      now: start + scenario.at,
      firstName: scenario.customer.firstName,
      username: scenario.customer.username,
      chatId: 1000 + chats.length,
      sequence,
    });
    playScenario(chat, scenario);
    sequence = chat.sequence;
    orders.push(...chat.orders);
    ownerMessages.push(...chat.ownerMessages);
    chats.push({ scenario, chat });
  }

  return {
    start,
    end: start + scenarios[scenarios.length - 1].at + 4 * MIN,
    chats,
    orders,
    ownerMessages,
    questions: ownerMessages.filter((m) => m.kind === 'question').length,
    revenueCents: orders.reduce((sum, o) => sum + o.totals.totalCents, 0),
  };
}

/** Replays one written scenario into a chat - used by the night and by ?play= on the page. */
export function playScenario(chat, scenario, upTo) {
  const steps = typeof upTo === 'number' ? scenario.steps.slice(0, upTo) : scenario.steps;
  for (const step of steps) {
    if (step.start) chat.start();
    else if (step.type !== undefined) chat.type(step.type);
    else if (step.tap !== undefined) chat.tapLike(step.tap);
    else if (step.tapNth) tapNth(chat, step.tapNth);
  }
  return chat;
}

export function scenarioById(id) {
  return SCENARIOS.find((s) => s.id === id) || null;
}

/** "the second free day on offer" - dates move with the clock, labels do not. */
function tapNth(chat, { like, index }) {
  const keyboard = chat.keyboard();
  const matches = (keyboard ? keyboard.rows.flat() : []).filter((b) => b.text.includes(like));
  const button = matches[index];
  if (!button) throw new Error(`No button #${index} matching "${like}"`);
  return chat.tap(button.text);
}
