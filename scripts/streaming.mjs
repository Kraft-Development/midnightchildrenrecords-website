// Finds where each release can be streamed, and picks up new releases, at build time. Used by scripts/fetch-data.mjs;
// tested by scripts/test-streaming.mjs.
//
// Beatport blocks automated reads from build servers, so releases.json (checked against Beatport) stays the
// reference, and these open sources fill in the rest:
//   - Deezer: every album with the label "Midnight Children Records" (no key needed). Gives the Deezer link, the
//     barcode (UPC), and new releases that aren't on the site yet (with their cover and tracks).
//   - Apple Music: looked up by barcode in Apple's public catalogue (no key needed).
//   - Spotify: looked up by barcode, only if SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are set as Cloudflare
//     build secrets (free developer keys; never in the repo or logs).
// Only links on the platforms' own domains are kept, and every text is cleaned, so nothing unsafe reaches the page.

export const LABEL_NAME = 'Midnight Children Records';
const CONTROL = /[\u0000-\u001f\u007f\u2028\u2029]/;
const clean = (v, max) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s && !CONTROL.test(s) && !/[<>]/.test(s) && Array.from(s).length <= max ? s : '';
};
const safeUrl = (u, host) => {
  try {
    const x = new URL(String(u));
    return x.protocol === 'https:' && !x.username && host.test(x.hostname) ? `${x.origin}${x.pathname}` : '';
  } catch { return ''; }
};
const DEEZER = /^(www\.)?deezer\.com$/;
const APPLE = /^music\.apple\.com$/;
const SPOTIFY = /^open\.spotify\.com$/;
const DEEZER_COVER = /^https:\/\/(cdn-images|e-cdns-images)\.dzcdn\.net\/images\/cover\/[0-9a-f]{32}\/\d{2,4}x\d{2,4}-[0-9a-z-]+\.jpg$/;
const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
const dur = (s) => { const n = Number(s); return Number.isFinite(n) && n > 0 && n < 3 * 3600 ? `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}` : ''; };
const joinNames = (l) => (l.length <= 1 ? l.join('') : `${l.slice(0, -1).join(', ')} & ${l.at(-1)}`);
export const slugify = (s) => String(s).replace(/&/g, ' and ').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

// Titles compared loosely: "Freed From Desire (Extended Mix)" = "Freed From Desire"; "2 AM (We Like That)" = "2 AM".
// A remix stays its own release: "Bang Bang (NEWIRE Remix)" is not "Bang Bang".
export const titleKey = (t) => String(t || '').toLowerCase()
  .replace(/\s*[([]([^)\]]*)[)\]]\s*$/, (m, inner) => (/remix|rework|edit\b|vip/.test(inner) && !/^(radio|extended|original|club) (mix|edit)$/.test(inner.trim()) ? ` ${inner}` : ''))
  .replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();

// Deezer album objects (search result + album details) -> { title, date, upc, link, cover, credit, names, tracks }
export function mapDeezerAlbum(a) {
  if (!a || clean(a.label, 80).toLowerCase() !== LABEL_NAME.toLowerCase()) return null;
  const title = clean(a.title, 100);
  const link = safeUrl(a.link, DEEZER);
  const date = day(a.release_date);
  if (!title || !link || !date) return null;
  const names = [...new Set((a.contributors || []).filter((c) => !c.role || /main|featured/i.test(c.role)).map((c) => clean(c.name, 60)).filter(Boolean))];
  if (!names.length && a.artist?.name) names.push(clean(a.artist.name, 60));
  return {
    title, date, link,
    upc: /^\d{8,14}$/.test(String(a.upc || '')) ? String(a.upc) : '',
    cover: DEEZER_COVER.test(a.cover_xl || '') ? a.cover_xl : '',
    names,
    tracks: (a.tracks?.data || []).slice(0, 30).map((t) => ({ title: clean([t.title, t.title_version].filter(Boolean).join(' '), 100), duration: dur(t.duration) })).filter((t) => t.title),
  };
}

