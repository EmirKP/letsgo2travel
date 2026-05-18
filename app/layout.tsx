import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Letsgo 2 Travel | Ucuz Uçak Bileti",
  description: "Ucuz uçuşları kolayca bul",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}