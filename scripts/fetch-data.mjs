// Build-time data fetch. Runs before `astro build` / `astro dev` (npm "prebuild"/"predev").
//   Beatport  -> public/img/covers/<slug>.jpg, the official cover for every release that has an `artwork` link.
//   Instagram -> src/content/gallery.json (+ public/img/gallery/ig-N.jpg), from the label's official account only.
//   Needs INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID as Cloudflare build variables (never in the repo).
//   Without them, the existing gallery.json is kept (empty = the site shows a "Follow us" block instead).
// Nothing here may break the build: every step is wrapped, and the previous file is kept on any failure.
// Images are downloaded and served from our own domain, so the strict CSP (img-src 'self') still holds.
import { writeFile, readFile, mkdir, rm, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'src/content');
const IMG = path.join(ROOT, 'public/img');
const UA = 'Mozilla/5.0 (compatible; midnightchildrenrecords-site-build/1.0)';
export const GALLERY_COUNT = 8;
const env = process.env;
const log = (...a) => console.log('[fetch-data]', ...a);

// Cuts text to max code points without splitting an emoji, and drops any lone surrogate.
export const clip = (s, max) => Array.from(String(s ?? '').replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')).slice(0, max).join('');

const getJson = async (url, opts = {}) => {
  const r = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) {
    let detail = '';
    try { const j = await r.json(); detail = j?.error?.message || ''; } catch {}
    throw new Error(`${r.status} ${String(url).split('?')[0]} ${String(detail).replace(/[A-Za-z0-9_\-]{40,}/g, '[redacted]').slice(0, 200)}`.trim());
  }
  return r.json();
};
const download = async (url, file, minBytes = 5000) => {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${r.status} image download`);
  if (!/^image\/(jpeg|jpg|png|webp)/.test(r.headers.get('content-type') || '')) throw new Error('not an image');
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < minBytes || buf.length > 8e6) throw new Error('unexpected image size');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, buf);
};

// ---------- Instagram ----------
export function mapInstagram(items) {
  // Photos use media_url; videos and reels use their cover image (thumbnail_url).
  const imageOf = (m) => (m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url);
  return (items || [])
    .filter((m) => m && ['IMAGE', 'CAROUSEL_ALBUM', 'VIDEO'].includes(m.media_type) && /^https:\/\//.test(imageOf(m) || ''))
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
    .slice(0, GALLERY_COUNT)
    .map((m) => ({
      mediaUrl: imageOf(m),
      url: /^https:\/\/(www\.)?instagram\.com\//.test(m.permalink || '') ? m.permalink : '',
      alt: clip(String(m.caption || '').replace(/[#@]\S+/g, '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim(), 110).trim() || 'Photo from Midnight Children Records on Instagram',
    }));
}

async function instagramGallery() {
  const token = env.INSTAGRAM_ACCESS_TOKEN;
  const igId = String(env.INSTAGRAM_USER_ID || '').replace(/\D/g, '');
  if (!token || !igId) throw new Error('INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_USER_ID not set');
  // The token goes in a header, never the URL, so it cannot leak into build logs through error messages.
  const headers = { Authorization: `Bearer ${token}` };
  const fields = 'id,media_type,media_url,thumbnail_url,permalink,timestamp,caption';
  const endpoints = [
    `https://graph.facebook.com/v21.0/${igId}/media?fields=${fields}&limit=40`,
    `https://graph.instagram.com/v21.0/me/media?fields=${fields}&limit=40`,
  ];
  let data = null;
  for (const url of endpoints) {
    try { data = await getJson(url, { headers }); break; }
    catch (e) { log('instagram endpoint failed:', e.message.replace(/\?.*$/, '')); }
  }
  if (!data) throw new Error('instagram: no endpoint accepted the token');
  const picks = mapInstagram(data.data);
  if (picks.length < 4) { log(`instagram: only ${picks.length} usable posts; keeping existing`); return null; }
  const tmp = path.join(IMG, 'gallery-new');
  await rm(tmp, { recursive: true, force: true });
  const out = [];
  for (const [i, m] of picks.entries()) {
    await download(m.mediaUrl, path.join(tmp, `ig-${i + 1}.jpg`)); // any failure aborts: never publish a half-broken gallery
    out.push({ src: `/img/gallery/ig-${i + 1}.jpg`, alt: m.alt, url: m.url });
  }
  await rm(path.join(IMG, 'gallery'), { recursive: true, force: true });
  await rename(tmp, path.join(IMG, 'gallery'));
  return out;
}

// ---------- Release covers (Beatport) ----------
// 1000px is plenty for a 32rem cover at 2x; Beatport serves any size from the same image id.
export const coverUrl = (artwork) => String(artwork).replace(/\/image_size\/\d+x\d+\//, '/image_size/1000x1000/');
const ARTWORK = /^https:\/\/geo-media\.beatport\.com\/image_size\/\d{2,4}x\d{2,4}\/[0-9a-f-]{36}\.(jpg|png)$/;
export async function releaseCovers(releases, dir = path.join(IMG, 'covers')) {
  let got = 0, kept = 0, failed = 0;
  for (const r of releases) {
    if (!r?.artwork || !ARTWORK.test(r.artwork) || !/^[a-z0-9-]+$/.test(r.slug || '')) continue;
    const file = path.join(dir, `${r.slug}.jpg`);
    if (existsSync(file)) { kept++; continue; }
    try { await download(coverUrl(r.artwork), file); got++; }
    catch (e) { failed++; log(`cover ${r.slug} skipped:`, e.message); } // placeholder tile is shown instead
  }
  log(`release covers: ${got} downloaded, ${kept} already there, ${failed} failed`);
}

async function step(name, file, fn, fallback) {
  const target = path.join(CONTENT, file);
  try {
    const data = await fn();
    if (data && (!Array.isArray(data) || data.length)) { await writeFile(target, JSON.stringify(data, null, 2) + '\n'); log(name, 'updated'); return; }
    log(name, 'returned nothing; keeping existing');
  } catch (e) { log(name, 'skipped, keeping existing:', e.message); }
  if (!existsSync(target)) await writeFile(target, JSON.stringify(fallback, null, 2) + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { await releaseCovers(JSON.parse(await readFile(path.join(CONTENT, 'releases.json'), 'utf8'))); }
  catch (e) { log('release covers skipped:', e.message); }
  await step('instagram gallery', 'gallery.json', instagramGallery, []);
}