// Matches Deezer albums to the site's releases. Returns { links: { slug: { deezer, appleMusic?, spotify? } }, extra: [new releases] }.
// Several Deezer albums for one release (e.g. original and extended): the earliest one gives the link.
export function matchStreaming(releases, albums, roster = []) {
  const slugByName = new Map(roster.map((a) => [a.name.toLowerCase(), a.slug]));
  const links = {};
  const extra = [];
  const days = (a, b) => Math.abs(new Date(a) - new Date(b)) / 864e5;
  for (const al of [...albums].sort((a, b) => a.date.localeCompare(b.date))) {
    const k = titleKey(al.title);
    const cands = releases.filter((r) => titleKey(r.title) === k);
    const r = cands.find((x) => !/^\d{4}-\d{2}-\d{2}$/.test(x.date) || days(x.date, al.date) <= 45) || (cands.length === 1 ? cands[0] : null);
    if (r) {
      if (!links[r.slug]) links[r.slug] = { deezer: al.link, upc: al.upc };
      continue;
    }
    // Not on the site yet: add it, if someone on the roster is credited.
    const artists = [...new Set(al.names.map((n) => slugByName.get(n.toLowerCase())).filter(Boolean))];
    if (!artists.length) continue;
    const same = extra.find((x) => titleKey(x.title) === k);
    if (same) continue;
    let slug = slugify(al.title) || 'release';
    if (releases.some((x) => x.slug === slug) || extra.some((x) => x.slug === slug)) slug = `${slug}-${al.date.slice(0, 4)}`;
    extra.push({
      slug, title: al.title, artists, credit: joinNames(al.names), featuring: [], type: 'Single', date: al.date, catalogue: '',
      cover: '', artwork: al.cover, description: '', tracks: al.tracks, links: { deezer: al.link }, upc: al.upc,
    });
  }
  return { links, extra };
}

export const appleUrl = (j) => safeUrl(j?.results?.find((x) => x.wrapperType === 'collection')?.collectionViewUrl, APPLE);
export const spotifyUrl = (j) => safeUrl(j?.albums?.items?.[0]?.external_urls?.spotify, SPOTIFY);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = async (url, opts = {}) => {
  const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).hostname}`);
  return r.json();
};

// Everything at once, for the build. Never throws for one bad lookup; the caller keeps the old file if it throws.
export async function fetchStreaming(releases, roster, { ua, spotifyId, spotifySecret, log = () => {} } = {}) {
  const found = await getJson(`https://api.deezer.com/search/album?q=${encodeURIComponent(`label:"${LABEL_NAME}"`)}&limit=100`, { headers: { 'User-Agent': ua } });
  const albums = [];
  for (const s of (found?.data || []).slice(0, 100)) {
    try { const a = mapDeezerAlbum(await getJson(`https://api.deezer.com/album/${Number(s.id)}`, { headers: { 'User-Agent': ua } })); if (a) albums.push(a); }
    catch (e) { log('deezer album skipped:', e.message); }
    await wait(150);
  }
  if (!albums.length) throw new Error('Deezer returned no albums for the label');
  const { links, extra } = matchStreaming(releases, albums, roster);

  let token = '';
  if (spotifyId && spotifySecret) {
    try {
      const t = await getJson('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${spotifyId}:${spotifySecret}`).toString('base64')}` },
        body: 'grant_type=client_credentials',
      });
      token = typeof t.access_token === 'string' ? t.access_token : '';
    } catch (e) { log('spotify: token request failed; skipping Spotify'); }
  }
  const targets = [...Object.values(links), ...extra.map((x) => (x.links))];
  const upcOf = new Map([...Object.values(links).map((l) => [l, l.upc]), ...extra.map((x) => [x.links, x.upc])]);
  for (const l of targets) {
    const upc = upcOf.get(l);
    if (!upc) continue;
    try { const a = appleUrl(await getJson(`https://itunes.apple.com/lookup?upc=${upc}&entity=album&country=za`)); if (a) l.appleMusic = a; }
    catch (e) { log('apple music lookup skipped:', e.message); }
    if (token) {
      try { const s = spotifyUrl(await getJson(`https://api.spotify.com/v1/search?type=album&limit=1&q=${encodeURIComponent(`upc:${upc}`)}`, { headers: { Authorization: `Bearer ${token}` } })); if (s) l.spotify = s; }
      catch (e) { log('spotify lookup skipped:', e.message); }
    }
    await wait(3200); // Apple allows about 20 lookups a minute
  }
  for (const l of Object.values(links)) delete l.upc;
  for (const x of extra) delete x.upc;
  return { links, extra };
}
