import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rota Asistanı",
  description: "Bütçe, süre, vize tercihi ve seyahat tarzına göre sana uygun rotaları keşfet.",
  alternates: { canonical: "/rota-asistani" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
