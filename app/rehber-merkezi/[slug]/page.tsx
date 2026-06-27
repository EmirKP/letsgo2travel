import Link from "next/link";
import { ArrowLeft, Clock, ShieldAlert, CheckCircle2, AlertTriangle } from "lucide-react";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  return {
    title: `${resolvedParams.slug.replace(/-/g, ' ').toUpperCase()} | Letsgo2Travel Rehber`,
    description: "Letsgo2Travel rehber içerikleri ve seyahat notları.",
  };
}

export default async function GuideArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  
  // Dummy article data
  const article = {
    title: "Schengen Vizesi Başvurusu İçin Hazırlanması Gereken Evraklar",
    category: "Konsolosluk & Vize Bilgileri",
    authorType: "l2t_guide", // 'l2t_guide' or 'user_experience'
    updatedAt: "16 Haziran 2026",
    content: `
      Schengen vizesi başvurusu yaparken en çok dikkat edilmesi gereken konulardan biri eksiksiz evrak teslimidir. 
      Eksik veya hatalı evraklar doğrudan ret almanıza sebep olabilir.
      
      ## Temel Evrak Listesi
      1. **Pasaport:** Seyahat bitiminden itibaren en az 3 ay geçerliliği olan ve içinde en az 2 boş sayfası bulunan güncel pasaport.
      2. **Biyometrik Fotoğraf:** Son 6 ay içinde çekilmiş, arka fonu beyaz, 35x45 mm ölçülerinde 2 adet biyometrik fotoğraf.
      3. **Vize Başvuru Formu:** İlgili ülkenin konsolosluk veya aracı kurum web sitesinden online olarak doldurulmuş, eksiksiz ve ıslak imzalı form.
      4. **Seyahat Sağlık Sigortası:** En az 30.000 EUR teminatlı ve tüm Schengen üyesi ülkelerde geçerli sağlık sigortası.
      5. **Uçak ve Otel Rezervasyonları:** Seyahat tarihlerini netleştiren ulaşım ve konaklama belgeleri.
      6. **Maddi Durum Belgeleri:** Son 3 aya ait banka hesap dökümü (banka kaşeli ve imzalı) ile maaş bordroları.
      7. **İşveren/Şirket Evrakları:** Faaliyet belgesi, vergi levhası, imza sirküleri, ticaret sicil gazetesi fotokopileri.
      8. **SGK İşe Giriş ve Hizmet Dökümü:** Barkodlu veya QR kodlu SGK belgeleri.
    `
  };

  return (
    <div className="l2t-page" style={{ minHeight: "80vh", background: "#f8fafc", paddingBottom: "80px" }}>
      
      {/* Hero */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "40px 20px" }}>
        <div className="l2t-wrap" style={{ maxWidth: "800px", margin: "0 auto" }}>
          <Link href="/rehber-merkezi" style={{ color: "#64748B", display: "inline-flex", alignItems: "center", gap: "8px", textDecoration: "none", marginBottom: "24px", fontSize: "0.95rem", fontWeight: "500" }}>
            <ArrowLeft size={16} /> Rehber Merkezi'ne Dön
          </Link>
          
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
            <span style={{ background: "#F1F5F9", color: "#475569", padding: "6px 12px", borderRadius: "100px", fontSize: "0.85rem", fontWeight: "600" }}>
              {article.category}
            </span>
            {article.authorType === 'l2t_guide' ? (
              <span style={{ background: "#ECFDF5", color: "#059669", padding: "6px 12px", borderRadius: "100px", fontSize: "0.85rem", fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <CheckCircle2 size={14} /> Letsgo2Travel Rehberi
              </span>
            ) : (
              <span style={{ background: "#FFFBEB", color: "#D97706", padding: "6px 12px", borderRadius: "100px", fontSize: "0.85rem", fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <AlertTriangle size={14} /> Kullanıcı Deneyimi
              </span>
            )}
            <span style={{ color: "#94a3b8", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <Clock size={14} /> Güncellenme: {article.updatedAt}
            </span>
          </div>

          <h1 style={{ fontSize: "2.2rem", color: "var(--l2t-navy)", fontWeight: "800", margin: "0 0 16px", lineHeight: "1.3" }}>
            {article.title}
          </h1>
        </div>
      </div>

      {/* İçerik */}
      <div className="l2t-wrap" style={{ maxWidth: "800px", margin: "40px auto 0", padding: "0 20px" }}>
        
        {/* Uyarı */}
        <div style={{ background: "#FFFBEB", borderLeft: "4px solid #F59E0B", padding: "20px 24px", borderRadius: "0 12px 12px 0", marginBottom: "40px", display: "flex", gap: "16px" }}>
          <ShieldAlert size={28} color="#D97706" style={{ flexShrink: 0 }} />
          <div>
            <h4 style={{ margin: "0 0 8px", color: "#92400E", fontWeight: "700", fontSize: "1rem" }}>Resmi Kaynak Kontrol Uyarısı</h4>
            <p style={{ margin: 0, color: "#B45309", fontSize: "0.95rem", lineHeight: "1.6" }}>
              Bu içerik bilgilendirme amaçlıdır. Vize, güvenlik, avcılık, balıkçılık ve kamp kuralları zamanla değişebilir. İşlem yapmadan önce her zaman ilgili resmi kurumların güncel duyurularını kontrol edin.
            </p>
          </div>
        </div>

        <div style={{ background: "#fff", padding: "40px", borderRadius: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.03)", lineHeight: "1.8", color: "#334155", fontSize: "1.05rem" }} className="prose">
          {/* Basit Markdown parsing (MVP) */}
          {article.content.split('\n').map((line, i) => {
            if (line.trim().startsWith('##')) {
              return <h2 key={i} style={{ color: "var(--l2t-navy)", fontSize: "1.5rem", fontWeight: "700", marginTop: "32px", marginBottom: "16px" }}>{line.replace('##', '').trim()}</h2>;
            } else if (line.trim().match(/^[0-9]+\./)) {
              // strong parse
              const parts = line.split('**');
              if (parts.length > 2) {
                return <p key={i} style={{ margin: "8px 0" }}>{parts[0]}<strong>{parts[1]}</strong>{parts[2]}</p>
              }
              return <p key={i} style={{ margin: "8px 0" }}>{line}</p>;
            } else if (line.trim().length > 0) {
              return <p key={i} style={{ marginBottom: "16px" }}>{line}</p>;
            }
            return null;
          })}
        </div>

      </div>
    </div>
  );
}
