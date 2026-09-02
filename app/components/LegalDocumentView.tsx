import { getLegalDocument } from "@/lib/legal/content";

// Yasal metinlerin web görünümü — içerik TEK kaynaktan (lib/legal/content).
// Stil, önceki sabit sayfalarla aynı görünümü korur (lacivert-altın kimlik).
export function LegalDocumentView({ slug }: { slug: string }) {
  const documentData = getLegalDocument(slug);
  if (!documentData) return null;

  return (
    <div className="l2t-page">
      <div className="l2t-wrap" style={{ maxWidth: "800px", margin: "0 auto", padding: "40px 20px" }}>
        <h1 style={{ color: "var(--l2t-gold)", marginBottom: "24px", fontSize: "2.5rem" }}>{documentData.title}</h1>

        <div className="l2t-card" style={{ padding: "32px", color: "var(--l2t-soft)", lineHeight: "1.8" }}>
          <p style={{ marginBottom: "16px" }}><strong>Son güncelleme tarihi:</strong> {documentData.updatedAt}</p>

          {documentData.sections.map((section, sectionIndex) => (
            <div key={sectionIndex}>
              {section.heading && (
                <h2 style={{ color: "#fff", marginTop: "32px", marginBottom: "16px", fontSize: "1.5rem" }}>{section.heading}</h2>
              )}
              {section.blocks.map((block, blockIndex) => block.type === "p" ? (
                <p key={blockIndex} style={{ marginBottom: "16px" }}>{block.text}</p>
              ) : (
                <ul key={blockIndex} style={{ paddingLeft: "24px", marginBottom: "24px" }}>
                  {block.items.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
