// The live bot: long polling, one dialog per chat, orders on disk,
// the owner pinged on every order and a summary when the ovens go on.
//
//   cp .env.example .env   # put the token from @BotFather in it
//   npm start
//
// Stop with Ctrl+C - the current update is finished first.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { handle, newSession } from '../engine/dialog.js';
import { isoDate } from '../engine/format.js';
import { nightSummary } from '../engine/text.js';
import { createApi } from './api.js';
import { createLogger } from './logger.js';
import { createStorage } from './storage.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

export function loadEnv(file = resolve(ROOT, '.env')) {
  const env = { ...process.env };
  try {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const value = match[2].replace(/^['"]|['"]$/g, '');
      if (value) env[match[1]] = value;
    }
  } catch { /* no .env file: fall back to real environment variables */ }
  return env;
}

export async function main() {
  const env = loadEnv();
  const log = createLogger({ file: resolve(ROOT, 'bot/logs/bot.log') });
  const storage = createStorage(env.ORDERS_FILE ? resolve(ROOT, env.ORDERS_FILE) : resolve(ROOT, 'storage/orders.json'));
  const api = createApi({ token: env.TELEGRAM_TOKEN, log });

  const ownerChatId = env.OWNER_CHAT_ID || null;
  const summaryHour = Number(env.SUMMARY_HOUR ?? 7);
  if (!ownerChatId) log.warn('owner_chat_missing', { hint: 'Set OWNER_CHAT_ID in .env or the shop will not be notified.' });

  const me = await api.getMe();
  log.info('started', { bot: me.username, ownerNotifications: Boolean(ownerChatId) });

  let offset = 0;
  let running = true;
  process.on('SIGINT', () => { running = false; log.info('stopping', {}); });

  while (running) {
    let updates = [];
    try {
      updates = await api.getUpdates(offset, 30);
    } catch (error) {
      if (error.fatal) { log.error('fatal', { error: error.message }); break; }
      log.error('poll_failed', { error: error.message });
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }

    for (const update of updates) {
      offset = update.update_id + 1;
      if (storage.isDuplicate(update.update_id)) { log.warn('duplicate_update', { updateId: update.update_id }); continue; }
      storage.rememberUpdate(update.update_id);
      try {
        await processUpdate({ update, api, storage, log, ownerChatId });
      } catch (error) {
        log.error('update_failed', { updateId: update.update_id, error: error.message });
      }
    }

    await maybeSendSummary({ api, storage, log, ownerChatId, summaryHour });
  }
}

/** Turn one Telegram update into engine events and carry out what the engine asks for. */
export async function processUpdate({ update, api, storage, log, ownerChatId }) {
  const source = update.message || update.callback_query;
  if (!source) return;

  // Telegram omits `message` on callbacks from chats older than 48 hours. Answering the
  // callback stops the button spinning; without a chat id there is nowhere to reply.
  const chat = update.message ? update.message.chat : (update.callback_query.message || {}).chat;
  if (!chat) {
    log.warn('callback_without_message', { updateId: update.update_id });
    await api.answerCallbackQuery(update.callback_query.id, 'This chat is too old for that button - send /start to begin again.');
    return;
  }
  const from = source.from || {};
  const chatId = chat.id;

  const event = toEvent(update);
  if (!event) return;

  const session = storage.getSession(chatId) || newSession();
  const ctx = {
    now: Date.now(),
    chatId,
    firstName: from.first_name || null,
    username: from.username || null,
    sequence: storage.nextSequence(),
  };

  const { session: nextSession, actions } = handle(session, event, ctx);
  storage.saveSession(chatId, nextSession);

  for (const action of actions) {
    if (action.type === 'ack' && update.callback_query) {
      await api.answerCallbackQuery(update.callback_query.id, action.text);
    } else if (action.type === 'send') {
      await api.sendMessage(chatId, action.text, action.keyboard);
    } else if (action.type === 'save_order') {
      storage.addOrder(action.order);
      log.info('order_placed', { number: action.order.number, totalCents: action.order.totals.totalCents, chatId });
    } else if (action.type === 'owner') {
      if (action.kind === 'question') storage.addQuestion(ctx.now);
      if (ownerChatId) await api.sendMessage(ownerChatId, action.text);
      else log.warn('owner_message_dropped', { kind: action.kind });
    }
  }
}

export function toEvent(update) {
  if (update.callback_query) return { type: 'callback', data: update.callback_query.data };
  const message = update.message;
  if (!message) return null;
  if (typeof message.text !== 'string') {
    // Photos, voice notes, stickers and files: the dialog says so plainly rather than
    // treating the message as an empty answer to whatever it just asked.
    return { type: 'unsupported' };
  }
  const command = message.text.match(/^\/([a-z_]+)/i);
  if (command) return { type: 'command', name: command[1].toLowerCase() };
  return { type: 'text', text: message.text };
}

/**
 * One summary a day, at the hour the bakehouse opens.
 * Hours are read in UTC, the same clock the engine treats as shop time, so the summary
 * lands at the same moment whatever timezone the server happens to be set to.
 */
export async function maybeSendSummary({ api, storage, log, ownerChatId, summaryHour, now = Date.now() }) {
  if (!ownerChatId) return false;
  const today = isoDate(now);
  if (storage.lastSummaryDate() === today) return false;
  if (new Date(now).getUTCHours() < summaryHour) return false;

  // Everything since the previous summary, falling back to the last 12 hours on the first run.
  const since = storage.lastSummaryAt() || now - 12 * 60 * 60 * 1000;
  const orders = storage.ordersSince(since);
  const questions = storage.questionsSince(since);
  await api.sendMessage(ownerChatId, nightSummary(orders, questions, since, now));
  storage.setLastSummaryDate(today, now);
  log.info('summary_sent', { orders: orders.length, questions });
  return true;
}

if (process.argv[1] && process.argv[1].endsWith('run.js')) {
  main().catch((error) => {
    console.error(JSON.stringify({ at: new Date().toISOString(), level: 'error', event: 'crashed', error: error.message }));
    process.exit(1);
  });
}
