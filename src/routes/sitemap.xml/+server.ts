import { templatesUrl, baseUrl } from '$src/constants';
import { slugify } from '$lib/format';
import type { Template } from '$src/Types';

const fetchData = async (): Promise<string[]> => {
  try {
    const data = await fetch(templatesUrl).then((res) => res.json());
    return data.templates.map((d: Template) => `${baseUrl}/${slugify(d.title)}`);
  } catch {
    // If the templates list is unavailable, still return a valid sitemap with just the homepage
    return [];
  }
};

export async function GET() {
  const data = await fetchData();

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1</priority>
  </url>
  <url>
    <loc>${baseUrl}/search</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${baseUrl}/usage</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${baseUrl}/changelog</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
    ${data.map((url: string) => `
      <url>
        <loc>${url}</loc>
        <changefreq>weekly</changefreq>
        <priority>0.8</priority>
      </url>`)
      .join('')}
  </urlset>`;

  return new Response(sitemap, {
    headers: { 'Content-Type': 'application/xml' }
    }
  );
}
