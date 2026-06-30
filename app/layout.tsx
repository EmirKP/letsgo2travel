import type { Metadata, Viewport } from "next";
import "./globals.css";
import Header from "./components/Header";
import Footer from "./components/Footer";
import BottomNav from "./components/BottomNav";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#06183A",
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://letsgo2travel.com"),
  title: {
    default: "Letsgo2Travel | Ucuz Uçak Bileti, Vizesiz Rotalar ve Seyahat Rehberi",
    template: "%s | Letsgo2Travel",
  },
  description:
    "Ucuz uçak bileti kampanyaları, vizesiz ülkeler, ülke rehberleri, otel, eSIM ve tur seçenekleri için premium seyahat asistanı.",
  openGraph: {
    title: "Letsgo2Travel",
    description: "Ucuz uçuşlar ve vizesiz seyahat rotaları tek yerde.",
    images: ["/plane-hero.webp"],
  },
  manifest: "/manifest.json",
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
        <Header />
        <main>{children}</main>
        <Footer />
        <BottomNav />
      </body>
    </html>
  );
}
