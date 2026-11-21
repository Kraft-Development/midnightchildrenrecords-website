// Reads the label's catalogue from Beatport at build time, so new releases (and pre-orders) appear on the site
// without anyone editing a file. Used by scripts/fetch-data.mjs; tested by scripts/test-beatport.mjs.
//
// Source: the label's public Beatport pages (the label page lists releases, the tracks page lists every mix).
// Only plain facts are kept: titles, mixes, lengths, dates, catalogue numbers, credits, genres, the release's
// Beatport link and its cover image link. Everything is checked again by scripts/validate-content.mjs rules
// (cleanBeatportReleases below), so nothing unsafe can reach the page. src/content/releases.json can override
// any field (matched by catalogue number) and can add releases that aren't on Beatport.

export const LABEL_URL = 'https://www.beatport.com/label/midnight-children-records/111715';
const CONTROL = /[\u0000-\u001f\u007f\u2028\u2029]/;
const IMAGE = /^https:\/\/geo-media\.beatport\.com\/image_size\/(\d{2,4}x\d{2,4}|\{w\}x\{h\})\/([0-9a-f-]{36})\.(jpg|png)$/;
const PLAIN_MIX = /^(original|extended|radio|club|clean|explicit)( mix| edit| version)?$/i;

// The JSON a Next.js page embeds in <script id="__NEXT_DATA__">, or null.
export function nextData(html) {
  const m = String(html || '').match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}
// All `results` lists in the page's prefetched queries (label page: releases; tracks page: tracks).
export function queryResults(data) {
  const qs = data?.props?.pageProps?.dehydratedState?.queries;
  if (!Array.isArray(qs)) return [];
  return qs.map((q) => ({ key: JSON.stringify(q?.queryKey || ''), results: q?.state?.data?.results, count: q?.state?.data?.count }))
    .filter((q) => Array.isArray(q.results));
}

const clean = (v, max) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s && !CONTROL.test(s) && !/[<>]/.test(s) && Array.from(s).length <= max ? s : '';
};
const names = (list) => (Array.isArray(list) ? list : []).map((a) => clean(a?.name, 60)).filter(Boolean);
const day = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10) : '');
const imageUrl = (img) => {
  const u = String(img?.dynamic_uri || img?.uri || img?.image_url || img || '');
  const m = u.match(IMAGE);
  return m ? `https://geo-media.beatport.com/image_size/1400x1400/${m[2]}.${m[3]}` : '';
};
const duration = (ms) => {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0 || n > 3 * 3600e3) return '';
  const s = Math.round(n / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
export const slugify = (s) => String(s).replace(/&/g, ' and ').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
export const joinNames = (list) => (list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} & ${list.at(-1)}`);
// "MCR013D" / "MCR013S" -> "MCR013"; other numbers (distributor ids) -> ''
export const baseCatalogue = (c) => { const m = String(c || '').toUpperCase().match(/^(MCR\d{3,4})[A-Z]?$/); return m ? m[1] : ''; };
// "Better (Extended Mix)" -> "Better"; "Bang Bang (NEWIRE Remix)" stays.
export const releaseTitle = (name) => {
  const s = clean(name, 120);
  const m = s.match(/^(.*?)\s*\(([^()]+)\)$/);
  return m && PLAIN_MIX.test(m[2].trim()) ? m[1] : s;
};
const mixOrder = (mix) => { const m = String(mix).toLowerCase(); return m.startsWith('radio') ? 0 : m.startsWith('original') ? 1 : m.startsWith('extended') ? 2 : 3; };
const nicer = (a, b) => (/[A-Z]/.test(b) && !/[A-Z]/.test(a) ? b : a); // prefer "Ye Yeah" over "ye yeah"

// Beatport release + track objects -> releases in the releases.json shape (newest first).
export function mapCatalogue(rawReleases, rawTracks, roster = [], today = new Date().toISOString().slice(0, 10)) {
  const slugByName = new Map(roster.map((a) => [String(a.name).toLowerCase(), a.slug]));
  const rels = new Map(); // beatport release id -> info
  const add = (r) => {
    const id = Number(r?.id);
    if (!Number.isInteger(id) || id <= 0) return;
    const prev = rels.get(id) || {};
    rels.set(id, {
      id,
      name: clean(r.name, 100) || prev.name || '',
      slug: /^[a-z0-9-]{1,120}$/.test(r.slug || '') ? r.slug : prev.slug || '',
      catalogue: clean(r.catalog_number, 20) || prev.catalogue || '',
      date: day(r.new_release_date || r.release_date) || prev.date || '',
      artists: names(r.artists).length ? names(r.artists) : prev.artists || [],
      image: imageUrl(r.image || r.image_url) || prev.image || '',
      desc: typeof r.desc === 'string' ? r.desc : prev.desc || '',
      tracks: prev.tracks || [],
    });
  };
  for (const r of rawReleases || []) add(r);
  for (const t of rawTracks || []) {
    const rel = t?.release;
    if (!rel?.id) continue;
    if (!rels.has(Number(rel.id))) add({ ...rel, catalog_number: t.catalog_number, new_release_date: t.new_release_date, artists: t.artists });
    const info = rels.get(Number(rel.id));
    if (!info) continue;
    const name = clean(t.name, 100), mix = clean(t.mix_name, 60);
    if (!name) continue;
    info.tracks.push({ name, mix, length: duration(t.length_ms ?? t.track_length_ms), genre: clean(t.genre?.name, 40), artists: names(t.artists) });
  }

  // Group the Beatport entries into one release per catalogue number (MCR013D + MCR013S = MCR013). Entries with a
  // distributor number instead join the MCR release with the same title and date.
  const groups = new Map();
  const list = [...rels.values()].filter((r) => r.name && r.date);
  for (const r of list.filter((x) => baseCatalogue(x.catalogue))) {
    const key = baseCatalogue(r.catalogue);
    groups.set(key, [...(groups.get(key) || []), r]);
  }
  for (const r of list.filter((x) => !baseCatalogue(x.catalogue))) {
    const t = releaseTitle(r.name).toLowerCase();
    const match = [...groups.entries()].find(([, g]) => g.some((x) => releaseTitle(x.name).toLowerCase() === t && x.date === r.date));
    if (match) match[1].push(r);
    else groups.set(`id-${r.id}`, [r]);
  }

  const out = [];
  for (const [key, g] of groups) {
    // The main entry: the plain catalogue number first (MCR005 over MCR005D), then the one with the most mixes.
    const main = [...g].sort((a, b) => (Number(b.catalogue === key) - Number(a.catalogue === key)) || (b.tracks.length - a.tracks.length) || a.id - b.id)[0];
    const title = g.map((x) => releaseTitle(x.name)).reduce(nicer);
    const tracks = new Map();
    for (const x of g) for (const t of x.tracks) {
      const k = `${t.name.toLowerCase()}|${t.mix.toLowerCase()}`;
      if (!tracks.has(k)) tracks.set(k, { ...t, name: tracks.get(k)?.name ? nicer(tracks.get(k).name, t.name) : t.name });
    }
    const ordered = [...tracks.values()].sort((a, b) => mixOrder(a.mix) - mixOrder(b.mix));
    const credits = main.artists.length ? main.artists : ordered[0]?.artists || [];
    const genres = ordered.map((t) => t.genre).filter(Boolean);
    const genre = genres.sort((a, b) => genres.filter((x) => x === b).length - genres.filter((x) => x === a).length)[0] || '';
    const date = g.map((x) => x.date).sort()[0];
    out.push({
      slug: slugify(title) || `release-${main.id}`,
      title,
      artists: [...new Set(credits.map((n) => slugByName.get(n.toLowerCase())).filter(Boolean))],
      credit: joinNames(credits),
      featuring: [],
      type: 'Single',
      date,
      catalogue: baseCatalogue(main.catalogue),
      genre,
      cover: '',
      artwork: main.image || g.map((x) => x.image).find(Boolean) || '',
      description: summary(g.map((x) => x.desc).find((d) => d && !/^The release ".*" by .* consists of \d+ tracks?\.?$/.test(d.trim())) || ''),
      tracks: ordered.map((t) => ({ title: t.mix ? `${t.name} (${t.mix})` : t.name, duration: t.length })),
      links: main.slug ? { beatport: `https://www.beatport.com/release/${main.slug}/${main.id}` } : {},
      ...(date > today ? { preorder: true } : {}),
    });
  }
  // Slugs must be unique: a clash gets its catalogue number added.
  const seen = new Set();
  for (const r of out) { if (seen.has(r.slug)) r.slug = `${r.slug}-${(r.catalogue || String(Math.random()).slice(2, 6)).toLowerCase()}`; seen.add(r.slug); }
  return out.filter((r) => r.artists.length).sort((a, b) => b.date.localeCompare(a.date) || b.catalogue.localeCompare(a.catalogue));
}

