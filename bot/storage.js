// Orders, chat sessions and seen update ids on disk.
//
// Two methods is all the dialog needs, so swapping this file for the shop's CRM,
// a Google Sheet or a Postgres table is an afternoon of work - see README, "Where orders go".
// Writes go to a temporary file first and are renamed into place, so a power cut
// cannot leave half a JSON file behind.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const EMPTY = { orders: [], sessions: {}, seenUpdateIds: [], questions: [], lastSummaryDate: null, lastSummaryAt: null };
const SEEN_LIMIT = 500;

export function createStorage(file) {
  mkdirSync(dirname(file), { recursive: true });
  let state = load(file);

  function persist() {
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2));
    renameSync(tmp, file);
  }

  return {
    /** Telegram re-sends an update if our answer is lost. Never serve the same one twice. */
    isDuplicate(updateId) {
      return state.seenUpdateIds.includes(updateId);
    },
    rememberUpdate(updateId) {
      state.seenUpdateIds.push(updateId);
      if (state.seenUpdateIds.length > SEEN_LIMIT) state.seenUpdateIds = state.seenUpdateIds.slice(-SEEN_LIMIT);
      persist();
    },
    getSession(chatId) {
      return state.sessions[String(chatId)] || null;
    },
    saveSession(chatId, session) {
      state.sessions[String(chatId)] = session;
      persist();
    },
    addOrder(order) {
      state.orders.push(order);
      persist();
      return order;
    },
    nextSequence() {
      return state.orders.length + 1;
    },
    ordersSince(ts) {
      return state.orders.filter((o) => Date.parse(o.placedAt) >= ts);
    },
    /** Questions are kept as timestamps only - the text is already on the owner's phone. */
    addQuestion(at) {
      state.questions.push(at);
      if (state.questions.length > SEEN_LIMIT) state.questions = state.questions.slice(-SEEN_LIMIT);
      persist();
    },
    questionsSince(ts) {
      return state.questions.filter((at) => at >= ts).length;
    },
    allOrders() {
      return state.orders.slice();
    },
    lastSummaryDate() {
      return state.lastSummaryDate;
    },
    setLastSummaryDate(iso, at) {
      state.lastSummaryDate = iso;
      state.lastSummaryAt = at ?? Date.now();
      persist();
    },
    /** Where the last summary ended - the next one starts there. */
    lastSummaryAt() {
      return state.lastSummaryAt;
    },
  };
}

function load(file) {
  if (!existsSync(file)) return structuredClone(EMPTY);
  try {
    return { ...structuredClone(EMPTY), ...JSON.parse(readFileSync(file, 'utf8')) };
  } catch {
    // A corrupted file is kept for inspection rather than silently overwritten.
    renameSync(file, `${file}.broken-${Date.now()}`);
    return structuredClone(EMPTY);
  }
}
