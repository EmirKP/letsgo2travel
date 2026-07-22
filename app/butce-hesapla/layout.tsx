import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bütçe Hesapla",
  description: "Uçuş, konaklama, yeme içme ve şehir içi ulaşım giderlerini kişi ve gün sayısına göre planla.",
};

export default function BudgetLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
