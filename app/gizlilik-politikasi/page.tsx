import { Metadata } from "next";
import { LegalDocumentView } from "../components/LegalDocumentView";

export const metadata: Metadata = {
  title: "Gizlilik Politikası",
  description: "LetsGo2Travel platformu Gizlilik Politikası",
};

// İçerik lib/legal/content.ts'teki TEK kaynaktan gelir; mobil uygulama içi
// görünüm (/api/legal/gizlilik-politikasi) aynı metni kullanır.
export default function GizlilikPolitikasiPage() {
  return <LegalDocumentView slug="gizlilik-politikasi" />;
}
