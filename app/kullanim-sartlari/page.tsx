import { Metadata } from "next";
import { LegalDocumentView } from "../components/LegalDocumentView";

export const metadata: Metadata = {
  title: "Kullanım Şartları",
  description: "LetsGo2Travel platformu Kullanım Şartları",
};

// İçerik lib/legal/content.ts'teki TEK kaynaktan gelir; mobil uygulama içi
// görünüm (/api/legal/kullanim-sartlari) aynı metni kullanır.
export default function KullanimSartlariPage() {
  return <LegalDocumentView slug="kullanim-sartlari" />;
}
