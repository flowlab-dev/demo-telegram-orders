// One line of JSON per event: greppable, and small enough to keep for months.
// Nothing here ever prints the token or a customer's phone number.

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function createLogger({ file = null, console: out = console } = {}) {
  if (file) mkdirSync(dirname(file), { recursive: true });

  function write(level, event, data) {
    const line = JSON.stringify({ at: new Date().toISOString(), level, event, ...data });
    if (file) {
      try { appendFileSync(file, `${line}\n`); } catch { /* logging must never break the bot */ }
    }
    if (level === 'error') out.error(line);
    else out.log(line);
  }

  return {
    info: (event, data = {}) => write('info', event, data),
    warn: (event, data = {}) => write('warn', event, data),
    error: (event, data = {}) => write('error', event, data),
  };
}
