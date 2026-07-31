/** Upper bound on a sanitized lead name, well above any real full name. */
export const MAX_LEAD_NAME_LENGTH = 100;

/**
 * At least one Unicode letter, anywhere in the string — used to reject names
 * that are pure punctuation, digits, or emoji (e.g. "-", "123", "👍").
 */
const HAS_LETTER = /\p{L}/u;

/**
 * Cleans a name coming from an untrusted source (the model's `save_lead`
 * input, or the WhatsApp contact profile) before it reaches the database or a
 * prompt: trims, collapses internal whitespace/control characters, and caps
 * the length. Returns `undefined` when nothing usable is left, so callers can
 * treat "no real name" uniformly regardless of where the raw value came from.
 */
export function sanitizeLeadName(raw?: string | null): string | undefined {
  if (!raw) {
    return undefined;
  }

  const collapsed = raw
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LEAD_NAME_LENGTH);

  if (collapsed.length < 2 || !HAS_LETTER.test(collapsed)) {
    return undefined;
  }

  return collapsed;
}
