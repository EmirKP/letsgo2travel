import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://letsgo2travel.com.tr";
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin/", "/go/"] },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
