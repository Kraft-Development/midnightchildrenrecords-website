// Reads the label's events calendar (an iCal feed, e.g. Google Calendar's "Secret address in iCal format") and turns it into
// entries for src/content/events.json. Ported from the TiMO ODV and Aidin Caye sites, which read their gig calendars the same way.
// Used by scripts/fetch-data.mjs at build time; tested by scripts/test-calendar.mjs.
//
// Privacy and safety rules (the calendar is personal data, and its text is data, never instructions):
//   - Only the date, title, location, a ticket link (labelled "Tickets:" or on a known ticketing site) and the event's UID are used. Descriptions, attendees,
//     organisers and notes are never copied; only the start time is anywhere.
//   - Events marked private/confidential, cancelled or tentative, and any whose title contains HOLD, TBC, TBA,
//     PRIVATE or TENTATIVE, are skipped.
//   - Everything still goes through scripts/events.mjs (cleanEvents), which rejects bad dates, < > and control
//     characters, non-https links and so on, so nothing unsafe can reach the page.
//
// How to write an event in the calendar (see GROK-TASKS.md and README.md):
//   Title     = the event name, e.g. "CULTURE"
//   Location  = "Venue, Street, Suburb, City" (Google's full addresses work: the first part is the venue, the town is found after it)
//   Description (optional), one per line:
//     "Tickets: https://..."   or   "Free entry"   or   "Sold out"
//     "Series: Midnight Children presents"
//     "Line-up: TiMO ODV, Aidin Caye"   (names of artists on the roster; anyone else is ignored)
//   (a bare link is also used if it is on a known ticketing site: Quicket, Howler, Computicket, Webtickets, ...)

const SKIP_WORDS = /\b(hold|tbc|tba|private|tentative)\b/i;
const COUNTRIES = /^(south africa|za|rsa|mozambique|moçambique|namibia|botswana|zimbabwe|eswatini|lesotho|kenya|nigeria|ghana|united kingdom|uk|germany|netherlands|portugal|spain|france|mauritius)$/i;

// RFC 5545: lines are folded with CRLF + space/tab; values escape \, ; , and \n.
export function unfold(ics) {
  return String(ics || '').replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}
const unescape = (v) => String(v || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();

export function parseEvents(ics) {
  const events = [];
  const blocks = unfold(ics).split('BEGIN:VEVENT').slice(1).map((b) => b.split('END:VEVENT')[0]);
  for (const block of blocks.slice(0, 2000)) {
    const ev = {};
    for (const line of block.split('\n')) {
      const m = line.match(/^([A-Z-]+)((?:;[^:]*)?):(.*)$/);
      if (!m) continue;
      const [, name, params, value] = m;
      if (!['SUMMARY', 'LOCATION', 'DTSTART', 'URL', 'DESCRIPTION', 'UID', 'STATUS', 'CLASS', 'RECURRENCE-ID'].includes(name)) continue;
      if (name in ev) continue; // first value wins
      ev[name] = name === 'DTSTART' ? { params, value: value.trim() } : unescape(value);
    }
    events.push(ev);
  }
  return events;
}

// Local start time (HH:MM, South African time) of DTSTART, or '' for all-day events.
export function eventTime(dt) {
  if (!dt || !dt.value) return '';
  const m = dt.value.match(/^\d{8}T(\d{2})(\d{2})\d{2}(Z?)$/);
  if (!m) return '';
  const h = m[3] === 'Z' ? (+m[1] + 2) % 24 : +m[1];
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

// Local date (YYYY-MM-DD) of DTSTART. Times in UTC (…Z) are converted to South African time (UTC+2, no DST);
// times with a TZID or no zone are taken as local wall-clock time.
export function eventDate(dt) {
  if (!dt || !dt.value) return '';
  const v = dt.value;
  let m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return '';
  if (m[7] === 'Z') {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] + 2, +m[5], +m[6]));
    return d.toISOString().slice(0, 10);
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
}

