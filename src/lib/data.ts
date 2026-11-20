// Reads the content files once and gives pages tidy, sorted data.
import labelJson from '../content/label.json';
import artistsJson from '../content/artists.json';
import releasesJson from '../content/releases.json';
import eventsJson from '../content/events.json';
import galleryJson from '../content/gallery.json';
import { cleanEvents, isUpcomingEvent, startIso } from '../../scripts/events.mjs';

export const label = labelJson;

export type Links = Record<string, string>;
export interface Artist { slug: string; name: string; tier: 'founder' | 'friend'; website?: string; genre?: string; city?: string; short?: string; bio?: string; image?: string; imageCredit?: string; links?: Links; sample?: boolean; }
export interface Track { title: string; duration?: string; }
export interface Release { slug: string; title: string; artists: string[]; featuring?: string[]; type: string; date: string; catalogue?: string; cover?: string; description?: string; tracks?: Track[]; links?: Links; sample?: boolean; }

export const artists: Artist[] = artistsJson as Artist[];
export const founders = artists.filter((a) => a.tier === 'founder');
export const friends = artists.filter((a) => a.tier !== 'founder');
export const TIER_LABEL = { founder: 'Founder', friend: 'Friend' } as const;
const bySlug = new Map(artists.map((a) => [a.slug, a]));
export const artistBySlug = (s: string) => bySlug.get(s);

// Newest first. Releases dated in the future are shown as "Out <date>".
export const releases: Release[] = [...(releasesJson as Release[])].sort((a, b) => b.date.localeCompare(a.date));
export const releasesFor = (slug: string) => releases.filter((r) => r.artists.includes(slug));

export const artistNames = (r: Release) => r.artists.map((s) => bySlug.get(s)?.name || s);
export const creditLine = (r: Release) => {
  const main = artistNames(r).join(' & ');
  return r.featuring?.length ? `${main} feat. ${r.featuring.join(', ')}` : main;
};

const today = () => new Date().toISOString().slice(0, 10);
export const isUpcoming = (r: Release) => r.date > today();
export const formatDate = (d: string) => d.length === 4 ? d :
  new Date(d + 'T12:00:00Z').toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export const year = (d: string) => d.slice(0, 4);

export const PLATFORMS: Record<string, string> = {
  spotify: 'Spotify', appleMusic: 'Apple Music', youtube: 'YouTube', soundcloud: 'SoundCloud',
  bandcamp: 'Bandcamp', beatport: 'Beatport', instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook',
};
export const linkList = (links: Links = {}) =>
  Object.entries(links).filter(([k, v]) => v && PLATFORMS[k]).map(([k, v]) => ({ key: k, name: PLATFORMS[k], url: v }));

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
