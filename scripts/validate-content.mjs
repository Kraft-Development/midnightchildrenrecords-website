// Checks the content files that owners and the caretaker edit (src/content/*.json and about.md).
// Runs in `npm test` on every pull request, so a bad entry never reaches the live site.
// Usage: node scripts/validate-content.mjs   (exit code 1 on any error)
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cleanEvents, cleanDeclined } from './events.mjs';

const root = process.env.CONTENT_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

function readJson(rel) {
  try { return JSON.parse(readFileSync(join(root, rel), 'utf8')); }
  catch (e) { err(rel, `is not valid JSON (${e.message})`); return null; }
}

// Hosts each link type may point to. Anything else is rejected.
export const LINK_HOSTS = {
  spotify: ['open.spotify.com'],
  appleMusic: ['music.apple.com'],
  youtube: ['www.youtube.com', 'youtube.com', 'music.youtube.com', 'youtu.be'],
  soundcloud: ['soundcloud.com', 'on.soundcloud.com'],
  bandcamp: ['bandcamp.com'],
  beatport: ['www.beatport.com', 'beatport.com'],
  instagram: ['www.instagram.com', 'instagram.com'],
  tiktok: ['www.tiktok.com', 'tiktok.com'],
  facebook: ['www.facebook.com', 'facebook.com'],
  twitch: ['www.twitch.tv', 'twitch.tv'],
  kitUrl: ['drive.google.com', 'www.dropbox.com', 'dropbox.com'],
};
const hostOk = (host, allowed) => allowed.some((h) => host === h || host.endsWith('.' + h));

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DURATION = /^\d{1,2}:\d{2}$/;
const CATALOGUE = /^[A-Z]{2,6}\d{1,5}$/;
const TYPES = ['Single', 'EP', 'Album', 'Compilation', 'Remix'];
// No HTML, no control characters and no unpaired surrogates (a half-cut emoji once broke a production build).
const BAD_TEXT = /[<>]|[\u0000-\u0008\u000B\u000C\u000E-\u001F]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const len = (s) => Array.from(s).length;

function text(where, value, { max = 200, required = false, multiline = false } = {}) {
  if (value === undefined || value === null || value === '') { if (required) err(where, 'is required'); return; }
  if (typeof value !== 'string') return err(where, 'must be text');
  if (BAD_TEXT.test(value)) err(where, 'contains HTML or invalid characters');
  if (!multiline && /\n/.test(value)) err(where, 'must be one line');
  if (len(value) > max) err(where, `is longer than ${max} characters`);
  if (/^SAMPLE:/i.test(value)) warn(where, 'still has sample text');
}

function link(where, key, value) {
  if (value === '' || value === undefined) return;
  if (typeof value !== 'string') return err(where, 'must be a link');
  let u;
  try { u = new URL(value); } catch { return err(where, 'is not a valid link'); }
  if (u.protocol !== 'https:') return err(where, 'must start with https://');
  if (u.username || u.password) return err(where, 'must not contain a user name or password');
  const allowed = LINK_HOSTS[key];
  if (!allowed) return err(where, `unknown link type "${key}"`);
  if (!hostOk(u.hostname, allowed)) err(where, `must be a ${allowed[0]} link`);
}

function image(where, value) {
  if (!value) return;
  if (!/^\/img\/[a-z0-9/_-]+\.(jpg|jpeg|png|webp|avif)$/.test(value)) return err(where, 'must be a path like /img/artists/name.jpg');
  if (!existsSync(join(root, 'public', value))) err(where, `file public${value} does not exist`);
}

