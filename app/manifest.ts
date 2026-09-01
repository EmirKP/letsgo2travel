import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "LetsGo2Travel — Seyahat Keşif ve Rota Uygulaması",
    short_name: "LetsGo2Travel",
    description: "Pasaport gücü, rota asistanı, seyahat bütçesi ve gerçek gezgin deneyimleri.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
    orientation: "portrait-primary",
    background_color: "#071B33",
    theme_color: "#071B33",
    categories: ["travel", "lifestyle", "utilities"],
    lang: "tr",
    dir: "ltr",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Keşfet", short_name: "Keşfet", description: "Ülke ve rota keşfini aç", url: "/ulke-rehberi", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Pasaport Gücü", short_name: "Pasaport", description: "Pasaportuna göre ülke keşfet", url: "/pasaport-gucu", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Rota Asistanı", short_name: "Rota", description: "Seyahat rotası oluştur", url: "/rota-asistani", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Planlarım", short_name: "Planlar", description: "Kaydettiğin seyahatleri aç", url: "/planlarim", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
