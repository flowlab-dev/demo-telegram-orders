// WhatsApp channel for the same order engine (WhatsApp Cloud API by Meta).
//   GET  /webhook  - Meta's one-time verification (hub.verify_token must match WA_VERIFY_TOKEN)
//   POST /webhook  - incoming messages; the X-Hub-Signature-256 header is checked with WA_APP_SECRET
// Settings (.env, never in code): WA_TOKEN, WA_PHONE_NUMBER_ID, WA_VERIFY_TOKEN, WA_APP_SECRET, WA_OWNER (optional), PORT.
// Zero packages: Node's http, crypto and fetch.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { handle, newSession } from '../engine/dialog.js';
import { createLogger } from '../bot/logger.js';
import { createStorage } from '../bot/storage.js';
import { loadEnv } from '../bot/run.js';
import { toEvent, toWhatsApp, toWhatsAppText } from './convert.js';

export function createWhatsAppApi({ token, phoneNumberId, log, base = 'https://graph.facebook.com/v21.0', fetchFn = fetch }) {
  async function post(to, payload) {
    let wait = 1000;
    for (let attempt = 1; attempt <= 3; attempt++) {
      let res;
      try {
        res = await fetchFn(`${base}/${phoneNumberId}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, ...payload }),
        });
      } catch (error) {
        log.warn('wa_network', { attempt, error: error.message });
      }
      if (res && res.ok) return true;
      if (res && res.status < 500 && res.status !== 429) {        // wrong token, number or outside the 24 h window: no retry
        log.error('wa_send_failed', { status: res.status, body: (await res.text()).slice(0, 300) });
        return false;
      }
      await new Promise((r) => setTimeout(r, wait));
      wait *= 2;
    }
    log.error('wa_send_gave_up', { to });
    return false;
  }
  return { post };
}

export function validSignature(raw, header, secret) {
  if (!secret || !header || !header.startsWith('sha256=')) return false;
  const want = Buffer.from(createHmac('sha256', secret).update(raw).digest('hex'));
  const got = Buffer.from(header.slice(7));
  return want.length === got.length && timingSafeEqual(want, got);
}

/** One incoming message → engine → WhatsApp replies. Same storage and sessions as the Telegram bot. */
export async function processMessage({ message, contact, api, storage, log, owner, menus }) {
  if (storage.isDuplicate(`wa:${message.id}`)) { log.warn('duplicate_message', { id: message.id }); return; }
  storage.rememberUpdate(`wa:${message.id}`);
  const chatId = `wa:${message.from}`;
  const event = toEvent(message, menus.get(chatId));
  if (!event) return;
  const session = storage.getSession(chatId) || newSession();
  const ctx = { now: Date.now(), chatId, firstName: contact?.profile?.name?.split(' ')[0] || null, username: null, sequence: storage.nextSequence() };
  const { session: next, actions } = handle(session, event, ctx);
  storage.saveSession(chatId, next);
  for (const action of actions) {
    if (action.type === 'send') {
      const { payloads, options } = toWhatsApp(action);
      if (options) menus.set(chatId, options); else menus.delete(chatId);
      for (const p of payloads) await api.post(message.from, p);
    } else if (action.type === 'save_order') {
      storage.addOrder(action.order);
      log.info('order_placed', { number: action.order.number, totalCents: action.order.totals.totalCents, chatId });
    } else if (action.type === 'owner') {
      if (action.kind === 'question') storage.addQuestion(ctx.now);
      // Business-initiated WhatsApp messages outside the customer's 24 h window need an approved template;
      // inside it (the owner wrote to the number recently) plain text works. A refusal is logged, never lost silently.
      if (owner) await api.post(owner, { type: 'text', text: { body: toWhatsAppText(action.text) } });
      else log.warn('owner_message_dropped', { kind: action.kind });
    }
  }
}

export function createApp({ env, api, storage, log }) {
  const menus = new Map();
  return createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== '/webhook') { res.writeHead(404).end(); return; }
    if (req.method === 'GET') {
      const ok = url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === env.WA_VERIFY_TOKEN;
      res.writeHead(ok ? 200 : 403).end(ok ? url.searchParams.get('hub.challenge') : 'forbidden');
      return;
    }
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      const raw = Buffer.concat(chunks);
      if (!validSignature(raw, req.headers['x-hub-signature-256'], env.WA_APP_SECRET)) {
        log.warn('bad_signature', {});
        res.writeHead(401).end();
        return;
      }
      res.writeHead(200).end('ok');                   // answer Meta at once; the dialog runs after
      let body;
      try { body = JSON.parse(raw); } catch { return; }
      for (const entry of body.entry || []) for (const change of entry.changes || []) {
        const value = change.value || {};
        for (const message of value.messages || []) {
          try {
            await processMessage({ message, contact: (value.contacts || [])[0], api, storage, log, owner: env.WA_OWNER || null, menus });
          } catch (error) { log.error('message_failed', { id: message.id, error: error.message }); }
        }
      }
    });
  });
}

if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const env = loadEnv(resolve(ROOT, '.env'));
  const log = createLogger({ file: resolve(ROOT, 'bot/logs/whatsapp.log') });
  const storage = createStorage(resolve(ROOT, env.ORDERS_FILE || 'storage/orders.json'));
  const api = createWhatsAppApi({ token: env.WA_TOKEN, phoneNumberId: env.WA_PHONE_NUMBER_ID, log });
  const port = Number(env.PORT || 3000);
  createApp({ env, api, storage, log }).listen(port, () => log.info('whatsapp_listening', { port }));
}
