import type { Metadata } from "next";
import "./globals.css";
import TravelpayoutsDrive from "./components/TravelpayoutsDrive";

export const metadata: Metadata = {
  title: "Letsgo 2 Travel | Ucuz Uçak Bileti Fırsatları",
  description:
    "Letsgo 2 Travel ile ucuz uçak bileti fırsatlarını keşfet, fiyat alarmı kur ve uygun rotaları takip et.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body>
        <TravelpayoutsDrive />
        {children}
      </body>
    </html>
  );
}