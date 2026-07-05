import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vizesiz Ülkeler",
  description: "Türk vatandaşlarından vize istemeyen ülkeler ve seyahat şartları.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
