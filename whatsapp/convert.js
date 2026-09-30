// The same engine replies, reshaped for WhatsApp Cloud API limits:
//   reply buttons: at most 3, title <= 20 characters;
//   list message: at most 10 rows, row title <= 24, description <= 72, button label <= 20;
//   interactive body <= 1024 characters, plain text <= 4096.
// Anything that does not fit becomes a numbered menu in plain text; the numbers are remembered
// per customer so that typing "3" works like pressing the third button.

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

/** Telegram-style HTML from the engine → WhatsApp formatting (*bold*, _italic_). */
export function toWhatsAppText(html) {
  return String(html)
    .replace(/<b>([\s\S]*?)<\/b>/g, '*$1*')
    .replace(/<i>([\s\S]*?)<\/i>/g, '_$1_')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m]);
}

const cut = (s, n) => (s.length <= n ? s : s.slice(0, n - 1) + '…');

/** "Bread boxes - next-morning bread, 12 hours notice" → title "Bread boxes", description the rest. */
function listRow(b) {
  if (b.text.length <= 24) return { id: b.data, title: b.text };
  const at = b.text.indexOf(' - ');
  if (at > 0 && at <= 24) return { id: b.data, title: b.text.slice(0, at), description: cut(b.text.slice(at + 3), 72) };
  return { id: b.data, title: cut(b.text, 24), description: cut(b.text, 72) };
}

const GREETING = /^(hi|hii|hello|hey|hiya|good (morning|afternoon|evening)|start|menu|привет|здравствуйте|добрый (день|вечер)|доброе утро)[\s!.,👋]*$/i;

/**
 * One engine "send" action → { payloads, options }.
 * payloads: WhatsApp message objects (without messaging_product / to - the API layer adds them).
 * options: [{ n, data }] for a numbered text menu, or null.
 */
export function toWhatsApp(action) {
  const text = toWhatsAppText(action.text || '');
  const buttons = ((action.keyboard && action.keyboard.rows) || []).flat();
  if (!buttons.length) return { payloads: [{ type: 'text', text: { body: cut(text, 4096) } }], options: null };

  const body = cut(text, 1024);
  if (buttons.length <= 3 && buttons.every((b) => b.text.length <= 20)) {
    return {
      payloads: [{ type: 'interactive', interactive: { type: 'button', body: { text: body },
        action: { buttons: buttons.map((b) => ({ type: 'reply', reply: { id: b.data, title: b.text } })) } } }],
      options: null,
    };
  }
  if (buttons.length <= 10) {
    return {
      payloads: [{ type: 'interactive', interactive: { type: 'list', body: { text: body },
        action: { button: 'Choose', sections: [{ title: 'Options', rows: buttons.map((b) => listRow(b)) }] } } }],
      options: null,
    };
  }
  const options = buttons.map((b, i) => ({ n: i + 1, data: b.data, text: b.text }));
  const menu = options.map((o) => `${o.n}. ${o.text}`).join('\n');
  return { payloads: [{ type: 'text', text: { body: cut(`${text}\n\n${menu}\n\nReply with a number.`, 4096) } }], options };
}

/** One incoming WhatsApp message → engine event. `options` is the numbered menu last shown to this customer. */
export function toEvent(message, options) {
  if (!message) return null;
  if (message.type === 'interactive') {
    const reply = message.interactive.button_reply || message.interactive.list_reply;
    return reply ? { type: 'callback', data: reply.id } : null;
  }
  if (message.type === 'button') return { type: 'callback', data: message.button.payload };   // template quick replies
  if (message.type !== 'text') return { type: 'unsupported' };                                  // photos, voice, stickers...
  const body = message.text.body.trim();
  if (GREETING.test(body)) return { type: 'command', name: 'start' };   // WhatsApp chats start with "Hi", not /start
  const command = body.match(/^\/([a-z_]+)/i);
  if (command) return { type: 'command', name: command[1].toLowerCase() };
  if (options && /^\d{1,2}$/.test(body)) {
    const hit = options.find((o) => o.n === Number(body));
    if (hit) return { type: 'callback', data: hit.data };
  }
  return { type: 'text', text: body };
}
