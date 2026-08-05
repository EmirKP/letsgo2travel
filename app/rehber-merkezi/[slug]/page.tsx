import Link from "next/link";
import { ArrowLeft, Clock, ShieldAlert, CheckCircle2 } from "lucide-react";

type Article = {
  countryName: string;
  title: string;
  category: string;
  intro: string;
  sections: Array<{ title: string; items: string[] }>;
};

const COUNTRY_LABELS: Record<string, string> = {
  abd: "ABD",
  bae: "BAE",
  cekya: "Çekya",
  gurcistan: "Gürcistan",
  ingiltere: "İngiltere",
  isvicre: "İsviçre",
  italya: "İtalya",
  karadag: "Karadağ",
  misir: "Mısır",
  sirbistan: "Sırbistan",
  turkiye: "Türkiye",
  yunanistan: "Yunanistan",
};

function countryNameFromSlug(slug: string) {
  if (COUNTRY_LABELS[slug]) return COUNTRY_LABELS[slug];
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase("tr-TR") + part.slice(1))
    .join(" ");
}

function articleFromSlug(slug: string): Article {
  const match = slug.match(/^(.+)-rehber-([123])$/);
  const countrySlug = match?.[1] || "seyahat";
  const articleNumber = match?.[2] || "3";
  const countryName = countryNameFromSlug(countrySlug);

  if (articleNumber === "1") {
    return {
      countryName,
      title: `${countryName} vize ve giriş koşullarını doğrulama rehberi`,
      category: "Vize ve giriş kontrolü",
      intro: "Bu sayfa sabit bir evrak listesi değildir. Giriş şartları; vatandaşlık, pasaport türü, seyahat amacı ve aktarma noktasına göre değişebileceği için aşağıdaki kontrol sırasını kullanın.",
      sections: [
        {
          title: "Resmî kaynağı bulun",
          items: [
            "Önce T.C. Dışişleri Bakanlığı'nın ülke bazlı seyahat ve vize duyurularını kontrol edin.",
            "Ardından varış ülkesinin büyükelçilik veya konsolosluk sitesindeki güncel şartları karşılaştırın.",
            "Aktarmalı uçuşlarda transit ülkenin ayrı vize ve pasaport kuralı olup olmadığını doğrulayın.",
          ],
        },
        {
          title: "Belgeleri seyahatinize göre hazırlayın",
          items: [
            "Pasaport veya kimliğinizin geçerlilik süresini dönüş tarihine göre kontrol edin.",
            "Dönüş bileti, konaklama, seyahat sigortası ve maddi yeterlilik belgelerinin istenip istenmediğini resmî listeden teyit edin.",
            "Başvuru merkezi kullanacaksanız yalnızca konsolosluğun yetkilendirdiği bağlantıdan ilerleyin.",
          ],
        },
      ],
    };
  }

  if (articleNumber === "2") {
    return {
      countryName,
      title: `${countryName} seyahati için güvenlik kontrol listesi`,
      category: "Güvenli seyahat",
      intro: "Risk seviyesi şehir, bölge ve tarihe göre değişir. Aşağıdaki adımlar, doğrulanmamış yorumlar yerine resmî uyarılar ve kişisel hazırlık üzerinden plan yapmanıza yardımcı olur.",
      sections: [
        {
          title: "Yola çıkmadan önce",
          items: [
            "Dışişleri Bakanlığı'nın güncel seyahat duyurularını ve yerel makamların olağanüstü durum bildirimlerini inceleyin.",
            "Konaklama adresini, ulaşım planını ve acil durumda aranacak kişiyi çevrimdışı erişebileceğiniz şekilde kaydedin.",
            "Pasaport ve önemli belgelerin kopyalarını asıllarından ayrı, güvenli bir yerde tutun.",
          ],
        },
        {
          title: "Seyahat sırasında",
          items: [
            "Kalabalık alanlarda eşyalarınızı görünür ve kapalı tutun; tanımadığınız kişilere belge veya ödeme bilgisi vermeyin.",
            "Taksi, tur ve bilet alımlarında fiyatı işlemden önce yazılı olarak doğrulayın.",
            "Yerel acil numaraları ve en yakın Türk dış temsilciliğinin iletişim bilgisini kaydedin.",
          ],
        },
      ],
    };
  }

  return {
    countryName,
    title: `${countryName} gezi planı hazırlama rehberi`,
    category: "Rota planlama",
    intro: "İyi bir rota yalnızca görülecek yerlerden oluşmaz. Ulaşım süresi, rezervasyon koşulları ve dinlenme payını birlikte planlayın.",
    sections: [
      {
        title: "Rotayı gerçekçi kurun",
        items: [
          "Aynı güne birbirinden uzak çok sayıda nokta koymak yerine bölgeleri kümelere ayırın.",
          "Müze, park ve etkinliklerin resmî açılış saatlerini seyahat tarihine yakın yeniden kontrol edin.",
          "Havalimanı veya istasyondan konaklama yerine ulaşım için gecikme payı bırakın.",
        ],
      },
      {
        title: "Bütçeyi doğrulayın",
        items: [
          "Uçuş ve otel fiyatlarını toplam ücret, bagaj, vergi ve iptal koşullarıyla birlikte karşılaştırın.",
          "Kart kullanımının yanında küçük harcamalar için güvenli miktarda yerel para seçeneği planlayın.",
          "Kur ve fiyatlar değişebileceği için sabit örnek rakamları satın alma kararı olarak kullanmayın.",
        ],
      },
    ],
  };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = articleFromSlug(slug);
  return {
    title: `${article.title} | LetsGo2Travel`,
    description: `${article.countryName} seyahati için resmî kaynak kontrolü ve güvenli planlama adımları.`,
  };
}

