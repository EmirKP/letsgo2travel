// Yasal metinlerin TEK kaynağı. Web sayfaları ve mobil uygulama içi
// görünüm (LegalSheet, /api/legal/[slug]) aynı içeriği buradan okur —
// metin iki yerde ayrı ayrı güncellenmez.

export type LegalBlock =
  | { type: "p"; text: string }
  | { type: "list"; items: string[] };

export type LegalSection = {
  heading?: string;
  blocks: LegalBlock[];
};

export type LegalDocument = {
  slug: "kullanim-sartlari" | "gizlilik-politikasi";
  title: string;
  updatedAt: string;
  sections: LegalSection[];
};

const KULLANIM_SARTLARI: LegalDocument = {
  slug: "kullanim-sartlari",
  title: "Kullanım Şartları",
  updatedAt: "Haziran 2026",
  sections: [
    {
      blocks: [
        { type: "p", text: "LetsGo2Travel platformunu kullanan herkes bu Kullanım Şartları'nı kabul etmiş sayılır." },
      ],
    },
    {
      heading: "1. Platformun Amacı",
      blocks: [
        { type: "p", text: "LetsGo2Travel; uçak bileti arama, seyahat rehberi, vize/pasaport bilgilendirmesi, şehir rehberi, topluluk yorumları ve doğrulanmış gezgin deneyimleri sunmayı amaçlayan bir seyahat platformudur." },
        { type: "p", text: "Platformda yer alan bazı bilgiler resmi kaynaklardan, bazı bilgiler kullanıcı deneyimlerinden oluşabilir." },
      ],
    },
    {
      heading: "2. Resmî Bilgi ve Kullanıcı Deneyimi Ayrımı",
      blocks: [
        { type: "p", text: "Platformdaki içerikler şu kategorilerle ayrılır:" },
        { type: "list", items: ["Resmî Bilgi", "Doğrulanmış Gezgin Deneyimi", "Topluluk Yorumu"] },
        { type: "p", text: "Kullanıcı deneyimleri resmi bilgi niteliği taşımaz." },
        { type: "p", text: "Vize, pasaport, ülkeye giriş şartları, güvenlik, sağlık ve hukuki konularda seyahat öncesinde ilgili ülkenin resmi kurumlarından, konsolosluklardan veya yetkili mercilerden güncel bilgi alınmalıdır." },
      ],
    },
    {
      heading: "3. Kullanıcı Sorumluluğu",
      blocks: [
        { type: "p", text: "Kullanıcı, LetsGo2Travel'da paylaştığı tüm yorum, bilgi, öneri, fiyat bilgisi, belge, görsel, seyahat deneyimi ve değerlendirmeden kendisinin sorumlu olduğunu kabul eder. Kullanıcı:" },
        { type: "list", items: [
          "Hakaret içeren içerik paylaşamaz",
          "İftira niteliğinde paylaşım yapamaz",
          "Kişilik haklarını ihlal edemez",
          "Ticari itibarı zedeleyici kesin suçlamalarda bulunamaz",
          "Başka kişilere ait kişisel verileri paylaşamaz",
          "Telif, marka veya üçüncü kişi haklarını ihlal edemez",
          "Yanlış veya yanıltıcı bilgi paylaşamaz",
          "Pasaport numarası, T.C. kimlik numarası, PNR, QR, barkod veya ödeme bilgisi gibi hassas verileri açık şekilde paylaşamaz",
        ] },
        { type: "p", text: "Kullanıcı, paylaştığı içerikten doğabilecek hukuki sorumluluğun kendisine ait olduğunu kabul eder." },
      ],
    },
    {
      heading: "4. LetsGo2Travel'ın Sorumluluğu",
      blocks: [
        { type: "p", text: "LetsGo2Travel, kullanıcılar tarafından paylaşılan içeriklerin doğruluğunu, güncelliğini, eksiksizliğini veya hukuka uygunluğunu garanti etmez." },
        { type: "p", text: "LetsGo2Travel, kullanıcı içeriklerini moderasyona alabilir, yayından kaldırabilir, görünürlüğünü azaltabilir, düzenleme talep edebilir veya hesabı kısıtlayabilir." },
      ],
    },
    {
      heading: "5. Yasaklı İçerikler",
      blocks: [
        { type: "p", text: "Aşağıdaki içerikler yasaktır:" },
        { type: "list", items: [
          "Hakaret", "İftira", "Tehdit", "Nefret söylemi", "Ayrımcılık",
          "Kişisel veri paylaşımı", "Telif veya marka hakkı ihlali", "Spam",
          "Sahte yorum", "Yanıltıcı bilgi",
          "İşletme veya kişi hakkında kesin suçlayıcı iddialar",
        ] },
      ],
    },
    {
      heading: "6. Hesap Kısıtlama ve İçerik Kaldırma",
      blocks: [
        { type: "p", text: "LetsGo2Travel, kuralları ihlal eden kullanıcıların içeriklerini kaldırabilir, hesaplarını geçici veya kalıcı olarak kısıtlayabilir." },
      ],
    },
    {
      heading: "7. Seyahat ve Vize Bilgilendirmesi",
      blocks: [
        { type: "p", text: "Platformdaki vize, pasaport, seyahat, güvenlik ve fiyat bilgileri bilgilendirme amaçlıdır. Kullanıcı, seyahat öncesinde resmi kurumlardan güncel bilgi almakla sorumludur." },
      ],
    },
  ],
};

