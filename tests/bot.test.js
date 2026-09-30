// The transport layer: retries, storage and turning Telegram updates into engine events.
// No network is touched - fetch is replaced by a stub that fails on purpose.

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { createApi, toReplyMarkup } from '../bot/api.js';
import { createStorage } from '../bot/storage.js';
import { maybeSendSummary, processUpdate, toEvent } from '../bot/run.js';

const silentLog = { info() {}, warn() {}, error() {} };

function tempFile(name = 'orders.json') {
  return join(mkdtempSync(join(tmpdir(), 'cedarline-')), name);
}

test('a rate-limited call is retried after the pause Telegram asks for', async () => {
  const calls = [];
  const slept = [];
  const fetchImpl = async () => {
    calls.push(1);
    if (calls.length === 1) {
      return { ok: false, status: 429, json: async () => ({ ok: false, description: 'Too Many Requests', parameters: { retry_after: 3 } }) };
    }
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 5 } }) };
  };
  const api = createApi({ token: 'x', log: silentLog, fetchImpl, sleep: async (ms) => { slept.push(ms); } });
  const result = await api.sendMessage(1, 'hi');
  assert.equal(result.message_id, 5);
  assert.equal(calls.length, 2);
  assert.deepEqual(slept, [3000], 'waits exactly as long as Telegram asked');
});

test('a dropped connection is retried with growing pauses and then gives up loudly', async () => {
  const slept = [];
  const fetchImpl = async () => { throw new Error('socket hang up'); };
  const api = createApi({ token: 'x', log: silentLog, fetchImpl, sleep: async (ms) => { slept.push(ms); }, maxAttempts: 3 });
  await assert.rejects(() => api.sendMessage(1, 'hi'), /socket hang up .*gave up after 3 attempts/);
  assert.deepEqual(slept, [1000, 2000]);
});

test('a wrong token stops the bot instead of retrying forever', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({ ok: false, description: 'Unauthorized' }) });
  const api = createApi({ token: 'bad', log: silentLog, fetchImpl, sleep: async () => {} });
  await assert.rejects(() => api.getMe(), (error) => error.fatal === true && /Unauthorized/.test(error.message));
});

test('the engine keyboard becomes a Telegram inline keyboard', () => {
  const markup = toReplyMarkup({ rows: [[{ text: 'A', data: 'idle|order' }], [{ text: 'B', data: 'idle|menu' }]] });
  assert.deepEqual(markup, { inline_keyboard: [[{ text: 'A', callback_data: 'idle|order' }], [{ text: 'B', callback_data: 'idle|menu' }]] });
});

test('updates become the right engine events', () => {
  assert.deepEqual(toEvent({ message: { text: '/start' } }), { type: 'command', name: 'start' });
  assert.deepEqual(toEvent({ message: { text: '/Cancel' } }), { type: 'command', name: 'cancel' });
  assert.deepEqual(toEvent({ message: { text: '25.09' } }), { type: 'text', text: '25.09' });
  assert.deepEqual(toEvent({ callback_query: { data: 'zone|pickup' } }), { type: 'callback', data: 'zone|pickup' });
  assert.deepEqual(toEvent({ message: { photo: [{}] } }), { type: 'unsupported' }, 'a photo gets an honest answer');
  assert.deepEqual(toEvent({ message: { voice: {} } }), { type: 'unsupported' });
  assert.equal(toEvent({ edited_message: { text: 'hi' } }), null);
});

test('storage survives a corrupted file and never serves the same update twice', () => {
  const file = tempFile();
  writeFileSync(file, '{ this is not json');
  const storage = createStorage(file);
  assert.deepEqual(storage.allOrders(), [], 'a broken file is set aside, not obeyed');

  assert.equal(storage.isDuplicate(11), false);
  storage.rememberUpdate(11);
  assert.equal(storage.isDuplicate(11), true);

  storage.addOrder({ number: 'CED-2309-001', placedAt: new Date().toISOString(), totals: { totalCents: 100 } });
  assert.equal(storage.nextSequence(), 2);

  const reopened = createStorage(file);
  assert.equal(reopened.allOrders().length, 1, 'orders are on disk, not only in memory');
  assert.equal(reopened.isDuplicate(11), true);
});

test('a repeated update is ignored, so a lost answer cannot double an order', async () => {
  const file = tempFile();
  const storage = createStorage(file);
  const sent = [];
  const api = { sendMessage: async (chatId, text) => { sent.push({ chatId, text }); }, answerCallbackQuery: async () => {} };
  const update = { update_id: 7, message: { text: '/start', chat: { id: 55 }, from: { first_name: 'Nadia' } } };

  storage.rememberUpdate(update.update_id);
  assert.equal(storage.isDuplicate(7), true);
  await processUpdate({ update, api, storage, log: silentLog, ownerChatId: null });
  assert.equal(sent.length, 1, 'processUpdate itself still answers - the loop is what skips duplicates');
});

