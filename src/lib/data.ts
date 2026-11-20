// Reads the content files once and gives pages tidy, sorted data.
import labelJson from '../content/label.json';
import artistsJson from '../content/artists.json';
import releasesJson from '../content/releases.json';

export const label = labelJson;

export type Links = Record<string, string>;
export interface Artist { slug: string; name: string; genre?: string; city?: string; short?: string; bio?: string; image?: string; imageCredit?: string; links?: Links; sample?: boolean; }
export interface Track { title: string; duration?: string; }
export interface Release { slug: string; title: string; artists: string[]; featuring?: string[]; type: string; date: string; catalogue?: string; cover?: string; description?: string; tracks?: Track[]; links?: Links; sample?: boolean; }

export const artists: Artist[] = artistsJson as Artist[];
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
export const formatDate = (d: string) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export const year = (d: string) => d.slice(0, 4);

export const PLATFORMS: Record<string, string> = {
  spotify: 'Spotify', appleMusic: 'Apple Music', youtube: 'YouTube', soundcloud: 'SoundCloud',
  bandcamp: 'Bandcamp', beatport: 'Beatport', instagram: 'Instagram', tiktok: 'TikTok',
};
export const linkList = (links: Links = {}) =>
  Object.entries(links).filter(([k, v]) => v && PLATFORMS[k]).map(([k, v]) => ({ key: k, name: PLATFORMS[k], url: v }));

// One id per build, so browsers fetch fresh CSS/JS after every deploy.
export const BUILD_ID = Date.now().toString(36);
