/**
 * Africa/Lagos is UTC+1 all year with no daylight saving, so the offset is fixed.
 * Everything is stored in UTC; this converts between the wall-clock time a Nigerian
 * trainer actually thinks in and the UTC value the platform persists.
 */

export const LAGOS_OFFSET_MINUTES = 60;

export function lagosToUtcIso(date: string, time: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((date || '').trim());
  const t = /^(\d{1,2}):(\d{2})$/.exec((time || '').trim());
  if (!m || !t) return null;
  const [, y, mo, d] = m;
  const [, hh, mm] = t;
  const hour = Number(hh);
  const minute = Number(mm);
  if (hour > 23 || minute > 59) return null;
  // Construct as UTC first and reject impossible dates there, before shifting.
  // Checking after the shift would reject every time before 01:00 Lagos, since the
  // UTC instant then falls on the previous day.
  const asUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), hour, minute);
  if (Number.isNaN(asUtc)) return null;
  const check = new Date(asUtc);
  if (check.getUTCDate() !== Number(d) || check.getUTCMonth() !== Number(mo) - 1) return null;
  // 09:00 Lagos is 08:00 UTC.
  return new Date(asUtc - LAGOS_OFFSET_MINUTES * 60 * 1000).toISOString();
}

/** Split a UTC instant into Lagos wall-clock date and HH:MM for editing. */
export function utcToLagosParts(iso: string | Date): { date: string; time: string } {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  const shifted = new Date(d.getTime() + LAGOS_OFFSET_MINUTES * 60 * 1000);
  return {
    date: shifted.toISOString().slice(0, 10),
    time: shifted.toISOString().slice(11, 16),
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * "Tue 20 Oct, 09:00-11:00 Lagos". Built by hand rather than via toLocaleDateString,
 * whose output depends on the ICU build and would differ between machines.
 */
export function lagosRangeLabel(startIso: string, endIso: string): string {
  const s = utcToLagosParts(startIso);
  const e = utcToLagosParts(endIso);
  if (!s.date || !e.date) return '';
  const d = new Date(s.date + 'T00:00:00Z');
  const when = `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return `${when}, ${s.time}–${e.time} Lagos`;
}

/** Today in Lagos as YYYY-MM-DD. */
export function lagosToday(): string {
  return utcToLagosParts(new Date()).date;
}

/** Add whole days to a YYYY-MM-DD string, staying on calendar dates. */
export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Upcoming dates to schedule against. Scheduling is a near-future act, so a
 * rolling list beats a calendar widget here and renders identically everywhere.
 */
export function lagosDateOptions(count = 45) {
  const today = lagosToday();
  return Array.from({ length: count }, (_, i) => {
    const value = addDays(today, i);
    const d = new Date(value + 'T00:00:00Z');
    const day = `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
    return { value, label: i === 0 ? `Today · ${day}` : i === 1 ? `Tomorrow · ${day}` : day };
  });
}

/**
 * Class time slots at 30-minute steps across the whole day. A dropdown of the
 * times people actually teach beats a free-text time picker.
 *
 * Starts at 00:00 rather than a working-day hour: evening and night classes are
 * real, and a trainer scheduling one must not be unable to say when it starts.
 * The last slot is the final one that fits inside the day, so 23:30 for 30-minute
 * steps rather than stopping at 23:00.
 */
export function lagosTimeOptions(stepMinutes = 30) {
  const out: { value: string; label: string }[] = [];
  const minutesInDay = 24 * 60;
  for (let m = 0; m + stepMinutes <= minutesInDay; m += stepMinutes) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    const value = `${hh}:${mm}`;
    out.push({ value, label: value });
  }
  return out;
}