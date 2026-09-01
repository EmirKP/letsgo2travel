import { getBlogPosts } from "@/lib/data";

export async function GET() {
  const blogs = await getBlogPosts();
  const baseUrl = "https://www.letsgo2travel.com.tr";

  let rssItemsXml = "";

  blogs.forEach((post) => {
    rssItemsXml += `
      <item>
        <title><![CDATA[${post.title}]]></title>
        <link>${baseUrl}/blog/${post.slug}</link>
        <description><![CDATA[${post.excerpt}]]></description>
        <pubDate>${new Date(post.published_at || new Date().toISOString()).toUTCString()}</pubDate>
      </item>
    `;
  });

  const rssXml = `<?xml version="1.0" ?>
    <rss version="2.0">
      <channel>
        <title>Letsgo2Travel Rota ve Seyahat Blogu</title>
        <link>${baseUrl}</link>
        <description>En güncel seyahat rotaları, vizesiz ülkeler ve seyahat bütçesi ipuçları.</description>
        ${rssItemsXml}
      </channel>
    </rss>`;

  return new Response(rssXml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}
