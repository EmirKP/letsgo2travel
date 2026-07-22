import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./styles/legacy-consolidated.css";
import "./styles/tokens.css";
import "./styles/foundation.css";
import Header from "./components/Header";
import Footer from "./components/Footer";
import BottomNav from "./components/BottomNav";
import JsonLd from "./components/JsonLd";
import PwaRegister from "./components/PwaRegister";
import NativeAppBridge from "./components/NativeAppBridge";
import { organizationSchema } from "@/lib/structured-data";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: "#0A2C3F",
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
    images: [{ url: "/plane-hero.webp", width: 1200, height: 630, alt: "LetsGo2Travel seyahat platformu" }],
  },
  manifest: "/manifest.webmanifest",
  applicationName: "LetsGo2Travel",
  formatDetection: { telephone: false },
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
    title: "LetsGo2Travel",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>
        <JsonLd data={organizationSchema()} />
        <PwaRegister />
        <NativeAppBridge />
        <Header />
        <main>{children}</main>
        <Footer />
        <BottomNav />
      </body>
    </html>
  );
}
