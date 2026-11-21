import assert from 'node:assert/strict';
import { nextData, queryResults, mapCatalogue, mergeReleases, releaseTitle, baseCatalogue, summary, slugify, joinNames } from './beatport.mjs';

const roster = [{ slug: 'timo-odv', name: 'TiMO ODV' }, { slug: 'aidin-caye', name: 'Aidin Caye' }, { slug: 'advent', name: 'Advent' }];
const img = (id) => ({ uri: `https://geo-media.beatport.com/image_size/590x404/${id}.jpg`, dynamic_uri: `https://geo-media.beatport.com/image_size/{w}x{h}/${id}.jpg` });
const A = (n) => ({ name: n });
const U1 = 'ad3e62e0-83b5-4cd9-b94e-e2853804067d', U2 = 'cd729dde-6a80-4097-9b60-4e4de23cf54b', U3 = 'f53cd9e9-f557-45ee-8922-94c73c9f3318', U4 = '446dfc7a-e5cb-41c6-828a-f560c474bf5f', U5 = '8252adac-4a17-4ed6-a32c-905aa55f3216';
const releases = [
  { id: 4657066, name: 'Freed From Desire', slug: 'freed-from-desire', catalog_number: 'MCR005', new_release_date: '2024-05-31', artists: [A('TiMO ODV'), A('Aidin Caye')], image: img(U1), desc: 'Introducing an <b>electrifying</b> fusion.\n\nSecond paragraph.' },
  { id: 4597271, name: 'Freed From Desire (Extended Mix)', slug: 'freed-from-desire-extended-mix', catalog_number: 'MCR005D', new_release_date: '2024-05-31', artists: [A('TiMO ODV'), A('Aidin Caye')], image: img(U2), desc: '' },
  { id: 4265570, name: 'Harpe', slug: 'harpe', catalog_number: 'MCR001', new_release_date: '2023-07-14', artists: [A('TiMO ODV')], image: img(U3), desc: '' },
  { id: 4161971, name: 'harpe', slug: 'harpe', catalog_number: '1606779', new_release_date: '2023-07-14', artists: [A('TiMO ODV')], image: img(U4), desc: 'The release "Harpe" by TiMO ODV consists of 2 tracks.' },
  { id: 9, name: 'Evil <script>', slug: 'evil', catalog_number: 'MCR099', new_release_date: '2026-01-01', artists: [A('TiMO ODV')], image: { uri: 'https://evil.example/x.jpg' } },
  { id: 10, name: 'Someone Else Only', slug: 'x', catalog_number: 'MCR098', new_release_date: '2026-01-01', artists: [A('Not On Roster')] },
  { id: 11, name: 'You & Me (Extended Mix)', slug: 'you-me-extended-mix', catalog_number: 'MCR016D', new_release_date: '2099-10-30', artists: [A('Aidin Caye')], image: img(U5), desc: 'Artist: Aidin Caye\nEvery artist has the record where they stop chasing a sound.' },
];
const T = (rel, name, mix, ms, genre = 'Afro House') => ({ name, mix_name: mix, length_ms: ms, genre: { name: genre }, artists: rel.artists, release: { id: rel.id, name: rel.name, slug: rel.slug, image: rel.image }, catalog_number: rel.catalog_number, new_release_date: rel.new_release_date });
const tracks = [
  T(releases[0], 'Freed From Desire', 'Original Mix', 206463),
  T(releases[1], 'Freed From Desire', 'Extended Mix', 392195),
  T(releases[2], 'Harpe', 'Extended Mix', 432786, 'Melodic House & Techno'),
  T(releases[2], 'Harpe', 'Original Mix', 243000, 'Melodic House & Techno'),
  T(releases[3], 'harpe', 'Original Mix', 244610, 'Melodic House & Techno'),
  T(releases[6], 'You & Me', 'Extended Mix', 349714, 'Melodic House & Techno'),
];

const out = mapCatalogue(releases, tracks, roster, '2026-11-21');
assert.deepEqual(out.map((r) => r.catalogue), ['MCR016', 'MCR005', 'MCR001'], 'one release per catalogue; unsafe and off-roster entries dropped; newest first');
const [you, ffd, harpe] = out;
assert.deepEqual([ffd.slug, ffd.title, ffd.credit, ffd.artists.join(), ffd.date, ffd.genre], ['freed-from-desire', 'Freed From Desire', 'TiMO ODV & Aidin Caye', 'timo-odv,aidin-caye', '2024-05-31', 'Afro House']);
assert.deepEqual(ffd.tracks, [{ title: 'Freed From Desire (Original Mix)', duration: '3:26' }, { title: 'Freed From Desire (Extended Mix)', duration: '6:32' }], 'mixes from both Beatport entries, original first');
assert.equal(ffd.links.beatport, 'https://www.beatport.com/release/freed-from-desire/4657066', 'plain catalogue number is the main entry');
assert.equal(ffd.artwork, `https://geo-media.beatport.com/image_size/1400x1400/${U1}.jpg`);
assert.equal(ffd.description, 'Introducing an electrifying fusion.', 'first paragraph, tags stripped');
assert.equal(harpe.tracks.length, 2, 'distributor-number duplicate joins MCR001 without repeating its mixes');
assert.equal(harpe.description, '', 'Beatport filler text is not used');
assert.deepEqual([you.slug, you.title, you.preorder, you.description], ['you-and-me', 'You & Me', true, 'Every artist has the record where they stop chasing a sound.']);
assert.ok(!JSON.stringify(out).includes('<'), 'no angle brackets reach the output');

assert.equal(releaseTitle('Bang Bang (NEWIRE Remix)'), 'Bang Bang (NEWIRE Remix)');
assert.equal(releaseTitle('Better (Extended Mix)'), 'Better');
assert.equal(baseCatalogue('MCR013S'), 'MCR013'); assert.equal(baseCatalogue('1601329'), '');
assert.equal(slugify("Can't Be Me"), 'cant-be-me');
assert.equal(joinNames(['Advent', 'TiMO ODV', 'beatsbyhand']), 'Advent, TiMO ODV & beatsbyhand');
assert.ok(summary('a. '.repeat(400)).length <= 421);

// releases.json wins field by field, links are merged, hand-made releases are added
const merged = mergeReleases(out, [
  { catalogue: 'MCR005', slug: 'freed-from-desire', description: 'Our own words.', links: { spotify: 'https://open.spotify.com/album/x' }, tracks: [] },
  { catalogue: 'MCR012', slug: 'not-on-beatport', title: 'Not on Beatport', artists: ['advent'], type: 'Single', date: '2025-01-01' },
]);
const m5 = merged.find((r) => r.catalogue === 'MCR005');
assert.equal(m5.description, 'Our own words.');
assert.equal(m5.tracks.length, 2, 'an empty list in releases.json does not wipe Beatport data');
assert.deepEqual(Object.keys(m5.links).sort(), ['beatport', 'spotify']);
assert.ok(merged.some((r) => r.slug === 'not-on-beatport'));

// Next.js data extraction
const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { dehydratedState: { queries: [{ queryKey: ['label-1'], state: { data: { id: 1 } } }, { queryKey: ['releases-label_id=1'], state: { data: { results: releases, count: 7 } } }] } } } })}</script></html>`;
const q = queryResults(nextData(html));
assert.equal(q.length, 1); assert.equal(q[0].results.length, 7);
assert.equal(nextData('<html>blocked</html>'), null);
console.log('beatport: all tests passed');
