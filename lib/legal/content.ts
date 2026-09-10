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
          "Üyelik bilgileri, e-posta adresi, ad, kullanıcı adı ve hesap kimliği",
          "Kullanıcının seçip yüklemeyi onayladığı profil fotoğrafı",
          "Kaydedilen rota arama tercihleri, rota sonuçları, seyahat planları ve kontrol listeleri",
          "Seyahat günlüğü notları ve kullanıcının kendi bildirdiği ziyaret edilmiş ülke ve yer bilgileri",
          "Topluluk soruları, yanıtları, yararlı oyları, içerik şikâyetleri ve engelleme kayıtları",
          "Ortak seyahat üyelikleri, plan oyları, bütçe, masraf ve katılımcıların borç payları; bu özellikler kart veya banka hesabı bilgisi istemez",
          "Doğrulanmış gezgin başvuruları ve kullanıcının yüklediği görsel veya belge",
          "Hesap silme, diğer veri hakları ve destek talepleri ile işletme itiraz kayıtları",
          "Telefon bildirimi ve Live Activity için cihaz/kurulum tanımlayıcıları, bildirim adresleme tokenları ve teslim durumu veya hata kayıtları",
          "Teknik işlem güvenliği kayıtları",
          "Kullanıcı açıkça 'Konumuma göre öner' dediğinde anlık olarak kullanılan yaklaşık konum",
        ] },
        { type: "p", text: "Doğrulama belgeleri kalıcı olarak saklanmaz. Belge özel erişimli alanda yalnızca inceleme için geçici olarak tutulur; karar verilirken önce, karar verilmemişse yüklemeden itibaren en geç 30 gün içinde silinir." },
        { type: "p", text: "Yaklaşık konum, yalnız o anda hava durumuna ve çevredeki aramaya uygun öneri üretmek için kullanılır; LetsGo2Travel hesabına veya veri tabanına kaydedilmez. Kullanıcı bu özelliği açmadıkça konum izni istenmez." },
        { type: "p", text: "Anlık cihaz konumundan farklı olarak, profil veya günlükte kendiniz kaydettiğiniz ülke ve yer bilgileri hesabınıza bağlı seyahat geçmişinin parçası olabilir. Misafir kullanımında yalnız cihazda tutulan kayıtlar, hesapla eşitleme gerçekleşene kadar hesabınıza kaydedilmiş sayılmaz." },
      ],
    },
    {
      heading: "2. Bilgilerin Kullanım Amaçları",
      blocks: [
        { type: "p", text: "Bilgiler şu amaçlarla kullanılır:" },
        { type: "list", items: [
          "Platform üyeliğini yönetmek", "Kullanıcı deneyimini geliştirmek",
          "Rota önerisi üretmek, kaydedilen plan ve günlükleri hesaba eşitlemek",
          "Ortak seyahat, kontrol listesi, oylama ve masraf paylaşımı özelliklerini sunmak",
          "Kullanıcının etkinleştirdiği hatırlatma, telefon bildirimi ve Live Activity özelliklerini çalıştırmak; teslim hatalarını çözmek",
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
        { type: "p", text: "Platform; sunucu barındırma için Vercel, hesap ve veri depolama için Supabase, uygulamanın işlem e-postaları için Resend ve iOS bildirimlerinin iletimi için Apple hizmetlerinden yararlanır." },
        { type: "p", text: "Yapay zekâ ile rota üretimi etkin olduğunda, rota formundaki seyahat tercihleri öneri oluşturulması için Google Gemini hizmetine gönderilir. Hava durumu isteğinde yaklaşık konum Open-Meteo hizmetine iletilir. Bu sağlayıcıların işlemleri ve saklama koşulları kendi hizmet koşulları ve gizlilik politikalarına da tabidir." },
        { type: "p", text: "Harita, rezervasyon veya seyahat ortağı bağlantısını açtığınızda ilgili hizmetin sayfasına geçersiniz. Bu hizmetlerde paylaştığınız bilgilere ilgili sağlayıcının politikası uygulanır. Web sitesindeki seyahat ortağı yönlendirmeleri tıklama ve teknik işlem kayıtları oluşturabilir." },
        { type: "p", text: "Mevcut mobil uygulama reklam kimliğiyle uygulamalar arası hedefli reklam takibi yapmaz. Bildirim ve Live Activity tanımlayıcıları, bildirimi ilgili cihaz ve seyahatle eşleştirmek için kullanılır." },
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
        { type: "p", text: "Kullanıcılar, kişisel verilerine ilişkin taleplerini web'de /veri-silme-ve-hak-talebi sayfasından, mobil uygulamada ise Hesabım → Hesap silme bölümünden iletebilir. Uygulama talebin durumunu ve sonuçlandırma süresini gösterir; sonuç hesaba kayıtlı e-posta adresine bildirilir. Apple ile bağlantılı hesaplarda silme sırasında Apple yetkilendirmesinin de kaldırılması için yeniden doğrulama istenebilir." },
        { type: "p", text: "Kamera, fotoğraf ve konum erişimleri ilgili özelliğin kullanımı sırasında istenir. Bu izinler cihaz ayarlarından yönetilebilir. Bildirimleri kapatmak veya hesaptan çıkmak, daha önce kaydedilmiş tüm hesap verilerinin silinmesi anlamına gelmez." },
        { type: "p", text: "Hesaba kaydedilen plan, günlük, profil ve topluluk kayıtları ilgili özellik veya hesap silme akışıyla yönetilir. Teknik güvenlik ve talep kayıtlarının saklanması, işleme amacı ve geçerli yükümlülükler kapsamında değerlendirilir. Veri hakları ve destek için hello@letsgo2travel.com.tr adresine veya /destek sayfasına başvurabilirsiniz." },
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
