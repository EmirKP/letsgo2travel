import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hesap Oluştur",
  description: "LetsGo2Travel hesabını oluştur.",
  robots: { index: false, follow: false },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
