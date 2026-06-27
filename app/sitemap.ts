import { MetadataRoute } from 'next';
import { getCountryGuides, getBlogPosts } from '@/lib/data';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://letsgo2travel.com";

  const countries = await getCountryGuides();
  const blogs = await getBlogPosts();

  const countryUrls = countries.map((country) => ({
    url: `${baseUrl}/ulke-rehberi/${country.slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  const blogUrls = blogs.map((blog) => ({
    url: `${baseUrl}/blog/${blog.slug}`,
    lastModified: new Date(blog.published_at || new Date().toISOString()),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  const staticUrls = [
    { url: `${baseUrl}/`, priority: 1.0, changeFrequency: 'daily' as const },
    { url: `${baseUrl}/kampanyalar`, priority: 0.9, changeFrequency: 'daily' as const },
    { url: `${baseUrl}/vizesiz-ulkeler`, priority: 0.9, changeFrequency: 'weekly' as const },
    { url: `${baseUrl}/harita`, priority: 0.7, changeFrequency: 'monthly' as const },
    { url: `${baseUrl}/pasaport-gucu`, priority: 0.8, changeFrequency: 'monthly' as const },
  ];

  return [...staticUrls, ...countryUrls, ...blogUrls];
}
