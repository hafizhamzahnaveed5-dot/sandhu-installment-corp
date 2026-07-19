/**
 * Date helpers locked to Pakistan business calendar (Asia/Karachi).
 * Avoids UTC day-shifts on Vercel serverless (which runs in UTC).
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
export const BUSINESS_TZ = 'Asia/Karachi';

/** Format an instant as YYYY-MM-DD in the business timezone. */
function formatInBusinessTz(date) {
  // en-CA → YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Return YYYY-MM-DD if value is a valid calendar date string; else null. */
export function toDateOnly(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return formatInBusinessTz(value);
  }

  const raw = String(value).trim();
  if (DATE_ONLY.test(raw)) return raw;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatInBusinessTz(parsed);
}

/** Today's calendar date in Asia/Karachi as YYYY-MM-DD. */
export function todayDateOnly() {
  return formatInBusinessTz(new Date());
}

/**
 * Parse a business date for timestamptz storage.
 * Date-only strings are stored as UTC midnight so the calendar day is preserved.
 */
export function parseBusinessDateTime(value) {
  if (value == null || value === '') return new Date();
  const raw = String(value).trim();
  if (DATE_ONLY.test(raw)) return new Date(`${raw}T00:00:00.000Z`);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
}

/** pg DATE / timestamp → YYYY-MM-DD without timezone day-shift. */
export function pgDateOnly(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const iso = value.toISOString();
    // node-pg often returns DATE as UTC midnight
    if (iso.endsWith('T00:00:00.000Z')) return iso.slice(0, 10);
    return formatInBusinessTz(value);
  }
  return toDateOnly(value);
}
