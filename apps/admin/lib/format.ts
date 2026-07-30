/**
 * Every number, price, area and date the panel renders goes through here, so
 * an amount looks the same in a table cell, a KPI and a detail field. The
 * locale is fixed to es-AR: the audience is Argentine advisors (CLAUDE.md).
 */

const LOCALE = "es-AR";

const integerFormatter = new Intl.NumberFormat(LOCALE, {
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat(LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
});

const dayHeadingFormatter = new Intl.DateTimeFormat(LOCALE, {
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** Shown wherever a value is absent, instead of an empty cell. */
export const EMPTY_VALUE = "—";

/** `USD 185.000`. Currency stays a plain prefix, not a locale symbol: an */
/** agency quotes in USD and ARS side by side and needs them told apart. */
export function formatPrice(
  price: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (price === null || price === undefined) return EMPTY_VALUE;
  const prefix = currency ? `${currency} ` : "";
  return `${prefix}${integerFormatter.format(price)}`;
}

/** `96 m²`. */
export function formatArea(area: number | null | undefined): string {
  if (area === null || area === undefined) return EMPTY_VALUE;
  return `${integerFormatter.format(area)} m²`;
}

/** Plain integer with thousands separators — counts, rooms, totals. */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return EMPTY_VALUE;
  return integerFormatter.format(value);
}

/** `12 feb 2026`. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return EMPTY_VALUE;
  return dateFormatter.format(new Date(value));
}

/** `12 feb 2026, 14:30`. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return EMPTY_VALUE;
  return dateTimeFormatter.format(new Date(value));
}

/** `14:30` — for message timestamps inside a day-grouped transcript. */
export function formatTime(value: string | null | undefined): string {
  if (!value) return EMPTY_VALUE;
  return timeFormatter.format(new Date(value));
}

/** `jueves, 12 de febrero` — the separator between days in a transcript. */
export function formatDayHeading(value: string): string {
  return dayHeadingFormatter.format(new Date(value));
}

/**
 * Groups a phone number for readability without pretending to know its shape.
 * WhatsApp gives E.164 digits (`5491122223333`); a real parser would need
 * libphonenumber, which is not worth 150 kB here, so this only spaces the
 * digits out and leaves anything unexpected untouched.
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return EMPTY_VALUE;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return phone;
  const country = digits.slice(0, digits.length - 10);
  const area = digits.slice(-10, -7);
  const first = digits.slice(-7, -4);
  const last = digits.slice(-4);
  return `${country ? `+${country} ` : ""}${area} ${first}-${last}`;
}

/**
 * A budget range: both bounds, or an open-ended "Desde"/"Hasta" when the
 * client only stated one of them.
 */
export function formatBudget(
  budgetMin: number | null,
  budgetMax: number | null,
  currency: string | null,
): string {
  if (budgetMin === null && budgetMax === null) return EMPTY_VALUE;

  const prefix = currency ? `${currency} ` : "";

  if (budgetMin !== null && budgetMax !== null) {
    return `${prefix}${integerFormatter.format(budgetMin)} – ${integerFormatter.format(budgetMax)}`;
  }
  if (budgetMin !== null) {
    return `Desde ${prefix}${integerFormatter.format(budgetMin)}`;
  }
  return `Hasta ${prefix}${integerFormatter.format(budgetMax as number)}`;
}
