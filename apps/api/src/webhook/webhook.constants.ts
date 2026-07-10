/**
 * Generic Spanish reply sent to the client when the agent (Luca) fails to
 * produce a response — an API error, a tool loop that never settles, etc. It
 * never exposes internal error detail (per CLAUDE.md) and points the client to
 * a human. The text is Spanish because it is client-facing.
 */
export const FALLBACK_REPLY_ES =
  'Perdoná, estoy teniendo un inconveniente para responderte en este momento. ' +
  'Un asesor se va a poner en contacto con vos a la brevedad. ' +
  '¡Gracias por tu paciencia!';

/**
 * Generic Spanish reply sent when a phone hits the rate limit (RateLimitService).
 * No internal detail (limit values, window), just a polite ask to slow down.
 */
export const RATE_LIMIT_REPLY_ES =
  'Estás escribiendo muy rápido, dame un minuto para poder seguirte el ritmo. ' +
  'Ya te respondo.';
