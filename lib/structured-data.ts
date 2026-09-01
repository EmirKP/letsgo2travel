import type { BlogPost, CountryGuide } from "./types";
import { getCountrySeoContent } from "./country-seo-content";
import { getSiteUrl } from "./site-url";

export function siteUrl(path = "") {
  const base = getSiteUrl();
  if (!path) return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Letsgo2Travel",
    url: siteUrl(),
    logo: siteUrl("/logo.png"),
    sameAs: [
      "https://www.instagram.com/letsgo2travel_tr",
      "https://www.instagram.com/letsgo2travel_en",
    ],
  };
}

export function breadcrumbSchema(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: siteUrl(item.path),
    })),
  };
}

export function countryGuideSchema(country: CountryGuide) {
  const seo = getCountrySeoContent(country);

  return [
    breadcrumbSchema([
      { name: "Ana Sayfa", path: "/" },
      { name: "Ülke Rehberi", path: "/ulke-rehberi" },
      { name: country.country_name, path: `/ulke-rehberi/${country.slug}` },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "TravelGuide",
      name: `${country.country_name} Seyahat Rehberi`,
      description: `${country.visa_note} ${seo.searchTitle}`,
      url: siteUrl(`/ulke-rehberi/${country.slug}`),
      image: siteUrl(country.hero_image_url || "/travel-images/discover.jpg"),
      about: {
        "@type": "Country",
        name: country.country_name,
      },
      provider: organizationSchema(),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: seo.faq.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer,
        },
      })),
    },
  ];
}

export function articleSchema(post: BlogPost) {
  return [
    breadcrumbSchema([
      { name: "Ana Sayfa", path: "/" },
      { name: "Blog", path: "/blog" },
      { name: post.title, path: `/blog/${post.slug}` },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      description: post.excerpt,
      image: siteUrl(post.image_url || "/travel-images/discover.jpg"),
      author: {
        "@type": "Organization",
        name: post.author || "Letsgo2Travel",
      },
      publisher: organizationSchema(),
      datePublished: post.published_at,
      mainEntityOfPage: siteUrl(`/blog/${post.slug}`),
    },
  ];
}
