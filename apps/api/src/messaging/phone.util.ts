/**
 * Normalizes a recipient phone number to the form the WhatsApp Cloud API
 * expects when sending.
 *
 * Argentine mobiles arrive in the webhook `wa_id`/`from` with a `9` after the
 * country code (e.g. `5493484381803`), but the send endpoint — and the dev
 * allowed-recipient list — store/expect them without it (`543484381803`).
 * Sending with the `9` yields Meta error `(#131030) Recipient phone number not
 * in allowed list`. Country code `54` is Argentina exclusively, so stripping a
 * `549` prefix is unambiguous and never affects other countries or landlines.
 */
export function normalizeWhatsAppRecipient(phone: string): string {
  if (/^549\d{10}$/.test(phone)) {
    return `54${phone.slice(3)}`;
  }
  return phone;
}
