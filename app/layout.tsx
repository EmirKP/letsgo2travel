import type { Metadata, Viewport } from "next";
import { Montserrat, Playfair_Display } from "next/font/google";
import "./globals.css";
import Header from "./components/Header";
import Footer from "./components/Footer";
import BottomNav from "./components/BottomNav";
import JsonLd from "./components/JsonLd";
import { organizationSchema } from "@/lib/structured-data";


const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0F172A",
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://letsgo2travel.com.tr"),
  title: {
    default: "Letsgo2Travel | Ucuz Uçak Bileti, Vizesiz Rotalar ve Seyahat Rehberi",
    template: "%s | Letsgo2Travel",
  },
  description:
    "Sinematik seyahat rehberleri, profesyonel lokasyon danışmanlığı, uçak bileti fırsatları ve akıllı rota planlama.",
  openGraph: {
    title: "Letsgo2Travel",
    description: "Sinematik rota rehberleri, lokasyon danışmanlığı ve akıllı seyahat planlama tek yerde.",
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
    <html lang="tr" className={`${montserrat.variable} ${playfair.variable}`}>
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
