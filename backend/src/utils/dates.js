/**
 * Date helpers that avoid UTC day-shifts for Pakistan (UTC+5) business dates.
 * Prefer calendar YYYY-MM-DD strings over Date#toISOString for DATE fields.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Return YYYY-MM-DD if value is a valid calendar date string; else null. */
export function toDateOnly(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const raw = String(value).trim();
  if (DATE_ONLY.test(raw)) return raw;

  // ISO / timestamptz → use local calendar day (server local TZ)
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Today's calendar date in local timezone as YYYY-MM-DD. */
export function todayDateOnly() {
  return toDateOnly(new Date());
}

/**
 * Parse a business date for timestamptz storage.
 * Date-only strings are stored as UTC midnight so ::date matches the calendar day.
 */
export function parseBusinessDateTime(value) {
  if (value == null || value === '') return new Date();
  const raw = String(value).trim();
  if (DATE_ONLY.test(raw)) return new Date(`${raw}T00:00:00.000Z`);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
}

/** pg DATE / timestamp → YYYY-MM-DD without UTC shift for DATE values. */
export function pgDateOnly(value) {
  if (value == null) return null;
  if (typeof value === 'string' && DATE_ONLY.test(value.slice(0, 10))) {
    return value.slice(0, 10);
  }
  if (value instanceof Date) {
    // node-pg returns DATE as UTC midnight; use UTC components for those
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return toDateOnly(value);
}
