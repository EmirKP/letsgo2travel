import type { Metadata, Viewport } from "next";
import "./globals.css";
import Header from "./components/Header";
import Footer from "./components/Footer";
import BottomNav from "./components/BottomNav";
import JsonLd from "./components/JsonLd";
import { organizationSchema } from "@/lib/structured-data";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#06183A",
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://letsgo2travel.com.tr"),
  title: {
    default: "LetsGo2Travel | Pasaport Gücü, Rota Asistanı ve Global Seyahat Keşfi",
    template: "%s | LetsGo2Travel",
  },
  description:
    "Pasaport gücü, rota asistanı, gerçek gezgin deneyimleri ve uçuş aramayı tek yerde birleştiren seyahat keşif platformu.",
  openGraph: {
    title: "LetsGo2Travel",
    description: "Pasaport gücü, rota planlama ve gerçek gezgin deneyimleri tek yerde.",
    images: [{ url: "/plane-hero.webp", width: 1200, height: 630, alt: "Letsgo2Travel" }],
  },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Letsgo2Travel",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>
        <JsonLd data={organizationSchema()} />
        <Header />
        <main>{children}</main>
        <Footer />
        <BottomNav />
      </body>
    </html>
  );
}
