import { useEffect, useState } from "react";
import { requestJson } from "../lib/api";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

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
        setError("Metin yüklenemedi. Bağlantını kontrol edip tekrar dene.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [attempt, open, slug]);

  return <Sheet open={open} title={TITLES[slug]} onClose={onClose} size="large">
    {loading && <div className="skeleton-list" aria-label="Metin yükleniyor"><div /><div /><div /></div>}
    {!loading && error && <div className="empty-state compact">
      <Icon name="alert" />
      <strong>Metin yüklenemedi</strong>
      <span>{error}</span>
      <button className="secondary-button" onClick={() => setAttempt((value) => value + 1)}>Tekrar dene</button>
    </div>}
    {!loading && !error && documentData && <div className="legal-document">
      <p className="legal-updated">Son güncelleme: {documentData.updatedAt}</p>
      {documentData.sections.map((section, sectionIndex) => <section key={sectionIndex}>
        {section.heading && <h3>{section.heading}</h3>}
        {section.blocks.map((block, blockIndex) => block.type === "p"
          ? <p key={blockIndex}>{block.text}</p>
          : <ul key={blockIndex}>{block.items.map((item) => <li key={item}>{item}</li>)}</ul>)}
      </section>)}
    </div>}
  </Sheet>;
}
