// Lists every public page, including one page per release and per artist.
import { releases, artists } from '../lib/data';
export const GET = ({ site }: { site?: URL }) => {
  const base = site?.origin || 'https://midnightchildrenrecords.com';
  const today = new Date().toISOString().slice(0, 10);
  const pages = ['/', '/releases/', '/artists/', '/about/', '/demos/', '/contact/', '/privacy/', '/terms/', '/cookies/',
    ...releases.map((r) => `/releases/${r.slug}/`), ...artists.map((a) => `/artists/${a.slug}/`)];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    pages.map((p) => `  <url><loc>${base}${p}</loc><lastmod>${today}</lastmod></url>`).join('\n') + `\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
