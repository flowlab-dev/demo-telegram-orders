// The demo page carries an inlined copy of the engine, because browsers will not load
// ES modules from a double-clicked file. These tests make sure that copy is the engine -
// byte for byte, and in behaviour.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { buildEngineBundle, embeddedFromHtml } from '../demo/build-embedded.js';
import { runNight } from '../demo/scenarios.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(ROOT, 'demo/index.html'), 'utf8');

test('the engine inlined in demo/index.html matches the source files', () => {
  const embedded = embeddedFromHtml(html);
  assert.ok(embedded, 'ENGINE markers are missing from demo/index.html');
  assert.equal(
    embedded,
    buildEngineBundle(ROOT),
    'demo/index.html is out of date - run: npm run build:demo',
  );
});

test('the inlined engine produces the same night as the modules', () => {
  const context = vm.createContext({ console });
  vm.runInContext(`${embeddedFromHtml(html)}\n;globalThis.__demo = { runNight, createChat };`, context);

  const fromPage = context.__demo.runNight();
  const fromModules = runNight();

  assert.equal(fromPage.orders.length, fromModules.orders.length);
  assert.equal(fromPage.revenueCents, fromModules.revenueCents);
  assert.equal(fromPage.questions, fromModules.questions);
  // Compared as text: objects built inside the vm have their own prototypes.
  const shape = (night) => JSON.stringify(night.orders.map((o) => [
    o.number, o.item.label, o.item.qty, o.totals.totalCents, o.handover.date, o.handover.method,
  ]));
  assert.equal(shape(fromPage), shape(fromModules));

  // And the words the customer reads are the same too.
  const firstChat = (night) => night.chats[0].chat.messages.map((m) => `${m.from}: ${m.text}`).join('\n');
  assert.equal(firstChat(fromPage), firstChat(fromModules));
});

test('the page has no network calls, no external files and no inline event handlers', () => {
  const body = html.replace(/<!--[\s\S]*?-->/g, '');
  assert.ok(!/<script[^>]+src=/i.test(body), 'the demo must not load external scripts');
  assert.ok(!/<link[^>]+href=(?!["']data:)/i.test(body), 'the demo must not load external stylesheets or fonts (inline data: icon is fine)');
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket/.test(body), 'the demo must not talk to the network');
  assert.ok(!/\son(click|load|error)\s*=/i.test(body), 'handlers are attached in code, not in HTML attributes');
});

test('the page says plainly that the bakery and the night are invented', () => {
  assert.match(html, /my own demo project/i);
  assert.match(html, /invented/i);
  assert.match(html, /not Telegram itself/i);
});
