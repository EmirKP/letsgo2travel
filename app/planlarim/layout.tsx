import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Planlarım",
  description: "Kaydettiğin seyahat planlarını, favori rotaları ve sonraki adımları tek ekranda düzenle.",
};

export default function PlansLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