const GIZLILIK_POLITIKASI: LegalDocument = {
  slug: "gizlilik-politikasi",
  title: "Gizlilik Politikası",
  updatedAt: "Eylül 2026",
  sections: [
    {
      blocks: [
        { type: "p", text: "LetsGo2Travel olarak kullanıcı gizliliğini önemseriz. Bu Gizlilik Politikası, platformu kullanırken hangi bilgilerin toplandığını, nasıl kullanıldığını, nasıl korunduğunu ve kullanıcıların hangi haklara sahip olduğunu açıklar." },
      ],
    },
    {
      heading: "1. Toplanan Bilgiler",
      blocks: [
        { type: "p", text: "Platformda aşağıdaki bilgiler işlenebilir:" },
        { type: "list", items: [
          "Üyelik bilgileri", "E-posta adresi", "Kullanıcı adı", "Profil bilgileri",
          "Yorumlar ve kullanıcı tarafından paylaşılan içerikler",
          "Doğrulanmış gezgin başvuru kayıtları", "KVKK talep kayıtları",
          "İşletme itiraz kayıtları", "Teknik işlem güvenliği kayıtları",
          "Kullanıcı açıkça 'Konumuma göre öner' dediğinde anlık olarak kullanılan yaklaşık konum",
        ] },
        { type: "p", text: "Doğrulama belgeleri kalıcı olarak saklanmaz. Belge özel erişimli alanda yalnızca inceleme için geçici olarak tutulur; karar verilirken önce, karar verilmemişse yüklemeden itibaren en geç 30 gün içinde silinir." },
        { type: "p", text: "Yaklaşık konum, yalnız o anda hava durumuna ve çevredeki aramaya uygun öneri üretmek için kullanılır; LetsGo2Travel hesabına veya veri tabanına kaydedilmez. Kullanıcı bu özelliği açmadıkça konum izni istenmez." },
      ],
    },
    {
      heading: "2. Bilgilerin Kullanım Amaçları",
      blocks: [
        { type: "p", text: "Bilgiler şu amaçlarla kullanılır:" },
        { type: "list", items: [
          "Platform üyeliğini yönetmek", "Kullanıcı deneyimini geliştirmek",
          "Doğrulanmış gezgin sistemini çalıştırmak",
          "Kullanıcının talebiyle anlık hava ve yakındaki aktivite önerisi sunmak",
          "Yorum ve içerik güvenliğini sağlamak", "Spam ve kötüye kullanımı önlemek",
          "İşletme itirazlarını değerlendirmek", "KVKK taleplerini yönetmek",
          "Hukuki yükümlülükleri yerine getirmek",
        ] },
      ],
    },
    {
      heading: "3. Çerezler ve Analitik",
      blocks: [
        { type: "p", text: "LetsGo2Travel, site performansını ölçmek ve kullanıcı deneyimini geliştirmek için çerezler veya analitik araçlar kullanabilir." },
        { type: "p", text: "Zorunlu olmayan çerezler için gerektiğinde ayrı rıza mekanizması uygulanır." },
      ],
    },
    {
      heading: "4. Üçüncü Taraf Hizmetler",
      blocks: [
        { type: "p", text: "Platform; hosting, veri tabanı, e-posta gönderimi, güvenlik, analitik, hava durumu, harita veya seyahat affiliate hizmetleri için üçüncü taraf servislerden yararlanabilir." },
        { type: "p", text: "Bu hizmet sağlayıcılar yalnızca gerekli bilgilerle ve ilgili amaç kapsamında işlem yapar." },
      ],
    },
    {
      heading: "5. Veri Güvenliği",
      blocks: [
        { type: "p", text: "LetsGo2Travel; yetkisiz erişimi, veri kaybını ve kötüye kullanımı önlemek amacıyla teknik ve idari güvenlik önlemleri uygular." },
        { type: "p", text: "Ancak internet üzerinden yapılan hiçbir veri iletiminin tamamen risksiz olduğu garanti edilemez." },
      ],
    },
    {
      heading: "6. Kullanıcı Hakları",
      blocks: [
        { type: "p", text: "Kullanıcılar, kişisel verilerine ilişkin taleplerini web'de /veri-silme-ve-hak-talebi sayfasından, mobil uygulamada ise Profil → Hesap bölümündeki veri silme akışından iletebilir." },
      ],
    },
  ],
};

export const LEGAL_DOCUMENTS: Record<string, LegalDocument> = {
  "kullanim-sartlari": KULLANIM_SARTLARI,
  "gizlilik-politikasi": GIZLILIK_POLITIKASI,
};

export function getLegalDocument(slug: string): LegalDocument | null {
  return LEGAL_DOCUMENTS[String(slug || "").toLowerCase()] || null;
}
