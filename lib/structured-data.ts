import type { BlogPost, CountryGuide, FlightDeal } from "./types";

const DEFAULT_SITE_URL = "https://letsgo2travel.com.tr";

export function siteUrl(path = "") {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/$/, "");
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
      description: country.visa_note,
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
      mainEntity: [
        {
          "@type": "Question",
          name: `${country.country_name} Türk vatandaşlarından vize istiyor mu?`,
          acceptedAnswer: {
            "@type": "Answer",
            text: country.visa_note,
          },
        },
        {
          "@type": "Question",
          name: `${country.country_name} uçuş süresi ne kadar?`,
          acceptedAnswer: {
            "@type": "Answer",
            text: `Türkiye çıkışlı uçuşlarda ortalama süre ${country.flight_duration}.`,
          },
        },
      ],
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

export function flightDealSchema(deal: FlightDeal) {
  return [
    breadcrumbSchema([
      { name: "Ana Sayfa", path: "/" },
      { name: "Uçak Bileti", path: "/ucak-bileti-ara" },
      { name: deal.title, path: `/ucak-bileti/${deal.slug}` },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "TravelAction",
      name: deal.title,
      description: `${deal.origin} - ${deal.destination} uçak bileti fırsatı`,
      fromLocation: {
        "@type": "Airport",
        name: deal.origin,
        iataCode: deal.origin_code,
      },
      toLocation: {
        "@type": "Airport",
        name: deal.destination,
        iataCode: deal.destination_code,
      },
      priceSpecification: {
        "@type": "PriceSpecification",
        price: deal.price,
        priceCurrency: deal.currency,
      },
      provider: organizationSchema(),
      url: siteUrl(`/ucak-bileti/${deal.slug}`),
    },
  ];
}
