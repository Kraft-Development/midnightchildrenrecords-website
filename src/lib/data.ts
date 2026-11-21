// Reads the content files once and gives pages tidy, sorted data.
import labelJson from '../content/label.json';
import artistsJson from '../content/artists.json';
import releasesJson from '../content/releases.json';
import beatportJson from '../content/releases.beatport.json';
import streamingJson from '../content/releases.streaming.json';
import { mergeReleases } from '../../scripts/beatport.mjs';
import eventsJson from '../content/events.json';
import galleryJson from '../content/gallery.json';
import { cleanEvents, isUpcomingEvent, startIso } from '../../scripts/events.mjs';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const label = labelJson;

export type Links = Record<string, string>;
export interface Artist { slug: string; name: string; tier: 'founder' | 'friend'; website?: string; genre?: string; city?: string; short?: string; bio?: string; image?: string; imageCredit?: string; links?: Links; sample?: boolean; }
export interface Track { title: string; duration?: string; }
export interface Release { slug: string; title: string; artists: string[]; credit?: string; featuring?: string[]; type: string; date: string; catalogue?: string; genre?: string; cover?: string; artwork?: string; preorder?: boolean; description?: string; tracks?: Track[]; links?: Links; sample?: boolean; }

export const artists: Artist[] = artistsJson as Artist[];
export const founders = artists.filter((a) => a.tier === 'founder');
export const friends = artists.filter((a) => a.tier !== 'founder');
export const TIER_LABEL = { founder: 'Founder', friend: 'Friend' } as const;
const bySlug = new Map(artists.map((a) => [a.slug, a]));
export const artistBySlug = (s: string) => bySlug.get(s);

// Newest first. Releases dated in the future are shown as "Out <date>".
// Official cover art is downloaded from Beatport at build time (scripts/fetch-data.mjs) into /img/covers/<slug>.jpg.
// A cover set by hand in releases.json wins; with neither, the branded placeholder tile is shown.
const coverFor = (r: Release) => r.cover || (existsSync(path.join(process.cwd(), 'public/img/covers', `${r.slug}.jpg`)) ? `/img/covers/${r.slug}.jpg` : '');
// Streaming links found at build time (Deezer, Apple Music, Spotify) are added where a release has none for that
// platform, and releases found on Deezer that the site doesn't have yet are added (scripts/streaming.mjs).
function withStreaming(list: Release[]): Release[] {
  const s = streamingJson as { links: Record<string, Links>; extra: Release[] };
  const out = list.map((r) => ({ ...r, links: { ...(s.links?.[r.slug] || {}), ...(r.links || {}) } }));
  for (const x of s.extra || []) if (!out.some((r) => r.slug === x.slug)) out.push(x);
  return out;
}
// Beatport's catalogue (written at build time) with releases.json on top: hand-set fields win, hand-made releases are added.
export const releases: Release[] = withStreaming(mergeReleases(beatportJson as Release[], releasesJson as Release[]))
  .map((r) => ({ ...r, cover: coverFor(r) }))
  .sort((a, b) => b.date.localeCompare(a.date) || (b.catalogue || '').localeCompare(a.catalogue || ''));
export const releasesFor = (slug: string) => releases.filter((r) => r.artists.includes(slug));

export const artistNames = (r: Release) => r.artists.map((s) => bySlug.get(s)?.name || s);
export const creditLine = (r: Release) => {
  if (r.credit) return r.credit; // the credit exactly as the label lists it (includes guests who aren't on the roster)
  const main = artistNames(r).join(' & ');
  return r.featuring?.length ? `${main} feat. ${r.featuring.join(', ')}` : main;
};

const today = () => new Date().toISOString().slice(0, 10);
export const isUpcoming = (r: Release) => r.date > today();
export const formatDate = (d: string) => d.length === 4 ? d :
  new Date(d + 'T12:00:00Z').toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export const year = (d: string) => d.slice(0, 4);

// In display order: streaming first, then stores and socials.
export const PLATFORMS: Record<string, string> = {
  spotify: 'Spotify', appleMusic: 'Apple Music', youtubeMusic: 'YouTube Music', youtube: 'YouTube', deezer: 'Deezer', tidal: 'TIDAL',
  amazonMusic: 'Amazon Music', soundcloud: 'SoundCloud', beatport: 'Beatport', bandcamp: 'Bandcamp', instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', twitch: 'Twitch',
};
export const linkList = (links: Links = {}) =>
  Object.keys(PLATFORMS).filter((k) => links[k]).map((k) => ({ key: k, name: PLATFORMS[k], url: links[k] }));

// One id per build, so browsers fetch fresh CSS/JS after every deploy.
export const BUILD_ID = Date.now().toString(36);

// ---------- Events (same validation as npm test; anything invalid is dropped, never published) ----------
export interface LabelEvent { id: string; date: string; time: string; event: string; series: string; venue: string; city: string; address: string; status: string; url: string; lineup: string[]; uid: string; }
const cleaned = cleanEvents(eventsJson, { artistSlugs: new Set(artists.map((a) => a.slug)) });
if (cleaned.problems.length) console.warn('[events] dropped invalid entries:', cleaned.problems);
export const events: LabelEvent[] = cleaned.events;
export const upcomingEvents = events.filter((e) => isUpcomingEvent(e));
export const pastEvents = events.filter((e) => !isUpcomingEvent(e)).reverse();
export const nextEvent = upcomingEvents.find((e) => e.status !== 'cancelled');
export { startIso };
export const eventDay = (e: LabelEvent) => new Date(e.date + 'T12:00:00Z');
export const fmtEvent = (e: LabelEvent, opts: Intl.DateTimeFormatOptions) => eventDay(e).toLocaleDateString('en-ZA', { timeZone: 'UTC', ...opts });

// ---------- Instagram gallery (written at build time by scripts/fetch-data.mjs) ----------
export interface GalleryItem { src: string; alt: string; url: string; }
export const gallery: GalleryItem[] = (galleryJson as GalleryItem[]).filter((g) => /^\/img\/gallery\/ig-\d+\.jpg$/.test(g.src));

// Events an artist is on the line-up for.
export const eventsFor = (slug: string) => upcomingEvents.filter((e) => e.lineup.includes(slug));