test('an order placed over Telegram is stored and the owner is messaged', async () => {
  const storage = createStorage(tempFile());
  const sent = [];
  const answered = [];
  const api = {
    sendMessage: async (chatId, text) => { sent.push({ chatId, text }); },
    answerCallbackQuery: async (id) => { answered.push(id); },
  };
  const chatId = 99;
  const owner = 4242;

  const say = (text) => processUpdate({
    update: { update_id: Math.random(), message: { text, chat: { id: chatId }, from: { first_name: 'Nadia', username: 'nadia_k' } } },
    api, storage, log: silentLog, ownerChatId: owner,
  });
  const press = (label) => {
    const last = sent.at(-1);
    const keyboard = lastKeyboard(storage, chatId);
    const button = keyboard.rows.flat().find((b) => b.text.toLowerCase().includes(label.toLowerCase()));
    assert.ok(button, `no button like "${label}" after: ${last && last.text.slice(0, 60)}`);
    return processUpdate({
      update: { update_id: Math.random(), callback_query: { id: 'cb', data: button.data, message: { chat: { id: chatId } }, from: { first_name: 'Nadia' } } },
      api, storage, log: silentLog, ownerChatId: owner,
    });
  };

  await say('/start');
  await press('Place an order');
  await press('Bread boxes');
  await press('Sourdough');
  await press('3');
  // The last offered day: today's morning slot may already be gone, depending on when the test runs.
  const dateButton = lastKeyboard(storage, chatId).rows.flat().filter((b) => b.data.startsWith('date|2')).at(-1);
  await processUpdate({
    update: { update_id: Math.random(), callback_query: { id: 'cb', data: dateButton.data, message: { chat: { id: chatId } }, from: { first_name: 'Nadia' } } },
    api, storage, log: silentLog, ownerChatId: owner,
  });
  await press('Morning');
  await press('pick it up');
  await press('Nothing to add');
  await say('Nadia');
  await say('+1 415 555 0199');
  await press('Confirm');

  assert.equal(storage.allOrders().length, 1);
  const order = storage.allOrders()[0];
  assert.equal(order.totals.totalCents, 4200);
  assert.ok(answered.length > 0, 'callback queries must be answered or the button spins forever');
  const toOwner = sent.filter((m) => m.chatId === owner);
  assert.equal(toOwner.length, 1);
  assert.match(toOwner[0].text, /New order/);
});

test('the morning summary is sent once a day, not on every poll', async () => {
  const storage = createStorage(tempFile());
  const sent = [];
  const api = { sendMessage: async (chatId, text) => { sent.push(text); } };
  const morning = new Date('2026-09-23T09:00:00Z');
  storage.addOrder({ number: 'CED-2309-001', placedAt: new Date(morning.getTime() - 3600000).toISOString(), item: { label: 'Sourdough duo', qty: 1 }, handover: { dateLabel: 'Fri 25 Sep', method: 'pickup' }, totals: { totalCents: 1400 } });

  const options = { api, storage, log: silentLog, ownerChatId: 4242, summaryHour: 7, now: morning.getTime() };
  assert.equal(await maybeSendSummary(options), true);
  assert.equal(await maybeSendSummary(options), false, 'second poll the same day sends nothing');
  assert.equal(sent.length, 1);
  assert.match(sent[0], /Night summary/);
  assert.match(sent[0], /Sourdough duo/);

  const night = new Date('2026-09-24T02:00:00Z').getTime();
  assert.equal(await maybeSendSummary({ ...options, now: night }), false, 'nothing before the summary hour');
});

test('no owner chat configured: the bot keeps working instead of crashing', async () => {
  const storage = createStorage(tempFile());
  const sent = [];
  const api = { sendMessage: async (chatId, text) => { sent.push(text); }, answerCallbackQuery: async () => {} };
  await processUpdate({
    update: { update_id: 1, message: { text: '/start', chat: { id: 5 }, from: { first_name: 'Nadia' } } },
    api, storage, log: silentLog, ownerChatId: null,
  });
  assert.equal(sent.length, 1);
  assert.equal(await maybeSendSummary({ api, storage, log: silentLog, ownerChatId: null, summaryHour: 0 }), false);
});

/** The keyboard the bot last showed this chat, read back from the saved session. */
function lastKeyboard(storage, chatId) {
  const session = storage.getSession(chatId);
  const { prompt } = promptModule;
  return prompt(session, { now: Date.now(), firstName: 'Nadia', chatId, sequence: storage.nextSequence() }).keyboard;
}

const promptModule = await import('../engine/dialog.js');

test('a button pressed in a chat Telegram no longer describes does not leave it spinning', async () => {
  const storage = createStorage(tempFile());
  const answered = [];
  const api = { sendMessage: async () => {}, answerCallbackQuery: async (id, text) => { answered.push(text); } };
  await processUpdate({
    update: { update_id: 3, callback_query: { id: 'cb', data: 'idle|order' } },
    api, storage, log: silentLog, ownerChatId: null,
  });
  assert.equal(answered.length, 1);
  assert.match(answered[0], /too old/);
});

test('questions are counted into the next summary', async () => {
  const storage = createStorage(tempFile());
  const sent = [];
  const api = { sendMessage: async (chatId, text) => { sent.push(text); }, answerCallbackQuery: async () => {} };
  const owner = 4242;
  const send = (text) => processUpdate({
    update: { update_id: Math.random(), message: { text, chat: { id: 8 }, from: { first_name: 'Ellen' } } },
    api, storage, log: silentLog, ownerChatId: owner,
  });

  await send('/start');
  await send('Do you make gluten free cakes?');
  assert.equal(storage.questionsSince(0), 1);

  await maybeSendSummary({ api, storage, log: silentLog, ownerChatId: owner, summaryHour: 0, now: Date.now() });
  assert.match(sent.at(-1), /1 question waiting/);
});
