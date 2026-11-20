import assert from 'node:assert/strict';
import { mapInstagram, clip, GALLERY_COUNT } from './fetch-data.mjs';

const ig = mapInstagram([
  { media_type: 'VIDEO', media_url: 'https://x/v.mp4', thumbnail_url: 'https://cdn.example/v-cover.jpg', timestamp: '2026-11-10T10:00:00+0000' },
  { media_type: 'VIDEO', media_url: 'https://x/v2.mp4', timestamp: '2026-11-10T11:00:00+0000' },
  { media_type: 'IMAGE', media_url: 'https://cdn.example/a.jpg', permalink: 'https://www.instagram.com/p/AAA/', timestamp: '2026-11-09T10:00:00+0000', caption: 'CULTURE was <b>loud</b> #benoni @someone  thank you!' },
  { media_type: 'CAROUSEL_ALBUM', media_url: 'https://cdn.example/b.jpg', permalink: 'https://evil.example/p/1', timestamp: '2026-11-11T10:00:00+0000' },
  { media_type: 'IMAGE', media_url: 'http://insecure/c.jpg', timestamp: '2026-11-12T10:00:00+0000' },
]);
assert.equal(ig.length, 3);
assert.equal(ig[0].mediaUrl, 'https://cdn.example/b.jpg'); assert.equal(ig[0].url, '', 'non-instagram permalink dropped');
assert.equal(ig[0].alt, 'Photo from Midnight Children Records on Instagram');
assert.equal(ig[1].mediaUrl, 'https://cdn.example/v-cover.jpg', 'video uses its cover image');
assert.equal(ig[2].alt, 'CULTURE was bloud/b thank you!', 'tags and angle brackets removed');
assert.equal(mapInstagram(Array.from({ length: 20 }, (_, i) => ({ media_type: 'IMAGE', media_url: `https://c/${i}.jpg`, timestamp: String(i) }))).length, GALLERY_COUNT);
const emoji = 'a'.repeat(109) + '😀😀';
assert.equal(clip(emoji, 110), 'a'.repeat(109) + '😀', 'keeps whole emoji');
assert.equal(clip('a\uD83D', 5), 'a', 'drops lone surrogate');
assert.equal(clip(null, 5), '');
console.log('fetch-data: all tests passed');