export default async function GuideArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = articleFromSlug(slug);

  return (
    <div className="l2t-page" style={{ minHeight: "80vh", background: "#f8fafc", paddingBottom: "80px" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "40px 20px" }}>
        <div className="l2t-wrap" style={{ maxWidth: "800px", margin: "0 auto" }}>
          <Link href="/rehber-merkezi" style={{ color: "#64748B", display: "inline-flex", alignItems: "center", gap: "8px", textDecoration: "none", marginBottom: "24px", fontSize: "0.95rem", fontWeight: "500" }}>
            <ArrowLeft size={16} /> Rehber Merkezi&apos;ne Dön
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
            <span style={{ background: "#F1F5F9", color: "#475569", padding: "6px 12px", borderRadius: "100px", fontSize: "0.85rem", fontWeight: "600" }}>
              {article.category}
            </span>
            <span style={{ background: "#ECFDF5", color: "#059669", padding: "6px 12px", borderRadius: "100px", fontSize: "0.85rem", fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <CheckCircle2 size={14} /> LetsGo2Travel kontrol listesi
            </span>
            <span style={{ color: "#94a3b8", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <Clock size={14} /> Güncellenme: 5 Ağustos 2026
            </span>
          </div>

          <h1 style={{ fontSize: "2.2rem", color: "var(--l2t-navy)", fontWeight: "800", margin: "0 0 16px", lineHeight: "1.3" }}>
            {article.title}
          </h1>
          <p style={{ color: "#475569", lineHeight: 1.7, margin: 0 }}>{article.intro}</p>
        </div>
      </div>

      <div className="l2t-wrap" style={{ maxWidth: "800px", margin: "40px auto 0", padding: "0 20px" }}>
        <div style={{ background: "#FFFBEB", borderLeft: "4px solid #F59E0B", padding: "20px 24px", borderRadius: "0 12px 12px 0", marginBottom: "32px", display: "flex", gap: "16px" }}>
          <ShieldAlert size={28} color="#D97706" style={{ flexShrink: 0 }} />
          <div>
            <h2 style={{ margin: "0 0 8px", color: "#92400E", fontWeight: "700", fontSize: "1rem" }}>Resmî kaynak uyarısı</h2>
            <p style={{ margin: 0, color: "#B45309", fontSize: "0.95rem", lineHeight: "1.6" }}>
              Bu içerik genel bir kontrol listesidir; ülkeye özel resmî şartların yerine geçmez. İşlem yapmadan ve yola çıkmadan hemen önce yetkili kurumların güncel duyurularını doğrulayın.
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gap: "20px" }}>
          {article.sections.map((section) => (
            <section key={section.title} style={{ background: "#fff", padding: "32px", borderRadius: "20px", boxShadow: "0 10px 40px rgba(0,0,0,0.03)" }}>
              <h2 style={{ color: "var(--l2t-navy)", fontSize: "1.4rem", fontWeight: "800", margin: "0 0 18px" }}>{section.title}</h2>
              <ul style={{ margin: 0, paddingLeft: "22px", color: "#334155", lineHeight: 1.75 }}>
                {section.items.map((item) => <li key={item} style={{ marginBottom: "10px" }}>{item}</li>)}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
