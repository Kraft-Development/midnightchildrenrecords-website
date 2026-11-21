import assert from 'node:assert/strict';
import { mapDeezerAlbum, matchStreaming, titleKey, appleUrl, spotifyUrl } from './streaming.mjs';

const roster = [{ slug: 'timo-odv', name: 'TiMO ODV' }, { slug: 'aidin-caye', name: 'Aidin Caye' }];
const dz = (id, title, date, names, extra = {}) => ({
  id, title, release_date: date, label: 'Midnight Children Records', link: `https://www.deezer.com/album/${id}`, upc: `42557${id}`,
  cover_xl: 'https://cdn-images.dzcdn.net/images/cover/8d26eb9dab5b848b4c9262cf6e07461a/1000x1000-000000-80-0-0.jpg',
  contributors: names.map((n) => ({ name: n, role: 'Main' })), tracks: { data: [{ title, title_version: '', duration: 161 }] }, ...extra,
});

assert.equal(titleKey('Freed From Desire (Extended Mix)'), titleKey('Freed From Desire'));
assert.equal(titleKey('2 AM (We Like That)'), titleKey('2 AM'));
assert.notEqual(titleKey('Bang Bang (NEWIRE Remix)'), titleKey('Bang Bang'));
assert.equal(titleKey('You & Me'), 'you and me');

assert.equal(mapDeezerAlbum(dz(1, 'X', '2026-01-01', ['A'], { label: 'Some Other Label' })), null, 'other labels ignored');
assert.equal(mapDeezerAlbum(dz(1, '<b>X</b>', '2026-01-01', ['A'])), null, 'unsafe title ignored');
assert.equal(mapDeezerAlbum(dz(1, 'X', '2026-01-01', ['A'], { link: 'https://evil.example/album/1' })), null, 'non-Deezer link ignored');
const bad = mapDeezerAlbum(dz(1, 'X', '2026-01-01', ['A'], { cover_xl: 'https://evil.example/x.jpg' }));
assert.equal(bad.cover, '', 'non-Deezer cover dropped');

const releases = [
  { slug: 'freed-from-desire', title: 'Freed From Desire', date: '2024-05-31' },
  { slug: 'bang-bang', title: 'Bang Bang', date: '2025-08-08' },
  { slug: 'bang-bang-newire-remix', title: 'Bang Bang (NEWIRE Remix)', date: '2025-10-17' },
  { slug: '2-am', title: '2 AM', date: '2025-08-01' },
];
const albums = [
  dz(617426571, 'Freed From Desire (Extended Mix)', '2024-06-14', ['TiMO ODV', 'Aidin Caye']),
  dz(584424772, 'Freed From Desire', '2024-05-31', ['TiMO ODV', 'Aidin Caye']),
  dz(779444601, 'Bang Bang', '2025-08-08', ['Aidin Caye']),
  dz(826120101, 'Bang Bang (NEWIRE Remix)', '2025-10-17', ['Aidin Caye']),
  dz(779444561, '2 AM (We Like That)', '2025-08-01', ['TiMO ODV']),
  dz(900570522, 'Fast Lane', '2026-01-30', ['Aidin Caye']),
  dz(5, 'Not Ours', '2026-02-01', ['Someone Else']),
].map(mapDeezerAlbum);
const { links, extra } = matchStreaming(releases, albums, roster);
assert.equal(links['freed-from-desire'].deezer, 'https://www.deezer.com/album/584424772', 'earliest Deezer album wins');
assert.equal(links['bang-bang'].deezer, 'https://www.deezer.com/album/779444601');
assert.equal(links['bang-bang-newire-remix'].deezer, 'https://www.deezer.com/album/826120101', 'remix matched to the remix');
assert.equal(links['2-am'].deezer, 'https://www.deezer.com/album/779444561');
assert.deepEqual(extra.map((x) => [x.slug, x.artists.join(), x.date, x.links.deezer, x.tracks[0].duration]), [['fast-lane', 'aidin-caye', '2026-01-30', 'https://www.deezer.com/album/900570522', '2:41']], 'new roster release added; others ignored');

assert.equal(appleUrl({ results: [{ wrapperType: 'collection', collectionViewUrl: 'https://music.apple.com/za/album/fast-lane-single/123?uo=4' }] }), 'https://music.apple.com/za/album/fast-lane-single/123');
assert.equal(appleUrl({ results: [{ wrapperType: 'collection', collectionViewUrl: 'https://evil.example/x' }] }), '');
assert.equal(appleUrl({}), '');
assert.equal(spotifyUrl({ albums: { items: [{ external_urls: { spotify: 'https://open.spotify.com/album/abc' } }] } }), 'https://open.spotify.com/album/abc');
assert.equal(spotifyUrl({ albums: { items: [] } }), '');
console.log('streaming: all tests passed');
