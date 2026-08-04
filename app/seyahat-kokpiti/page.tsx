import type { Metadata } from "next";

import CockpitPageClient from "./CockpitPageClient";

export const metadata: Metadata = {
  title: "Akıllı Seyahat Kokpiti",
  description:
    "Seyahat geri sayımını, hazırlık listesini, eSIM ve destinasyon bilgilerini tek panelde yönet.",
  alternates: { canonical: "/seyahat-kokpiti" },
};

export default function SmartTravelCockpitPage() {
  return <CockpitPageClient />;
}
