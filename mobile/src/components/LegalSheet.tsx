import { useEffect, useState } from "react";
import { requestJson } from "../lib/api";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
import { useI18n } from "../lib/i18n";

// Yasal metinler UYGULAMA İÇİNDE okunur (tarayıcıya yönlendirme yok).
// İçerik /api/legal/[slug] üzerinden tek kaynaktan gelir; yüklenemezse
// açık hata + tekrar dene sunulur.

type LegalBlock =
  | { type: "p"; text: string }
  | { type: "list"; items: string[] };

type LegalDocumentData = {
  slug: string;
  title: string;
  updatedAt: string;
  sections: Array<{ heading?: string; blocks: LegalBlock[] }>;
};

export type LegalSlug = "kullanim-sartlari" | "gizlilik-politikasi";

const TITLES: Record<LegalSlug, string> = {
  "kullanim-sartlari": "Kullanım Şartları",
  "gizlilik-politikasi": "Gizlilik Politikası",
};

export function LegalSheet({ open, slug, onClose }: {
  open: boolean;
  slug: LegalSlug;
  onClose: () => void;
}) {
  const { copy } = useI18n();
  const [documentData, setDocumentData] = useState<LegalDocumentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError("");
    void requestJson<{ data: LegalDocumentData }>(`/api/legal/${slug}`)
      .then((result) => {
        if (!active) return;
        setDocumentData(result.data);
      })
      .catch(() => {
        if (!active) return;
        setDocumentData(null);
        setError(copy("Metin yüklenemedi. Bağlantını kontrol edip tekrar dene.", "The document could not be loaded. Check your connection and try again."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [attempt, copy, open, slug]);

  return <Sheet open={open} title={copy(TITLES[slug], slug === "kullanim-sartlari" ? "Terms of Use" : "Privacy Policy")} onClose={onClose} size="large">
    {loading && <div className="skeleton-list" aria-label={copy("Metin yükleniyor", "Loading document")}><div /><div /><div /></div>}
    {!loading && error && <div className="empty-state compact">
      <Icon name="alert" />
      <strong>{copy("Metin yüklenemedi", "Document unavailable")}</strong>
      <span>{error}</span>
      <button className="secondary-button" onClick={() => setAttempt((value) => value + 1)}>{copy("Tekrar dene", "Try again")}</button>
    </div>}
    {!loading && !error && documentData && <div className="legal-document">
      <p className="legal-updated">{copy("Son güncelleme", "Last updated")}: {documentData.updatedAt}</p>
      {documentData.sections.map((section, sectionIndex) => <section key={sectionIndex}>
        {section.heading && <h3>{section.heading}</h3>}
        {section.blocks.map((block, blockIndex) => block.type === "p"
          ? <p key={blockIndex}>{block.text}</p>
          : <ul key={blockIndex}>{block.items.map((item) => <li key={item}>{item}</li>)}</ul>)}
      </section>)}
    </div>}
  </Sheet>;
}
