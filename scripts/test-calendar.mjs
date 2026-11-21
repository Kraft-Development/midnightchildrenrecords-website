import assert from 'node:assert/strict';
import { parseEvents, eventsToLabelEvents, eventDate, splitLocation, eventTime, validFeedUrl, unfold, descriptionText } from './calendar.mjs';
import { cleanEvents } from './events.mjs';

const roster = [{ slug: 'timo-odv', name: 'TiMO ODV' }, { slug: 'aidin-caye', name: 'Aidin Caye' }];
const ics = [
  'BEGIN:VCALENDAR', 'VERSION:2.0',
  'BEGIN:VEVENT', 'UID:ev1@google.com', 'DTSTART;TZID=Africa/Johannesburg:20261205T140000', 'SUMMARY:CULTURE',
  'LOCATION:Flamingo Bay Cnr Dove and Boundary Rd\\, Rynfield\\, Benoni\\, 1501\\, South Africa',
  'DESCRIPTION:Tickets: https://www.howler.co.za/Culture2\\nSeries: Midnight Children presents\\nLine-up: TiMO ODV\\, Aidin Caye & Someone Else\\nFee R5000 – private note\\nContact: promoter@example.com', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:ev2@google.com', 'DTSTART;VALUE=DATE:20270105', 'SUMMARY:Club Night', 'LOCATION:Kitchener\'s\\, Johannesburg', 'DESCRIPTION:Free entry', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:ev3@google.com', 'DTSTART:20261230T230000Z', 'SUMMARY:NYE', 'LOCATION:Beach Club\\, Cape Town', 'DESCRIPTION:Sold out\\nTickets: https://tix.example/nye', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:recent@google.com', 'DTSTART:20261001T200000Z', 'SUMMARY:Recent night', 'LOCATION:Old Venue\\, Durban', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:old@google.com', 'DTSTART:20250101T200000Z', 'SUMMARY:Old night', 'LOCATION:Old Venue\\, Durban', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:hold@google.com', 'DTSTART:20261201T200000Z', 'SUMMARY:HOLD - maybe Pretoria', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:priv@google.com', 'DTSTART:20261202T200000Z', 'SUMMARY:Team meeting', 'CLASS:PRIVATE', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:canc@google.com', 'DTSTART:20261203T200000Z', 'SUMMARY:Cancelled show', 'STATUS:CANCELLED', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:evil@google.com', 'DTSTART:20261204T200000Z', 'SUMMARY:<script>alert(1)</script>', 'LOCATION:X\\, Y', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:long@google.com', 'DTSTART:20261206T200000Z', 'SUMMARY:Folded', '  title', 'LOCATION:Venue', 'URL:javascript:alert(1)', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

assert.equal(unfold('A\r\n B'), 'AB');
const raw = eventsToLabelEvents(parseEvents(ics), '2025-11-20', roster);
const { events, problems } = cleanEvents(raw, { artistSlugs: new Set(roster.map((r) => r.slug)) });
assert.deepEqual(events.map((e) => e.uid), ['recent@google.com', 'ev1@google.com', 'long@google.com', 'ev3@google.com', 'ev2@google.com'], 'old, HOLD, private, cancelled and unsafe events are dropped; recent past kept');
assert.equal(problems.length, 1, 'the <script> title is rejected by cleanEvents');
const byUid = Object.fromEntries(events.map((e) => [e.uid, e]));
const c = byUid['ev1@google.com'];
assert.deepEqual([c.date, c.time, c.event, c.series, c.venue, c.city, c.address, c.status, c.url],
  ['2026-12-05', '14:00', 'CULTURE', 'Midnight Children presents', 'Flamingo Bay', 'Benoni', 'Cnr Dove and Boundary Rd, Rynfield, Benoni', 'tickets', 'https://www.howler.co.za/Culture2']);
assert.deepEqual(c.lineup, ['timo-odv', 'aidin-caye'], 'only roster names become line-up links');
assert.ok(!JSON.stringify(events).includes('R5000') && !JSON.stringify(events).includes('promoter@'), 'descriptions never leak');
const nye = byUid['ev3@google.com'], fold = byUid['long@google.com'], club = byUid['ev2@google.com'];
assert.equal(nye.date, '2026-12-31', 'UTC times are converted to SAST');
assert.deepEqual([nye.status, nye.url], ['soldout', ''], 'sold out drops the ticket link');
assert.deepEqual([fold.venue, fold.city, fold.event, fold.url], ['Venue', 'TBA', 'Folded title', ''], 'folded lines joined, javascript: url ignored');
assert.deepEqual([club.date, club.status, club.city, club.time], ['2027-01-05', 'free', 'Johannesburg', '']);
assert.equal(eventDate({ value: '20261231T230000Z' }), '2027-01-01');
assert.equal(eventTime({ value: '20261212T210000' }), '21:00');
assert.equal(eventTime({ value: '20261231T230000Z' }), '01:00');
assert.equal(eventTime({ value: '20270105' }), '');
assert.equal(eventTime(null), '');
assert.deepEqual(splitLocation('H2O Festival, Cape Town, South Africa'), { venue: 'H2O Festival', city: 'Cape Town', address: '' });
assert.ok(validFeedUrl('https://calendar.google.com/calendar/ical/x%40group.calendar.google.com/private-abc/basic.ics'));
for (const bad of ['http://calendar.google.com/x.ics', 'javascript:alert(1)', 'https://u:p@x.example/a.ics', 'https://x.example/page', '']) assert.equal(validFeedUrl(bad), '', bad);
const mk = (desc, loc = 'Venue\\, Benoni') => eventsToLabelEvents(parseEvents(['BEGIN:VEVENT', 'UID:t@g', 'DTSTART;VALUE=DATE:20261223', 'SUMMARY:Gig', 'LOCATION:' + loc, 'DESCRIPTION:' + desc, 'END:VEVENT'].join('\r\n')), '2026-11-20')[0];
assert.equal(mk('Tickets: <a href="https://tix.example/a">https://tix.example/a</a>').url, 'https://tix.example/a', 'labelled link inside Google HTML');
assert.equal(mk('Get yours here <a href="https://www.quicket.co.za/events/123/">quicket</a><br>See you there').url, 'https://www.quicket.co.za/events/123/', 'bare link on a ticketing site');
assert.equal(mk('Join: https://meet.google.com/abc-defg-hij<br>Rider: https://docs.google.com/x').url, '', 'meeting and document links are never used');
assert.equal(descriptionText('a &amp; b<br>c'), 'a & b\nc');
console.log('events calendar: all tests passed');
