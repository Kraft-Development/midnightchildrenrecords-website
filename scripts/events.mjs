// Validation for src/content/events.json (same rules as the TiMO ODV gig calendar, plus time, address and line-up).
// Used at build time (invalid entries are dropped, never published) and by `npm test` (fails loudly before merge).
export const STATUSES = ['tickets', 'free', 'soldout', 'cancelled'];
export const TIMEZONE_OFFSET = '+02:00'; // South African Standard Time, no daylight saving
const MAX_EVENTS = 60;
const CONTROL = /[\u0000-\u001f\u007f\u2028\u2029]/;
const UID = /^[\w@.=+-]{1,200}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const text = (v, max, { required = false } = {}) => {
  if (v == null || v === '') return required ? null : '';
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  if (CONTROL.test(s) || /[<>]/.test(s) || Array.from(s).length > max) return null;
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s)) return null;
  if (required && !s) return null;
  return s;
};
export const realDate = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
const realTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const httpsUrl = (s) => {
  if (typeof s !== 'string' || s.length > 300 || CONTROL.test(s)) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' || u.username || u.password || !u.hostname.includes('.')) return null;
    return u.toString();
  } catch { return null; }
};
export const slugify = (s) => String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

// Start of the event as an ISO string in SAST. Without a time, the countdown runs to the start of the day.
export const startIso = (e) => `${e.date}T${e.time || '00:00'}:00${TIMEZONE_OFFSET}`;

export function cleanEvents(raw, { artistSlugs = null } = {}) {
  const problems = [];
  const events = [];
  if (!Array.isArray(raw)) return { events, problems: ['events.json must be a JSON array'] };
  const seen = new Set();
  raw.slice(0, MAX_EVENTS * 2).forEach((e, i) => {
    const bad = (why) => problems.push(`event ${i + 1}${e && e.event ? ` (${String(e.event).slice(0, 40)})` : ''}: ${why}`);
    if (!e || typeof e !== 'object' || Array.isArray(e)) return bad('not an object');
    if (!realDate(e.date)) return bad('date must be a real date as YYYY-MM-DD');
    const time = e.time == null || e.time === '' ? '' : e.time;
    if (time && !realTime(time)) return bad('time must look like 21:00 (24-hour, South African time)');
    const event = text(e.event, 120, { required: true });
    if (event === null) return bad('event name missing, too long, or contains < > or control characters');
    const series = text(e.series, 80);
    if (series === null) return bad('series too long, or contains < > or control characters');
    const venue = text(e.venue, 100, { required: true });
    if (venue === null) return bad('venue missing, too long, or contains < > or control characters');
    const city = text(e.city, 100, { required: true });
    if (city === null) return bad('city missing, too long, or contains < > or control characters');
    const address = text(e.address, 160);
    if (address === null) return bad('address too long, or contains < > or control characters');
    const status = e.status == null || e.status === '' ? 'tickets' : e.status;
    if (!STATUSES.includes(status)) return bad(`status must be one of ${STATUSES.join(', ')}`);
    let url = '';
    if (e.url != null && e.url !== '') {
      url = httpsUrl(e.url);
      if (!url) return bad('url must be a valid https link');
    }
    const lineup = [];
    if (e.lineup != null) {
      if (!Array.isArray(e.lineup)) return bad('lineup must be a list of artist slugs');
      for (const s of e.lineup) {
        if (typeof s !== 'string' || !SLUG.test(s)) return bad('lineup entries must be artist slugs like timo-odv');
        if (artistSlugs && !artistSlugs.has(s)) return bad(`lineup artist "${s}" is not in artists.json`);
        lineup.push(s);
      }
    }
    let uid = '';
    if (e.uid != null && e.uid !== '') {
      if (typeof e.uid !== 'string' || !UID.test(e.uid)) return bad('uid has unexpected characters');
      uid = e.uid;
    }
    const key = uid || `${e.date}|${venue.toLowerCase()}`;
    if (seen.has(key)) return bad('duplicate of an earlier entry');
    seen.add(key);
    const id = `${e.date}-${slugify(event) || 'event'}`;
    events.push({ id, date: e.date, time, event, series, venue, city, address, status, url: status === 'soldout' || status === 'cancelled' ? '' : url, lineup, uid });
  });
  if (events.length > MAX_EVENTS) { problems.push(`more than ${MAX_EVENTS} events; extra entries ignored`); events.length = MAX_EVENTS; }
  events.sort((a, b) => startIso(a).localeCompare(startIso(b)));
  return { events, problems };
}

export function cleanDeclined(raw) {
  if (!Array.isArray(raw)) return { ids: [], problems: ['events.declined.json must be a JSON array'] };
  const ids = raw.filter((x) => typeof x === 'string' && UID.test(x));
  return { ids, problems: ids.length === raw.length ? [] : ['events.declined.json contains invalid ids'] };
}

// Upcoming = has not started yet, or started less than 8 hours ago (still on tonight).
export const isUpcomingEvent = (e, now = Date.now()) => new Date(startIso(e)).getTime() + 8 * 3600e3 > now;

// iCalendar text for "Add to calendar". All values are escaped per RFC 5545.
const icsEscape = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
export function toIcs(e, { site, labelName }) {
  const d = e.date.replace(/-/g, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  let when;
  if (e.time) {
    const start = new Date(startIso(e));
    const end = new Date(start.getTime() + 6 * 3600e3);
    const f = (x) => x.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    when = [`DTSTART:${f(start)}`, `DTEND:${f(end)}`];
  } else {
    const next = new Date(e.date + 'T00:00:00Z'); next.setUTCDate(next.getUTCDate() + 1);
    when = [`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, '')}`];
  }
  const where = [e.venue, e.address || e.city].filter(Boolean).join(', ');
  const desc = [e.series, e.url ? `Tickets: ${e.url}` : '', `${site}/events/#${e.id}`].filter(Boolean).join('\n');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${icsEscape(labelName)}//Events//EN`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${e.id}@${new URL(site).hostname}`, `DTSTAMP:${stamp}`, ...when,
    `SUMMARY:${icsEscape(e.event)}`, `LOCATION:${icsEscape(where)}`, `DESCRIPTION:${icsEscape(desc)}`,
    `URL:${site}/events/#${e.id}`, e.status === 'cancelled' ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  // Fold lines longer than 75 octets.
  return lines.map((l) => {
    const out = []; let cur = '';
    for (const ch of Array.from(l)) { if (Buffer.byteLength(cur + ch) > 74) { out.push(cur); cur = ' ' + ch; } else cur += ch; }
    out.push(cur); return out.join('\r\n');
  }).join('\r\n') + '\r\n';
}
