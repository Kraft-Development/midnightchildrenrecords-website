// Unit tests for the events parser, countdown start time and calendar (.ics) output.
import assert from 'node:assert/strict';
import { cleanEvents, startIso, isUpcomingEvent, toIcs, slugify } from './events.mjs';

const base = { date: '2026-12-05', event: 'CULTURE', venue: 'Flamingo Bay', city: 'Benoni', url: 'https://www.howler.co.za/Culture2' };
let r = cleanEvents([base, { ...base, date: '2026-11-30', time: '21:00', event: 'Earlier', venue: 'Other' }]);
assert.equal(r.problems.length, 0);
assert.deepEqual(r.events.map((e) => e.event), ['Earlier', 'CULTURE'], 'sorted by start');
assert.equal(r.events[1].id, '2026-12-05-culture');
assert.equal(r.events[1].status, 'tickets', 'status defaults to tickets');
assert.equal(startIso(r.events[0]), '2026-11-30T21:00:00+02:00');
assert.equal(startIso(r.events[1]), '2026-12-05T00:00:00+02:00', 'no time -> start of day');

r = cleanEvents([{ ...base, status: 'soldout' }]);
assert.equal(r.events[0].url, '', 'sold-out shows drop the ticket link');
r = cleanEvents([{ ...base, url: 'javascript:alert(1)' }, { ...base, venue: 'x'.repeat(101) }, { ...base, date: '05-12-2026' }, { ...base, lineup: ['a'] }], { artistSlugs: new Set(['b']) });
assert.equal(r.events.length, 0); assert.equal(r.problems.length, 4);

// upcoming: still listed until 8 hours after the start
const e = { date: '2026-12-05', time: '20:00' };
assert.ok(isUpcomingEvent(e, Date.parse('2026-12-06T03:00:00+02:00')));
assert.ok(!isUpcomingEvent(e, Date.parse('2026-12-06T05:00:00+02:00')));

// .ics: escaped, all-day when no time, folded lines, CRLF
const ics = toIcs({ ...cleanEvents([{ ...base, event: 'A, B; C', address: 'Cnr Dove and Boundary Rd, Rynfield' }]).events[0] }, { site: 'https://midnightchildrenrecords.com', labelName: 'Midnight Children Records' });
assert.ok(ics.includes('SUMMARY:A\\, B\\; C\r\n'), 'summary escaped');
assert.match(ics, /DTSTART;VALUE=DATE:20261205\r\nDTEND;VALUE=DATE:20261206/);
assert.ok(ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75), 'lines folded');
const timed = toIcs(cleanEvents([{ ...base, time: '21:00' }]).events[0], { site: 'https://midnightchildrenrecords.com', labelName: 'MCR' });
assert.match(timed, /DTSTART:20261205T190000Z/, '21:00 SAST is 19:00 UTC');
assert.equal(slugify('Ünïcode Night!'), 'unicode-night');
console.log('events: all tests passed');
