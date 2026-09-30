// Records one real order conversation as WhatsApp Cloud API payloads (for the portfolio pictures).
// Same engine and converter as the live channel; the customer's taps are scripted.  node whatsapp/transcript.mjs
import { writeFileSync } from 'node:fs';
import { handle, newSession } from '../engine/dialog.js';
import { toEvent, toWhatsApp } from './convert.js';

let session = newSession(), menus = null, seq = 1;
const log = [];
function send(message, label) {
  log.push({ from: 'customer', label });
  const r = handle(session, toEvent(message, menus), { now: Date.parse('2026-09-24T21:40:00Z'), chatId: 'wa:447700900111', firstName: 'Nora', username: null, sequence: seq });
  session = r.session;
  for (const a of r.actions) {
    if (a.type === 'send') { const w = toWhatsApp(a); menus = w.options; w.payloads.forEach((p) => log.push({ from: 'bot', payload: p })); }
    if (a.type === 'owner') log.push({ from: 'owner', text: a.text });
    if (a.type === 'save_order') { log.push({ from: 'system', order: a.order.number }); seq++; }
  }
}
const lastBot = () => [...log].reverse().find((m) => m.from === 'bot').payload;
const opts = (p) => p.type !== 'interactive' ? [] : p.interactive.type === 'button'
  ? p.interactive.action.buttons.map((b) => ({ id: b.reply.id, title: b.reply.title, kind: 'button_reply' }))
  : p.interactive.action.sections.flatMap((s) => s.rows).map((r) => ({ id: r.id, title: r.title, kind: 'list_reply' }));
send({ type: 'text', text: { body: 'Hi!' } }, 'Hi!');
const prefer = [/order/i, /bread/i, /sourdough|loaf|box/i, /^2$/, /pickup/i, /nothing/i, /nora/i, /confirm|place|yes/i];
for (let i = 0; i < 30 && !log.some((m) => m.from === 'system'); i++) {
  const p = lastBot(), body = p.type === 'text' ? p.text.body : p.interactive.body.text;
  const o = opts(p).filter((x) => !/back|human|menu & prices|hours/i.test(x.title));
  if (!o.length) {
    const t = /phone/i.test(body) ? '+44 7700 900111' : /name/i.test(body) ? 'Nora Webb' : /address/i.test(body) ? '12 Mill Lane' : '2';
    send({ type: 'text', text: { body: t } }, t); continue;
  }
  const pick = prefer.map((re) => o.find((x) => re.test(x.title))).find(Boolean) || o[0];
  send({ type: 'interactive', interactive: { type: pick.kind, [pick.kind]: { id: pick.id, title: pick.title } } }, `▸ ${pick.title}`);
}
writeFileSync(new URL('./transcript.json', import.meta.url), JSON.stringify(log, null, 1));
console.log(log.length, 'messages; order:', log.find((m) => m.from === 'system')?.order);
