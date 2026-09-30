// WhatsApp channel: the same engine through a fake WhatsApp Cloud API. No network, no Meta account.
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createStorage } from '../bot/storage.js';
import { toEvent, toWhatsApp, toWhatsAppText } from '../whatsapp/convert.js';
import { createApp, createWhatsAppApi, validSignature } from '../whatsapp/server.js';

const SIGNING_KEY = randomBytes(16).toString('hex');   // made up per run, never a real key
const VERIFY = randomBytes(8).toString('hex');
const ENV = { WA_VERIFY_TOKEN: VERIFY, WA_APP_SECRET: SIGNING_KEY, WA_OWNER: '447700900999' };
const quietLog = { info() {}, warn() {}, error() {} };

async function start() {
  const sent = [];
  const api = { post: async (to, payload) => { sent.push({ to, ...payload }); return true; } };
  const storage = createStorage(join(mkdtempSync(join(tmpdir(), 'wa-')), 'orders.json'));
  const server = createApp({ env: ENV, api, storage, log: quietLog }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/webhook`;
  let n = 0;
  async function deliver(message, { key = SIGNING_KEY } = {}) {
    const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: {
      contacts: [{ profile: { name: 'Nora Webb' }, wa_id: '447700900111' }],
      messages: [{ from: '447700900111', id: message.id || `wamid.${++n}`, timestamp: '1', ...message }] } }] }] });
    const sig = 'sha256=' + createHmac('sha256', key).update(body).digest('hex');
    const res = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': sig }, body });
    await new Promise((r) => setTimeout(r, 30));          // the dialog runs right after the 200 answer
    return res.status;
  }
  return { sent, storage, server, base, deliver };
}

function checkLimits(p) {
  if (p.type === 'text') { assert.ok(p.text.body.length <= 4096); return; }
  const i = p.interactive;
  assert.ok(i.body.text.length <= 1024, 'body ≤ 1024');
  if (i.type === 'button') {
    assert.ok(i.action.buttons.length <= 3, 'reply buttons ≤ 3');
    for (const b of i.action.buttons) assert.ok(b.reply.title.length <= 20 && b.reply.id.length <= 256, `button «${b.reply.title}»`);
  } else {
    const rows = i.action.sections.flatMap((s) => s.rows);
    assert.ok(rows.length <= 10, 'list rows ≤ 10');
    for (const r of rows) assert.ok(r.title.length <= 24 && (r.description || '').length <= 72, `row «${r.title}»`);
  }
}

const choices = (p) => (p.type !== 'interactive' ? [] : p.interactive.type === 'button'
  ? p.interactive.action.buttons.map((b) => ({ id: b.reply.id, title: b.reply.title, kind: 'button_reply' }))
  : p.interactive.action.sections.flatMap((s) => s.rows).map((r) => ({ id: r.id, title: r.title, kind: 'list_reply' })));

test('webhook verification: right token → challenge, wrong → 403', async () => {
  const { base, server } = await start();
  const ok = await fetch(`${base}?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=12345`);
  assert.equal(ok.status, 200); assert.equal(await ok.text(), '12345');
  assert.equal((await fetch(`${base}?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1`)).status, 403);
  server.close();
});

test('a whole order over WhatsApp: buttons and lists within Meta limits, order saved, owner told', async () => {
  const { sent, storage, server, deliver } = await start();
  await deliver({ type: 'text', text: { body: 'hi' } });
  const prefer = [/order/i, /bread/i, /box|loaf|sourdough/i, /^1$|^2$/, /pickup/i, /nothing/i, /nora/i, /confirm|place|yes/i];
  const texts = { address: '12 Mill Lane', phone: '+44 7700 900111', name: 'Nora Webb' };
  for (let step = 0; step < 30 && storage.ordersSince(0).length === 0; step++) {
    const customer = sent.filter((m) => m.to === '447700900111');
    const last = customer[customer.length - 1];
    customer.forEach(checkLimits);
    const opts = choices(last).filter((o) => !/back|human|menu & prices|hours/i.test(o.title));
    const body = last.type === 'text' ? last.text.body : last.interactive.body.text;
    if (/phone/i.test(body) && !opts.length) { await deliver({ type: 'text', text: { body: texts.phone } }); continue; }
    if (/name/i.test(body) && !opts.length) { await deliver({ type: 'text', text: { body: texts.name } }); continue; }
    if (/address/i.test(body) && !opts.length) { await deliver({ type: 'text', text: { body: texts.address } }); continue; }
    if (!opts.length) { await deliver({ type: 'text', text: { body: '2' } }); continue; }
    const pick = prefer.map((re) => opts.find((o) => re.test(o.title))).find(Boolean) || opts[0];
    await deliver({ type: 'interactive', interactive: { type: pick.kind, [pick.kind]: { id: pick.id, title: pick.title } } });
  }
  const orders = storage.ordersSince(0);
  assert.equal(orders.length, 1, 'one order placed through WhatsApp');
  assert.ok(sent.some((m) => m.to === '447700900999' && /CED-/.test(m.text?.body || '')), 'the owner got the order');
  assert.ok(sent.some((m) => m.type === 'interactive' && m.interactive.type === 'list'), 'long menus became WhatsApp lists');
  assert.ok(sent.some((m) => m.type === 'interactive' && m.interactive.type === 'button'), 'short choices became reply buttons');
  assert.ok(!sent.some((m) => /<\/?b>/.test(JSON.stringify(m))), 'no Telegram HTML leaks into WhatsApp');
  server.close();
});

test('bad signature is refused; a repeated message id is ignored; a photo gets a plain answer', async () => {
  const { sent, server, deliver } = await start();
  assert.equal(await deliver({ type: 'text', text: { body: 'hi' } }, { key: 'not-the-key' }), 401);
  assert.equal(sent.length, 0);
  await deliver({ id: 'wamid.same', type: 'text', text: { body: 'hi' } });
  const after = sent.length;
  await deliver({ id: 'wamid.same', type: 'text', text: { body: 'hi' } });
  assert.equal(sent.length, after, 'Meta re-sent the same message: answered once');
  await deliver({ type: 'image', image: { id: 'm1' } });
  assert.match(JSON.stringify(sent.slice(after)), /photo|picture|image|attachment|can.?t see/i);
  server.close();
});

test('convert: HTML → WhatsApp, >10 options → numbered menu, typed number → button', () => {
  assert.equal(toWhatsAppText('<b>Total</b> &amp; <i>fee</i> &lt;3'), '*Total* & _fee_ <3');
  const many = { text: 'Pick', keyboard: { rows: [Array.from({ length: 12 }, (_, i) => ({ text: `Option ${i + 1}`, data: `s|${i + 1}` }))] } };
  const { payloads, options } = toWhatsApp(many);
  assert.equal(payloads[0].type, 'text'); assert.match(payloads[0].text.body, /12\. Option 12/);
  assert.deepEqual(toEvent({ type: 'text', text: { body: '12' } }, options), { type: 'callback', data: 's|12' });
  assert.deepEqual(toEvent({ type: 'text', text: { body: '12 Mill Lane' } }, options), { type: 'text', text: '12 Mill Lane' });
  const long = toWhatsApp({ text: 'x', keyboard: { rows: [[{ text: 'A very long button title here', data: 'a' }, { text: 'B', data: 'b' }]] } });
  assert.equal(long.payloads[0].interactive.type, 'list', 'a title over 20 chars cannot be a reply button → list');
  assert.equal(validSignature(Buffer.from('x'), 'sha256=00', 's'), false);
  assert.deepEqual(toEvent({ type: 'text', text: { body: 'Hi!' } }, null), { type: 'command', name: 'start' }, 'a greeting opens the menu');
  assert.deepEqual(toEvent({ type: 'text', text: { body: 'Здравствуйте' } }, null), { type: 'command', name: 'start' });
  assert.equal(toEvent({ type: 'text', text: { body: 'Hi, do you have gluten-free bread?' } }, null).type, 'text', 'a real question still goes to a human');
  const row = toWhatsApp({ text: 'x', keyboard: { rows: [[1, 2, 3, 4].map((i) => ({ text: `Bread boxes - next-morning bread, 12 hours notice ${i}`, data: `c|${i}` }))] } });
  assert.deepEqual(row.payloads[0].interactive.action.sections[0].rows[0], { id: 'c|1', title: 'Bread boxes', description: 'next-morning bread, 12 hours notice 1' });
});

test('API layer: retries 500 and 429, stops on 400, adds messaging_product', async () => {
  const calls = [];
  const codes = [500, 429, 200, 400];
  const fetchFn = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); const s = codes.shift(); return { ok: s === 200, status: s, text: async () => '{}' }; };
  const api = createWhatsAppApi({ token: 't', phoneNumberId: '123', log: quietLog, base: 'http://graph', fetchFn });
  const t0 = Date.now();
  assert.equal(await api.post('447700900111', { type: 'text', text: { body: 'hi' } }), true);
  assert.equal(calls.length, 3); assert.ok(Date.now() - t0 >= 2900, 'waited 1 s + 2 s between tries');
  assert.equal(calls[0].url, 'http://graph/123/messages'); assert.equal(calls[0].body.messaging_product, 'whatsapp');
  assert.equal(await api.post('447700900111', { type: 'text', text: { body: 'x' } }), false);
  assert.equal(calls.length, 4, 'a 400 is not retried');
});