// First paragraph of the label's Beatport text, cut at a sentence end, plain text only.
export function summary(desc, max = 420) {
  const first = String(desc || '').replace(/\\n/g, '\n').split(/\n\s*\n|\n/).map((p) => p.trim()).find((p) => p && !/^(artist|title|genre|release date)\s*:/i.test(p)) || '';
  const s = first.replace(/<[^>]*>/g, '').replace(/[<>]/g, '').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  if (Array.from(s).length <= max) return s;
  const cut = Array.from(s).slice(0, max).join('');
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return end > 80 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…';
}

// Final list: Beatport entries, with any field set in releases.json (same catalogue number) taking priority,
// plus releases.json entries that Beatport doesn't have.
export function mergeReleases(beatport = [], manual = []) {
  const byCat = new Map(manual.filter((m) => m?.catalogue).map((m) => [m.catalogue, m]));
  const used = new Set();
  const out = beatport.map((b) => {
    const m = byCat.get(b.catalogue);
    if (!m) return b;
    used.add(m);
    const merged = { ...b };
    for (const [k, v] of Object.entries(m)) {
      if (k === 'links') merged.links = { ...(b.links || {}), ...(v || {}) };
      else if (Array.isArray(v) ? v.length : v !== '' && v != null) merged[k] = v;
    }
    return merged;
  });
  for (const m of manual) if (!used.has(m)) out.push(m);
  return out;
}

const getHtml = async (url, ua) => {
  const r = await fetch(url, { headers: { 'User-Agent': ua, Accept: 'text/html' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} from Beatport`);
  return r.text();
};
// Fetches the label page (releases) and every page of the tracks list (all mixes).
export async function fetchCatalogue(ua, roster) {
  const label = nextData(await getHtml(LABEL_URL, ua));
  if (!label) throw new Error('Beatport label page had no data (blocked or changed)');
  const releases = queryResults(label).filter((q) => q.key.includes('releases')).flatMap((q) => q.results);
  const tracks = [];
  for (let page = 1; page <= 20; page++) {
    const data = nextData(await getHtml(`${LABEL_URL}/tracks?page=${page}&per_page=100`, ua));
    const q = queryResults(data).find((x) => x.key.includes('tracks'));
    if (!q || !q.results.length) break;
    tracks.push(...q.results);
    if (tracks.length >= (Number(q.count) || 0) || q.results.length < 25) break;
  }
  if (!releases.length && !tracks.length) throw new Error('Beatport returned no releases');
  return mapCatalogue(releases, tracks, roster);
}
