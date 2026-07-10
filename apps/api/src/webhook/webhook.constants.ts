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

/**
 * Generic Spanish reply sent when a conversation hits MAX_MESSAGES — the
 * client is handed off to a human advisor instead of continuing with Luca.
 */
export const MESSAGE_CAP_REPLY_ES =
  'Charlamos bastante así que te voy a derivar con un asesor para que te ' +
  'termine de ayudar. En breve se pone en contacto con vos. ¡Gracias por tu ' +
  'paciencia!';

/**
 * Internal note attached to the lead saved when a conversation is escalated
 * for hitting MAX_MESSAGES — read by the advisor, not the client.
 */
export const MESSAGE_CAP_NOTE =
  'La conversación alcanzó el límite de mensajes con Luca y se derivó automáticamente.';
