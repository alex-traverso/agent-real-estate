/**
 * Default "From" address for advisor notification emails. Overridable via the
 * `NOTIFICATIONS_FROM_EMAIL` env var. `onboarding@resend.dev` is Resend's shared
 * test sender — production should set a verified-domain address.
 */
export const DEFAULT_FROM_EMAIL = 'Luca <onboarding@resend.dev>';

/** Subject line for the advisor notification (advisor-facing, Spanish). */
export const ADVISOR_NOTIFICATION_SUBJECT = 'Nuevo lead calificado de Luca';