// "Venue, 12 Some Street, Suburb, Johannesburg, 2196, South Africa" -> { venue: "Venue", city: "Johannesburg, ZA"-ish }
export function splitLocation(loc) {
  const parts = String(loc || '').split(/\s*,\s*/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return { venue: '', city: '' };
  // "Flamingo Bay Waterfront Cnr Boundary & Dove Rd" -> "Flamingo Bay Waterfront"
  const venue = parts[0].replace(/\s+(cnr\.?|corner(\s+of)?)\s+.*$/i, '').trim() || parts[0];
  const rest = parts.slice(1).filter((p) => !/^\d{3,6}$/.test(p) && !/^\d+\s/.test(p) && !COUNTRIES.test(p));
  const country = parts.slice(1).find((p) => COUNTRIES.test(p)) || '';
  const city = rest.length ? rest[rest.length - 1] : country;
  // Street and suburb for the address line, e.g. "Cnr Dove and Boundary Rd, Rynfield, Benoni"
  const cnr = parts[0].match(/\s+((cnr\.?|corner(\s+of)?)\s+.*)$/i);
  const street = parts.slice(1).filter((p) => !/^\d{3,6}$/.test(p) && !COUNTRIES.test(p));
  const address = [cnr ? cnr[1] : '', ...street].filter(Boolean).join(', ');
  return { venue, city, address: street.length > 1 || cnr ? address : '' };
}

// Ticketing sites whose links may be used even without a "Tickets:" label. Any other unlabelled link
// (Google Meet, Zoom, documents, contracts) is ignored, so private links can never reach the site.
const TICKET_HOSTS = /(^|\.)(quicket\.co\.za|howler\.co\.za|computicket\.com|webtickets\.co\.za|ticketpros?\.co\.za|ticketmaster\.[a-z.]+|eventbrite\.[a-z.]+|ra\.co|residentadvisor\.net|dice\.fm|plankton\.mobi|tixsa\.co\.za)$/i;
const isTicketHost = (u) => { try { return TICKET_HOSTS.test(new URL(u).hostname); } catch { return false; } };

// Google stores descriptions as simple HTML: turn links and line breaks into plain text before reading them.
export function descriptionText(description) {
  return String(description || '')
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>.*?<\/a>/gis, ' $1 ')
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function ticketInfo(description) {
  const lines = descriptionText(description).split('\n').map((l) => l.trim());
  let labelled = '';
  let known = '';
  let status = 'tickets';
  let series = '';
  let lineup = [];
  for (const l of lines) {
    const se = l.match(/^series\s*:\s*(.{1,80})$/i);
    if (se && !series) series = se[1].trim();
    const lu = l.match(/^line-?\s?up\s*:\s*(.{1,400})$/i);
    if (lu && !lineup.length) lineup = lu[1].split(/\s*(?:,|&|\band\b|\+)\s*/i).map((x) => x.trim()).filter(Boolean);
    const t = l.match(/^tickets?\s*[:\-]?\s*(https:\/\/\S+)/i);
    if (t && !labelled) labelled = t[1].replace(/[).,;]+$/, '');
    if (!known) for (const u of l.match(/https:\/\/[^\s<>"')]+/g) || []) if (isTicketHost(u)) { known = u.replace(/[.,;]+$/, ''); break; }
    if (/^free( entry)?\.?$/i.test(l)) status = 'free';
    if (/^sold\s*out\.?$/i.test(l)) status = 'soldout';
  }
  return { url: labelled || known, status, series, lineup };
}

// Returns events in the events.json shape. `since` is YYYY-MM-DD (SAST): older events are dropped (past nights
// stay listed for a while). `artists` is the roster ([{ slug, name }]) used to turn "Line-up:" names into artist links.
export function eventsToLabelEvents(events, since, artists = []) {
  const bySlug = new Map(artists.map((a) => [String(a.name).toLowerCase(), a.slug]));
  const out = [];
  const seen = new Set();
  for (const ev of events) {
    if (ev['RECURRENCE-ID']) continue; // changed single instances of repeating events: skip rather than guess
    if (/^(private|confidential)$/i.test(ev.CLASS || '')) continue;
    if (/^(cancelled|tentative)$/i.test(ev.STATUS || '')) continue;
    const title = (ev.SUMMARY || '').replace(/\s+/g, ' ').trim();
    if (!title || SKIP_WORDS.test(title)) continue;
    const date = eventDate(ev.DTSTART);
    if (!date || date < since) continue;
    const { venue, city, address } = splitLocation(ev.LOCATION);
    const info = ticketInfo(ev.DESCRIPTION);
    const url = info.url || (/^https:\/\//.test(ev.URL || '') ? ev.URL : '');
    const uid = /^[\w@.=+-]{1,200}$/.test(ev.UID || '') ? ev.UID : '';
    const key = uid || `${date}|${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      date,
      time: eventTime(ev.DTSTART),
      event: title,
      series: info.series,
      venue: venue || 'TBA',
      city: city || 'TBA',
      address,
      status: info.status,
      url: info.status === 'soldout' ? '' : url,
      lineup: [...new Set(info.lineup.map((n) => bySlug.get(n.toLowerCase())).filter(Boolean))],
      uid,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 60);
}

// The feed address is a secret: only https Google Calendar (or other https) iCal links, and it is never logged.
export function validFeedUrl(u) {
  try {
    const x = new URL(String(u || '').trim());
    return x.protocol === 'https:' && !x.username && !x.password && /\.ics$/i.test(x.pathname) ? x.toString() : '';
  } catch { return ''; }
}
