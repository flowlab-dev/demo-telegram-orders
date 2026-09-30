// A tiny in-memory runtime for the dialog: it applies the actions the state machine
// returns and remembers what happened. The browser demo and the tests both run on it,
// so what you see on screen is produced by exactly the code the real bot runs.
// The live bot uses the same actions but sends them to Telegram and to storage instead.

import { handle, newSession, prompt } from './dialog.js';

export function createChat(options = {}) {
  const chat = {
    session: newSession(),
    now: options.now ?? Date.now(),
    firstName: options.firstName ?? null,
    username: options.username ?? null,
    chatId: options.chatId ?? 1,
    sequence: options.sequence ?? 1,
    messages: [],      // { from: 'bot' | 'customer', text, keyboard }
    orders: [],
    ownerMessages: [], // { kind, text, at }

    /** Advance the fake clock, e.g. between two customers in a simulated night. */
    setNow(ts) { chat.now = ts; return chat; },

    ctx() {
      return {
        now: chat.now,
        firstName: chat.firstName,
        username: chat.username,
        chatId: chat.chatId,
        sequence: chat.sequence,
      };
    },

    /** The keyboard shown by the last bot message, if any. */
    keyboard() {
      for (let i = chat.messages.length - 1; i >= 0; i -= 1) {
        if (chat.messages[i].from === 'bot' && chat.messages[i].keyboard) return chat.messages[i].keyboard;
      }
      return null;
    },

    lastText() {
      for (let i = chat.messages.length - 1; i >= 0; i -= 1) {
        if (chat.messages[i].from === 'bot') return chat.messages[i].text;
      }
      return '';
    },

    apply(event, label) {
      if (label) chat.messages.push({ from: 'customer', text: label });
      const result = handle(chat.session, event, chat.ctx());
      chat.session = result.session;
      for (const action of result.actions) {
        if (action.type === 'send') chat.messages.push({ from: 'bot', text: action.text, keyboard: action.keyboard || null });
        else if (action.type === 'save_order') { chat.orders.push(action.order); chat.sequence += 1; }
        else if (action.type === 'owner') chat.ownerMessages.push({ kind: action.kind, text: action.text, at: chat.now });
      }
      return result.actions;
    },

    start() { return chat.apply({ type: 'command', name: 'start' }, '/start'); },
    command(name) { return chat.apply({ type: 'command', name }, `/${name}`); },
    type(text) { return chat.apply({ type: 'text', text }, text); },

    /** Press a button by its visible label, the way a customer does. */
    tap(label) {
      const keyboard = chat.keyboard();
      const button = keyboard && keyboard.rows.flat().find((b) => b.text === label);
      if (!button) throw new Error(`No button "${label}". Visible: ${describe(keyboard)}`);
      return chat.apply({ type: 'callback', data: button.data }, button.text);
    },

    /** Same, but matching part of the label - keeps written scenarios readable. */
    tapLike(fragment) {
      const keyboard = chat.keyboard();
      const needle = fragment.toLowerCase();
      const all = keyboard ? keyboard.rows.flat() : [];
      // "6 servings" must not also match "16 servings", so a label that starts with
      // the fragment wins over one that merely contains it.
      const starts = all.filter((b) => b.text.toLowerCase().startsWith(needle));
      const found = starts.length > 0 ? starts : all.filter((b) => b.text.toLowerCase().includes(needle));
      if (found.length === 0) throw new Error(`No button matching "${fragment}". Visible: ${describe(keyboard)}`);
      if (found.length > 1) throw new Error(`"${fragment}" matches ${found.length} buttons: ${found.map((b) => b.text).join(' / ')}`);
      return chat.apply({ type: 'callback', data: found[0].data }, found[0].text);
    },

    /** Press a button that is no longer on screen - the stale-button case. */
    tapRaw(data, label) {
      return chat.apply({ type: 'callback', data }, label || data);
    },

    currentPrompt() { return prompt(chat.session, chat.ctx()); },
  };
  return chat;
}

function describe(keyboard) {
  if (!keyboard) return '(no buttons)';
  return keyboard.rows.flat().map((b) => `"${b.text}"`).join(', ');
}
