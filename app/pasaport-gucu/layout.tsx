import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pasaport Gücü",
  description: "Pasaportuna göre vizesiz, kimlikle, e-vize ve kapıda vize rotalarını tek ekranda gör.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
