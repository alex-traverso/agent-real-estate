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
