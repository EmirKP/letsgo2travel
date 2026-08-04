import type { Metadata } from "next";

import ExplorerCardPageClient from "./ExplorerCardPageClient";

export const metadata: Metadata = {
  title: "Dijital Kaşif Kartı",
  description:
    "Doğrulanmış seyahatlerini, Kaşifler Ligi seviyeni ve başarımlarını paylaş.",
};

export default function ExplorerCardPage() {
  return <ExplorerCardPageClient />;
}
