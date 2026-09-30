// Portfolio pictures from whatsapp/transcript.json: the exact WhatsApp Cloud API payloads the bot produced,
// drawn in a neutral chat layout (not the WhatsApp app, no WhatsApp branding). node whatsapp/render.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const log = JSON.parse(readFileSync(new URL('./transcript.json', import.meta.url)));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (s) => esc(s).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/_([^_\n]+)_/g, '<i>$1</i>').replace(/\n/g, '<br>');

function bubble(m, openList) {
  if (m.from === 'customer') return `<div class="me">${esc(m.label.replace(/^▸ /, ''))}</div>`;
  if (m.from !== 'bot') return '';
  const p = m.payload;
  if (p.type === 'text') return `<div class="bot">${fmt(p.text.body)}</div>`;
  const i = p.interactive;
  let extra = '';
  if (i.type === 'button') extra = `<div class="btns">${i.action.buttons.map((b) => `<span>${esc(b.reply.title)}</span>`).join('')}</div>`;
  else {
    extra = `<div class="btns"><span>☰ ${esc(i.action.button)}</span></div>`;
    if (openList) extra += `<div class="sheet"><div class="sh">${esc(i.action.sections[0].title)}</div>${i.action.sections[0].rows.map((r, k) =>
      `<div class="row${k === 2 ? ' on' : ''}"><div><b>${esc(r.title)}</b>${r.description ? `<small>${esc(r.description)}</small>` : ''}</div><i></i></div>`).join('')}</div>`;
  }
  return `<div class="bot">${fmt(i.body.text)}${extra}</div>`;
}

const CSS = `*{box-sizing:border-box}body{margin:0;width:1600px;height:1200px;background:#E7ECEE;font:15px/1.45 -apple-system,'Segoe UI',Roboto,sans-serif;color:#1d2426;position:relative}
.phone{position:absolute;top:50px;width:430px;height:1060px;background:#fff;border-radius:44px;box-shadow:0 30px 70px rgba(20,40,50,.22);padding:14px;overflow:hidden}
.scr{height:100%;border-radius:32px;background:#EFEAE2;overflow:hidden;display:flex;flex-direction:column}
.top{background:#1F6B57;color:#fff;padding:18px 16px 12px;display:flex;gap:10px;align-items:center}.av{width:38px;height:38px;border-radius:50%;background:#fff;color:#1F6B57;font-weight:800;display:flex;align-items:center;justify-content:center}
.top small{display:block;opacity:.8;font-size:12px}.msgs{flex:1;padding:12px 10px;display:flex;flex-direction:column;gap:8px;justify-content:flex-end;overflow:hidden}
.bot,.me{max-width:86%;padding:8px 11px;border-radius:12px;font-size:14px;box-shadow:0 1px 1px rgba(0,0,0,.08)}.bot{background:#fff;align-self:flex-start;border-top-left-radius:3px}
.me{background:#D9F2E6;align-self:flex-end;border-top-right-radius:3px}.btns{display:flex;flex-direction:column;gap:4px;margin-top:8px;border-top:1px solid #eee;padding-top:6px}
.btns span{color:#0B7A60;text-align:center;font-weight:600;padding:3px}.sheet{margin:8px -11px -8px;background:#fff;border-top:1px solid #e5e5e5}.sh{padding:8px 12px;color:#6b7a7f;font-size:12px;text-transform:uppercase}
.row{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-top:1px solid #f0f0f0}.row small{display:block;color:#6b7a7f;font-size:12px}.row i{width:16px;height:16px;border:2px solid #9aa;border-radius:50%}
.row.on i{border-color:#0B7A60;background:radial-gradient(#0B7A60 45%,transparent 50%)}
.side{position:absolute;left:1010px;top:70px;width:540px}.side h2{margin:0 0 14px;font-size:26px;color:#1F6B57}.side li{margin:0 0 12px;font-size:17px;line-height:1.5}
.card{background:#fff;border-radius:14px;padding:16px 18px;box-shadow:0 10px 30px rgba(20,40,50,.12);margin-top:14px;font-size:14px}.card b{color:#1F6B57}
.cap{position:absolute;left:60px;bottom:22px;font-size:14px;color:#5b6b70;width:1480px}`;
const phone = (x, msgs, title) => `<div class="phone" style="left:${x}px"><div class="scr"><div class="top"><div class="av">C</div><div><b>Cedarline Bakehouse</b><small>${title}</small></div></div><div class="msgs">${msgs}</div></div></div>`;
const CAP = 'Exactly what the bot sends to the WhatsApp Cloud API (reply buttons, list menus, formatting), drawn in a neutral chat layout · recorded from a test run of the real code, no Meta account used · Cedarline Bakehouse is a demo shop';

const idx = (re) => log.findIndex((m) => m.from === 'customer' && re.test(m.label));
const a = log.slice(0, idx(/Bread boxes/) + 0).map((m, k, arr) => bubble(m, k === arr.length - 1)).join('');
const b = log.slice(idx(/Sourdough/), idx(/pick it up/) + 1).map((m) => bubble(m, false)).join('');
const c = log.slice(idx(/Use "Nora"|Nora/)).filter((m) => m.from !== 'owner').map((m) => bubble(m, false)).join('');
const owner = log.find((m) => m.from === 'owner');
const side1 = `<div class="side"><h2>Same order bot, now on WhatsApp</h2><ul>
<li>Menus with up to 3 choices become <b>reply buttons</b>, longer ones become <b>list menus</b> — within WhatsApp's limits (3 buttons, 10 rows, 20/24-character titles).</li>
<li>More than 10 options → a numbered menu; the customer can simply type “3”.</li>
<li>“Hi” opens the menu; a real question goes to a person.</li>
<li>Meta's webhook signature is checked on every message; a message Meta delivers twice is answered once.</li>
<li>Photos and voice notes get a polite plain answer instead of breaking the order.</li></ul></div>`;
writeFileSync(new URL('../screenshots/whatsapp-1-menu.html', import.meta.url), `<!doctype html><meta charset="utf-8"><style>${CSS}</style>${phone(60, a, 'order bot · list menu')}${phone(520, b, 'order bot · quantity, day, time')}${side1}<div class="cap">${CAP}</div>`);
const side2 = `<div class="side"><h2>Confirmed — and the owner knows at once</h2><ul>
<li>A summary with the total before the customer confirms; “Change something” and “Cancel” are always there.</li>
<li>The order gets a number and is stored, and the owner is told at once (WhatsApp or Telegram).</li>
<li>Same engine, same rules and tests as the Telegram bot: 69 automated checks pass.</li></ul>
<div class="card"><b>Owner's notification</b><br>${fmt(owner ? owner.text.replace(/<\/?b>/g, '*') : '')}</div></div>`;
writeFileSync(new URL('../screenshots/whatsapp-2-order.html', import.meta.url), `<!doctype html><meta charset="utf-8"><style>${CSS}</style>${phone(300, c, 'order bot · summary and booking')}${side2}<div class="cap">${CAP}</div>`);
console.log('ok');
