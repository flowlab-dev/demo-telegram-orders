// Telegram Bot API over the built-in fetch. No packages, nothing to audit but this file.
//
// Everything that can go wrong at 3 a.m. is handled here: a dropped connection,
// a 429 "too many requests", a 502 from Telegram's own proxy. The bot retries with
// growing pauses instead of dying and leaving the shop without a night shift.

const BASE = 'https://api.telegram.org';

export class TelegramError extends Error {
  constructor(message, { code = null, retryAfter = null, fatal = false } = {}) {
    super(message);
    this.name = 'TelegramError';
    this.code = code;
    this.retryAfter = retryAfter;
    this.fatal = fatal;
  }
}

export function createApi({ token, log, fetchImpl = fetch, sleep = defaultSleep, maxAttempts = 5 }) {
  if (!token) throw new Error('TELEGRAM_TOKEN is missing - copy .env.example to .env and put the token from @BotFather there.');

  async function call(method, payload = {}, { timeoutMs = 20000 } = {}) {
    let attempt = 0;
    for (;;) {
      attempt += 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(`${BASE}/bot${token}/${method}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const body = await response.json().catch(() => ({}));

        if (response.ok && body.ok) return body.result;

        const description = body.description || `HTTP ${response.status}`;
        const retryAfter = body.parameters && body.parameters.retry_after;

        // 401/403/409 will not fix themselves - stop and say so plainly.
        if ([401, 403, 409].includes(response.status)) {
          throw new TelegramError(`${method}: ${description}`, { code: response.status, fatal: true });
        }
        if (attempt >= maxAttempts) {
          throw new TelegramError(`${method}: ${description} (gave up after ${attempt} attempts)`, { code: response.status });
        }
        const waitMs = retryAfter ? retryAfter * 1000 : backoff(attempt);
        log.warn('telegram_retry', { method, status: response.status, description, attempt, waitMs });
        await sleep(waitMs);
      } catch (error) {
        clearTimeout(timer);
        if (error instanceof TelegramError) throw error;
        if (attempt >= maxAttempts) throw new TelegramError(`${method}: ${error.message} (gave up after ${attempt} attempts)`);
        const waitMs = backoff(attempt);
        log.warn('telegram_network_retry', { method, error: error.message, attempt, waitMs });
        await sleep(waitMs);
        continue;
      } finally {
        clearTimeout(timer);
      }
    }
  }

  return {
    call,
    getMe: () => call('getMe'),
    getUpdates: (offset, timeoutSeconds) =>
      call('getUpdates', { offset, timeout: timeoutSeconds, allowed_updates: ['message', 'callback_query'] },
        { timeoutMs: (timeoutSeconds + 15) * 1000 }),
    sendMessage: (chatId, text, keyboard) =>
      call('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(keyboard ? { reply_markup: toReplyMarkup(keyboard) } : {}),
      }),
    answerCallbackQuery: (id, text) =>
      call('answerCallbackQuery', { callback_query_id: id, ...(text ? { text } : {}) }),
  };
}

/** The engine's neutral keyboard shape -> Telegram's inline_keyboard. */
export function toReplyMarkup(keyboard) {
  return {
    inline_keyboard: keyboard.rows.map((row) => row.map((b) => ({ text: b.text, callback_data: b.data }))),
  };
}

function backoff(attempt) {
  return Math.min(30000, 1000 * 2 ** (attempt - 1));
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