function validDate(s) {
  if (!DATE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// ---------- label.json ----------
const label = readJson('src/content/label.json');
if (label) {
  if (typeof label.launched !== 'boolean') err('label.launched', 'must be true or false');
  text('label.name', label.name, { required: true, max: 80 });
  text('label.shortName', label.shortName, { required: true, max: 40 });
  text('label.tagline', label.tagline, { max: 160 });
  text('label.location', label.location, { max: 80 });
  text('label.founded', label.founded, { max: 4 });
  if (label.founded && !/^\d{4}$/.test(label.founded)) err('label.founded', 'must be a year like 2024');
  for (const [k, v] of Object.entries(label.company || {})) text(`label.company.${k}`, v, { max: 200 });
  for (const [k, v] of Object.entries(label.socials || {})) link(`label.socials.${k}`, k, v);
  link('label.press.kitUrl', 'kitUrl', label.press?.kitUrl);
  const d = label.demos || {};
  if (typeof d.open !== 'boolean') err('label.demos.open', 'must be true or false');
  (d.genres || []).forEach((g, i) => text(`label.demos.genres[${i}]`, g, { required: true, max: 40 }));
  text('label.demos.replyNote', d.replyNote, { max: 240 });
  if (!Array.isArray(d.allowedHosts) || !d.allowedHosts.length) err('label.demos.allowedHosts', 'needs at least one host');
  (d.allowedHosts || []).forEach((h, i) => { if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(h)) err(`label.demos.allowedHosts[${i}]`, 'must be a plain host name like soundcloud.com'); });
  if (label.launched) {
    for (const k of ['legalName', 'registrationNumber', 'informationOfficer']) if (!label.company?.[k]) err(`label.company.${k}`, 'is required before launch');
  }
}

// ---------- artists.json ----------
const artists = readJson('src/content/artists.json');
const artistSlugs = new Set();
if (artists) {
  if (!Array.isArray(artists)) err('artists.json', 'must be a list');
  else artists.forEach((a, i) => {
    const w = `artists[${i}]${a?.slug ? ` (${a.slug})` : ''}`;
    if (!a || typeof a !== 'object') return err(w, 'must be an object');
    if (!SLUG.test(a.slug || '')) err(`${w}.slug`, 'must be lowercase letters, numbers and dashes');
    else if (artistSlugs.has(a.slug)) err(`${w}.slug`, 'is used twice');
    else artistSlugs.add(a.slug);
    text(`${w}.name`, a.name, { required: true, max: 60 });
    text(`${w}.genre`, a.genre, { max: 60 });
    if (!['founder', 'friend'].includes(a.tier)) err(`${w}.tier`, 'must be founder or friend');
    if (a.website) { try { const u = new URL(a.website); if (u.protocol !== 'https:' || u.username) err(`${w}.website`, 'must be an https link'); } catch { err(`${w}.website`, 'is not a valid link'); } }
    text(`${w}.city`, a.city, { max: 60 });
    text(`${w}.short`, a.short, { max: 140 });
    text(`${w}.bio`, a.bio, { max: 2500, multiline: true });
    image(`${w}.image`, a.image);
    text(`${w}.imageCredit`, a.imageCredit, { max: 80 });
    if (a.image && !a.imageCredit) warn(`${w}.imageCredit`, 'photo has no credit');
    for (const [k, v] of Object.entries(a.links || {})) link(`${w}.links.${k}`, k, v);
    if (a.sample && label?.launched) err(w, 'sample artist must be removed before launch');
  });
}

// ---------- releases.json ----------
const releases = readJson('src/content/releases.json');
if (releases) {
  const slugs = new Set();
  const cats = new Set();
  if (!Array.isArray(releases)) err('releases.json', 'must be a list');
  else releases.forEach((r, i) => {
    const w = `releases[${i}]${r?.slug ? ` (${r.slug})` : ''}`;
    if (!r || typeof r !== 'object') return err(w, 'must be an object');
    if (!SLUG.test(r.slug || '')) err(`${w}.slug`, 'must be lowercase letters, numbers and dashes');
    else if (slugs.has(r.slug)) err(`${w}.slug`, 'is used twice');
    else slugs.add(r.slug);
    text(`${w}.title`, r.title, { required: true, max: 100 });
    if (!Array.isArray(r.artists) || !r.artists.length) err(`${w}.artists`, 'needs at least one roster artist');
    else r.artists.forEach((s) => { if (!artistSlugs.has(s)) err(`${w}.artists`, `"${s}" is not in artists.json`); });
    (r.featuring || []).forEach((f, j) => text(`${w}.featuring[${j}]`, f, { required: true, max: 60 }));
    if (!TYPES.includes(r.type)) err(`${w}.type`, `must be one of ${TYPES.join(', ')}`);
    if (!validDate(r.date || '') && !/^\d{4}$/.test(r.date || '')) err(`${w}.date`, 'must be a real date like 2026-11-14 (or just the year, 2026, until the date is confirmed)');
    if (r.catalogue) {
      if (!CATALOGUE.test(r.catalogue)) err(`${w}.catalogue`, 'must look like MCR001');
      else if (cats.has(r.catalogue)) err(`${w}.catalogue`, 'is used twice');
      else cats.add(r.catalogue);
    }
    image(`${w}.cover`, r.cover);
    text(`${w}.description`, r.description, { max: 600, multiline: true });
    (r.tracks || []).forEach((t, j) => {
      text(`${w}.tracks[${j}].title`, t?.title, { required: true, max: 100 });
      if (t?.duration && !DURATION.test(t.duration)) err(`${w}.tracks[${j}].duration`, 'must look like 5:30');
    });
    for (const [k, v] of Object.entries(r.links || {})) link(`${w}.links.${k}`, k, v);
    if (r.sample && label?.launched) err(w, 'sample release must be removed before launch');
  });
}

// ---------- events.json (same rules the site uses when building) ----------
const eventsRaw = readJson('src/content/events.json');
if (eventsRaw) for (const p of cleanEvents(eventsRaw, { artistSlugs }).problems) err('events.json', p);
const declined = readJson('src/content/events.declined.json');
if (declined) for (const p of cleanDeclined(declined).problems) err('events.declined.json', p);

// ---------- gallery.json (written by the build from the label's Instagram) ----------
const gallery = readJson('src/content/gallery.json');
if (gallery) {
  if (!Array.isArray(gallery)) err('gallery.json', 'must be a list');
  else gallery.forEach((g, i) => {
    if (!/^\/img\/gallery\/ig-\d+\.jpg$/.test(g?.src || '')) err(`gallery[${i}].src`, 'must be /img/gallery/ig-N.jpg');
    if (g?.url && !/^https:\/\/(www\.)?instagram\.com\//.test(g.url)) err(`gallery[${i}].url`, 'must be an instagram.com link');
    text(`gallery[${i}].alt`, g?.alt, { max: 140 });
  });
}

// ---------- about.md ----------
try {
  const about = readFileSync(join(root, 'src/content/about.md'), 'utf8');
  if (/<[a-z!/]/i.test(about)) err('about.md', 'must not contain HTML');
  if (/\]\(|https?:\/\//i.test(about)) err('about.md', 'must not contain links');
  if (len(about) > 4000) err('about.md', 'is longer than 4000 characters');
  if (/SAMPLE:/.test(about)) warn('about.md', 'still has sample text');
} catch { err('about.md', 'is missing'); }

for (const w of warnings) console.log(`warning  ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`ERROR    ${e}`);
  console.error(`\n${errors.length} problem(s) in the content files.`);
  process.exit(1);
}
console.log(`Content OK (${artistSlugs.size} artists, ${releases?.length ?? 0} releases, ${warnings.length} warning(s)).`);
