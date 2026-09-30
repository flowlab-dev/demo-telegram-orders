// What must never ship: secrets, placeholders, or claims that are not true.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { SCENARIOS } from '../demo/scenarios.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Only the shipped project is policed here: the code, the page and the client-facing
// README. The Russian working notes next to them are my own paperwork, not the product.
const DIRS = ['engine', 'bot', 'demo', 'tests'];
const FILES = ['README.md', 'package.json', '.gitignore', '.env.example'];
const SKIP_DIRS = new Set(['.git', 'node_modules', 'storage', 'screenshots', 'logs']);

function projectFiles() {
  const out = FILES.map((f) => join(ROOT, f)).filter((f) => existsSync(f));
  for (const dir of DIRS) (function walk(current) {
    for (const entry of readdirSync(current)) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(js|html|md|json)$/.test(entry)) out.push(full);
    }
  }(join(ROOT, dir)));
  return out;
}

test('no Telegram token, API key or password is anywhere in the project', () => {
  const tokenLike = /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/;
  for (const file of projectFiles()) {
    const body = readFileSync(file, 'utf8');
    assert.ok(!tokenLike.test(body), `${file} looks like it contains a bot token`);
    const assignment = body.match(/(?:TELEGRAM_TOKEN|api[_-]?key|password|secret)\s*[:=]\s*['"][^'"]{8,}['"]/i);
    assert.equal(assignment, null, `${file} has a hard-coded secret: ${assignment && assignment[0]}`);
  }
});

test('.env is ignored by git and only the example is committed', () => {
  const ignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
  assert.match(ignore, /^\.env$/m);
  assert.match(ignore, /^storage\/orders\.json$/m);
  const example = readFileSync(join(ROOT, '.env.example'), 'utf8');
  assert.match(example, /^TELEGRAM_TOKEN=\s*$/m, 'the example must ship empty');
});

test('no placeholders, no lorem ipsum, no forgotten TODOs', () => {
  for (const file of projectFiles()) {
    if (file.endsWith('safety.test.js')) continue;
    const body = withoutComments(readFileSync(file, 'utf8'));
    assert.ok(!/lorem ipsum/i.test(body), `${file} contains lorem ipsum`);
    assert.ok(!/\bTODO\b|\bFIXME\b|\bXXX\b/.test(body), `${file} contains an unfinished marker`);
    assert.ok(!/coming soon|to be added|sample text/i.test(body), `${file} contains a placeholder`);
  }
});

test('the customers in the demo carry obviously invented phone numbers', () => {
  const typed = SCENARIOS.flatMap((s) => s.steps.filter((x) => typeof x.type === 'string').map((x) => x.type));
  const phones = typed.filter((t) => /^\+?[\d\s()-]{7,}$/.test(t));
  assert.ok(phones.length >= 8, 'the night should exercise several phone numbers');
  for (const phone of phones) {
    // Ranges reserved for fiction: 555-0100…0199 in North America, 07700 900xxx in the UK;
    // elsewhere no fiction range exists, so the national part starts with zeros — not a valid number
    // anywhere (26.09: "555" alone is NOT reserved outside North America, e.g. +47 555 55 112 could ring).
    const reserved = /555[\s-]?01\d\d\b/.test(phone) || /7700\s*900/.test(phone) || /^\+\d{1,3}\s(?:\d{1,3}\s)?0{3,}/.test(phone);
    assert.ok(reserved, `${phone} must come from a reserved "not a real subscriber" range`);
  }
});

test('the log cannot reach the token, and never carries customer phone numbers', () => {
  const logger = withoutComments(readFileSync(join(ROOT, 'bot/logger.js'), 'utf8'));
  assert.ok(!/process\.env|token/i.test(logger), 'the logger must not have access to the token');
  const run = withoutComments(readFileSync(join(ROOT, 'bot/run.js'), 'utf8'));
  assert.ok(!/log\.(info|warn|error)\([^)]*(phone|address|customer)/.test(run), 'contact details must stay out of the log');
});

test('the demo page claims nothing about clients or experience', () => {
  const html = readFileSync(join(ROOT, 'demo/index.html'), 'utf8');
  const body = html.slice(0, html.indexOf('// ---- ENGINE:START')) + html.slice(html.indexOf('// ---- ENGINE:END'));
  // "no real client's data appears here" is a disclaimer, not a claim - these catch claims.
  for (const phrase of [
    /for (my|our) clients/i,
    /clients I (work|worked|have worked)/i,
    /\d+\s*(happy\s*)?clients/i,
    /years of experience/i,
    /trusted by/i,
    /\bhundreds of\b/i,
  ]) {
    assert.ok(!phrase.test(body), `the page must not claim: ${phrase}`);
  }
});

/** Comments describe the rules; the rules themselves are what these tests police. */
function withoutComments(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}
