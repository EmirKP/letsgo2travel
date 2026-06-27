import Link from "next/link";
import { ShieldCheck, Calendar, AlertTriangle, ArrowLeft, ExternalLink, CheckCircle2, Plane, MessageSquare, Search } from "lucide-react";

export function generateStaticParams() {
  return [
    { slug: "konsolosluk-vize" },
    { slug: "seyahat-sigortasi" },
    { slug: "gezilecek-yerler" },
    { slug: "guvenli-bolgeler" },
    { slug: "kamp-doga" },
    { slug: "balikcilar-icin-bilgiler" },
    { slug: "avcilar-icin-yasal-bilgilendirme" },
    { slug: "acil-durum-faydali-numaralar" },
    { slug: "ulke-bazli-sorunlar" }
  ];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const categories: Record<string, { title: string, desc: string }> = {
    "konsolosluk-vize": { title: "Konsolosluk & Vize Bilgileri", desc: "Vize başvurusu, randevu süreçleri ve pasaport geçerlilik uyarıları." },
    "seyahat-sigortasi": { title: "Seyahat Sigortası Rehberi", desc: "Sağlık teminatı, bagaj kaybı ve vize için sigorta şartları." },
    "gezilecek-yerler": { title: "Gezilecek Yerler", desc: "Şehir seçimi, ücretsiz rotalar ve konum planlaması." },
    "guvenli-bolgeler": { title: "Güvenli Bölgeler", desc: "Güvenlik riskleri ve gece dışarı çıkarken dikkat edilecekler." },
    "kamp-doga": { title: "Kamp & Doğa Rehberi", desc: "Ateş yakma kuralları, milli park izinleri ve doğayı koruma." },
    "balikcilar-icin-bilgiler": { title: "Balıkçılar İçin Bilgiler", desc: "Amatör balıkçılık izinleri, bölgesel kurallar ve yasak dönemler." },
    "avcilar-icin-yasal-bilgilendirme": { title: "Avcılar İçin Yasal Bilgilendirme", desc: "Avcılık için yasal izinler ve koruma altındaki türler uyarıları." },
    "acil-durum-faydali-numaralar": { title: "Acil Durum & Faydalı Numaralar", desc: "Pasaport veya cüzdan kaybında yapılacaklar, konsolosluk iletişim bilgileri." },
    "ulke-bazli-sorunlar": { title: "Ülke Bazlı Sorunlar", desc: "Ülkeye giriş sorunları ve sınır kapısı deneyimleri." }
  };

  const cat = categories[slug];
  if (!cat) {
    return { title: "Sayfa Bulunamadı | Letsgo2Travel", description: "Aradığınız rehber kategorisi bulunamadı." };
  }

  return {
    title: `${cat.title} | Rehber Merkezi | Letsgo2Travel`,
    description: cat.desc,
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // Fallback / 404 durumu
  if (![
    "konsolosluk-vize", "seyahat-sigortasi", "gezilecek-yerler", 
    "guvenli-bolgeler", "kamp-doga", "balikcilar-icin-bilgiler", 
    "avcilar-icin-yasal-bilgilendirme", "acil-durum-faydali-numaralar", 
    "ulke-bazli-sorunlar"
  ].includes(slug)) {
    return (
      <div className="l2t-page l2t-wrap" style={{ minHeight: "80vh", padding: "80px 20px", textAlign: "center" }}>
        <div style={{ maxWidth: "600px", margin: "0 auto", background: "#fff", padding: "48px", borderRadius: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.05)" }}>
          <AlertTriangle size={64} color="#EF4444" style={{ margin: "0 auto 24px" }} />
          <h1 style={{ fontSize: "2rem", color: "var(--l2t-navy)", marginBottom: "16px", fontWeight: "800" }}>Bu Rehber Henüz Hazırlanıyor</h1>
          <p style={{ color: "var(--l2t-soft)", fontSize: "1.1rem", marginBottom: "32px", lineHeight: "1.6" }}>
            Aradığınız kategoriye ait bilgiler yasal kontrollerden geçirilip güncellenmektedir. Lütfen daha sonra tekrar kontrol edin veya farklı bir kategori seçin.
          </p>
          <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/rehber-merkezi" className="l2t-btn l2t-btn-outline">Rehber Merkezi'ne Dön</Link>
            <Link href="/forum/yeni" className="l2t-btn" style={{ background: "var(--l2t-blue)", color: "#fff", border: "none" }}>Forumda Soru Sor</Link>
            <Link href="/ucak-bileti-ara" className="l2t-btn" style={{ background: "var(--l2t-navy)", color: "#fff", border: "none" }}>Uçak Bileti Ara</Link>
          </div>
        </div>
      </div>
    );
  }

  // Ortak render fonksiyonları
  const renderWarning = (text: string) => (
    <div style={{ background: "#FEF2F2", borderLeft: "4px solid #EF4444", padding: "16px 20px", borderRadius: "0 16px 16px 0", marginBottom: "40px", display: "flex", gap: "16px" }}>
      <ShieldCheck size={28} color="#EF4444" style={{ flexShrink: 0 }} />
      <div>
        <p style={{ margin: 0, color: "#991B1B", fontSize: "0.95rem", lineHeight: "1.6", fontWeight: "600" }}>{text}</p>
      </div>
    </div>
  );

  const renderSection = (title: string, items: string[]) => (
    <div style={{ marginBottom: "32px", background: "#fff", padding: "32px", borderRadius: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.03)", border: "1px solid #f1f5f9" }}>
      <h2 style={{ fontSize: "1.4rem", color: "var(--l2t-navy)", fontWeight: "800", margin: "0 0 20px" }}>{title}</h2>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "16px" }}>
        {items.map((item, i) => (
          <li key={i} style={{ display: "flex", gap: "12px", alignItems: "flex-start", color: "#334155", fontSize: "1.05rem", lineHeight: "1.6" }}>
            <CheckCircle2 size={20} color="#10B981" style={{ flexShrink: 0, marginTop: "4px" }} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  const renderTitle = (title: string, desc: string) => (
    <div style={{ marginBottom: "48px" }}>
      <Link href="/rehber-merkezi" style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "var(--l2t-blue)", textDecoration: "none", fontWeight: "600", marginBottom: "24px" }}>
        <ArrowLeft size={18} /> Rehber Merkezi'ne Dön
      </Link>
      <h1 style={{ fontSize: "2.8rem", color: "var(--l2t-navy)", fontWeight: "800", marginBottom: "16px", lineHeight: "1.2" }}>{title}</h1>
      <p style={{ fontSize: "1.15rem", color: "var(--l2t-soft)", lineHeight: "1.6" }}>{desc}</p>
      <div style={{ display: "flex", gap: "12px", alignItems: "center", marginTop: "24px", color: "#94a3b8", fontSize: "0.9rem" }}>
        <Calendar size={16} /> Son güncelleme: {new Date().toLocaleDateString("tr-TR")}
      </div>
    </div>
  );

  const renderCTAs = () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginTop: "64px" }}>
      <div style={{ background: "var(--l2t-navy)", padding: "32px", borderRadius: "24px", color: "#fff", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div>
          <Plane size={32} color="#F59E0B" style={{ marginBottom: "16px" }} />
          <h3 style={{ fontSize: "1.3rem", fontWeight: "800", marginBottom: "12px" }}>Seyahat Planınızı Yapın</h3>
          <p style={{ color: "rgba(255,255,255,0.8)", marginBottom: "24px", lineHeight: "1.5" }}>Aviasales güvencesiyle en uygun uçak biletlerini karşılaştırın ve anında satın alın.</p>
        </div>
        <Link href="/ucak-bileti-ara" className="l2t-btn" style={{ background: "#F59E0B", color: "var(--l2t-navy)", border: "none", alignSelf: "flex-start" }}>Uçak Bileti Ara</Link>
      </div>
      <div style={{ background: "var(--l2t-blue)", padding: "32px", borderRadius: "24px", color: "#fff", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div>
          <MessageSquare size={32} color="#fff" style={{ marginBottom: "16px" }} />
          <h3 style={{ fontSize: "1.3rem", fontWeight: "800", marginBottom: "12px" }}>Sorunuz Mu Var?</h3>
          <p style={{ color: "rgba(255,255,255,0.8)", marginBottom: "24px", lineHeight: "1.5" }}>Topluluğumuza katılın, deneyimli gezginlere aklınızdaki soruları sorun.</p>
        </div>
        <Link href="/forum" className="l2t-btn" style={{ background: "#fff", color: "var(--l2t-blue)", border: "none", alignSelf: "flex-start" }}>Foruma Göz At</Link>
      </div>
    </div>
  );

  return (
    <div className="l2t-page l2t-wrap" style={{ minHeight: "80vh", padding: "60px 20px" }}>
      <div style={{ maxWidth: "800px", margin: "0 auto" }}>
        
        {slug === "seyahat-sigortasi" && (
          <>
            {renderTitle("Seyahat Sigortası Rehberi", "Seyahat sigortasının kapsamı, vize gereklilikleri ve poliçe seçerken dikkat etmeniz gereken hayati detaylar.")}
            {renderWarning("Bu içerik bilgilendirme amaçlıdır. Poliçe kapsamı, teminatlar ve şartlar sigorta şirketine göre değişebilir. Satın almadan önce güncel poliçe şartlarını mutlaka inceleyin.")}
            
            {renderSection("Seyahat Sigortası Nedir ve Neden Gereklidir?", [
              "Yurt dışında yaşanabilecek sağlık sorunları, kaza, bagaj kaybı veya uçuş iptalleri gibi öngörülemeyen durumlara karşı maddi güvence sağlar.",
              "Özellikle Schengen bölgesi gibi vize isteyen ülkeler, başvurunuz sırasında zorunlu bir evrak olarak seyahat sağlık sigortasını talep eder.",
              "Vize başvurularında neden istenebilir? Çünkü konsolosluklar, kendi ülkelerinde yaşayacağınız herhangi bir sağlık veya kaza durumunda hastane masraflarınızı sizin adınıza karşılayacak uluslararası bir güvence arar."
            ])}

            {renderSection("Teminat Türleri Nelerdir?", [
              "Sağlık Teminatı: Ayakta veya yatarak tedavi, ameliyat, ilaç ve tıbbi nakil masraflarını kapsar. Genellikle Schengen vizeleri için en az 30.000 EUR teminatlı olmalıdır.",
              "Bagaj Kaybı ve Gecikme Teminatı: Havayolu şirketinin bagajınızı kaybetmesi, zarar vermesi veya geciktirmesi durumunda zararı karşılar.",
              "Seyahat İptali / Gecikme Teminatı: Bir hastalık, ölüm veya acil durum nedeniyle seyahatinizi iptal etmek zorunda kaldığınızda uçak bileti ve otel gibi iade edilemeyen harcamaları belirli koşullarda geri öder."
            ])}

            {renderSection("Yurt Dışına Çıkmadan Önce Sigorta Kontrol Listesi", [
              "Poliçem seyahat edeceğim ülkeyi (Örn: Tüm Avrupa / Tüm Dünya) kapsıyor mu?",
              "Poliçe tarihlerim seyahatimin başlangıç gününden bitiş gününe kadar (hatta 1 gün opsiyonlu) geçerli mi?",
              "Schengen seyahat sigortasında dikkat edilecekler: Teminat bedeli minimum 30.000 EUR mu ve 'vize reddi durumunda iade' seçeneği var mı?",
              "Poliçe üzerinde antetli kağıt, ıslak imza veya elektronik doğrulama kodu bulunuyor mu?",
              "Acil durumlarda aranacak 7/24 hizmet veren uluslararası yardım numarası poliçede yazılı mı?"
            ])}
          </>
        )}

        {slug === "konsolosluk-vize" && (
          <>
            {renderTitle("Konsolosluk & Vize İşlemleri", "Vize başvurusu, pasaport gereklilikleri ve konsolosluk randevu süreçleri hakkında pratik rehber.")}
            {renderWarning("Vize ve ülkeye giriş kuralları değişebilir. Seyahatten önce ilgili ülkenin resmi konsolosluk veya büyükelçilik kaynaklarını kontrol edin.")}
            
            {renderSection("Vize Başvurusu Öncesi Kontrol Listesi", [
              "Pasaport geçerlilik süresi kontrol edildi mi? (Çoğu ülke seyahat bitiş tarihinden itibaren en az 6 ay geçerlilik ister.)",
              "Biyometrik fotoğraflar istenen standartlara (örneğin Schengen için 35x45mm, güncel) uygun mu?",
              "Seyahat sağlık sigortası, seyahat tarihlerini eksiksiz kapsıyor mu?",
              "Uçak bileti rezervasyonları (gidiş-dönüş) ve otel konaklama belgeleri isimle eşleşiyor mu?",
              "Maddi durumu gösteren banka dökümleri kaşeli ve imzalı olarak alındı mı?"
            ])}

            {renderSection("Konsolosluk Randevusu Alırken Dikkat Edilecekler", [
              "Randevular genellikle yoğun dönemlerde (yaz ayları, resmi tatiller öncesi) çok çabuk dolar. Seyahatinizden en az 1-2 ay önce randevunuzu almaya çalışın.",
              "Aracı kurumları kullanırken resmi ve yetkilendirilmiş acenteler (VFS Global, iDATA, Kosmos vb.) olduğundan emin olun.",
              "Randevu sistemlerine mükerrer girişler veya yanlış beyanlar yapmak hesabınızın bloke olmasına neden olabilir."
            ])}

            {renderSection("Vize Reddi Durumunda Ne Yapılabilir?", [
              "Öncelikle size verilen 'Ret Mektubu'nu detaylıca okuyun. Ret maddeleri genellikle hangi belgenin eksik veya ikna edici bulunmadığını belirtir (örneğin madde 8 veya 9).",
              "Eksik belgelerinizi tamamlayıp yeni ve daha güçlü bir dosya ile tekrar başvuru yapabilirsiniz. Başvuru harcının iade edilmediğini unutmayın.",
              "Eğer konsolosluğun haksız bir değerlendirme yaptığını kanıtlayabiliyorsanız (çok nadirdir ancak mümkündür) itiraz dilekçesi (appeal) yazabilirsiniz."
            ])}
          </>
        )}

        {slug === "gezilecek-yerler" && (
          <>
            {renderTitle("Gezilecek Yerler Planlaması", "İlk seyahatinizden romantik hafta sonu kaçamaklarına kadar rota ve konum oluşturma stratejileri.")}
            {renderWarning("Bazı müzeler, anıtlar veya parklar mevsimsel olarak kapalı olabilir ya da önceden rezervasyon gerektirebilir. Plan yapmadan önce resmi siteleri ziyaret edin.")}

            {renderSection("Rota ve Şehir Seçimi Stratejileri", [
              "İlk kez yurt dışına gidenler için şehir seçimi: Ulaşımın kolay olduğu, İngilizce'nin yaygın konuşulduğu ve güvenlik endeksinin yüksek olduğu şehirler (Örn: Amsterdam, Prag, Viyana) başlangıç için idealdir.",
              "Aile için uygun gezilecek yerler: Geniş parklara, çocuk dostu müzelere ve güvenli yürüyüş alanlarına sahip destinasyonlara öncelik verin.",
              "Romantik rota önerileri: Kalabalıklardan uzak sahil kasabaları, tarihi dokusunu koruyan Avrupa köyleri veya nehir turları sunan şehirler öne çıkar.",
              "Kısa hafta sonu rotaları: Uçuş süresi 2-3 saati geçmeyen, havalimanından şehir merkezine transferin hızlı olduğu Balkan veya Doğu Avrupa şehirlerini tercih edin."
            ])}

            {renderSection("Ücretsiz Gezilecek Yerler Nasıl Bulunur?", [
              "Çoğu Avrupa şehrinde 'Free Walking Tour' (Ücretsiz Yürüyüş Turu) uygulamaları vardır. Rehbere sadece memnuniyetinize göre bahşiş verirsiniz.",
              "Önemli müzelerin ayın belirli günlerinde (örneğin Paris Louvre Müzesi için her ayın ilk pazarı gibi) ücretsiz giriş saatleri vardır.",
              "Tarihi katedrallerin, kütüphanelerin ve botanik parkların birçoğuna giriş her zaman ücretsizdir."
            ])}

            {renderSection("Harita ve Konum Planlaması", [
              "Seyahate çıkmadan önce Google Haritalar üzerinden 'Çevrimdışı Harita' indirin. Böylece internetiniz olmasa dahi GPS ile yol bulabilirsiniz.",
              "Gezilecek noktaları harita üzerinde yıldızlayarak günlük rotanızı mahalle mahalle bölün. Bu sizi gereksiz yol yorgunluğundan kurtarır."
            ])}
          </>
        )}

        {slug === "guvenli-bolgeler" && (
          <>
            {renderTitle("Güvenli Bölgeler & Turist Güvenliği", "Yurt dışında güvenlik risklerinden korunma, güvenli konaklama ve acil durumlarda alınacak önlemler.")}
            {renderWarning("Güvenlik durumu zamanla değişebilir. Seyahatten önce resmi seyahat uyarılarını ve yerel güncel bilgileri kontrol edin.")}

            {renderSection("İlk Kez Gidenler İçin Güvenlik İpuçları", [
              "İlk kez gidenler için güvenli bölge seçimi: Şehrin merkezine yakın, gece aydınlatması iyi olan ve toplu taşımaya kolay erişim sağlanan ilçeleri (district/arrondissement) seçin.",
              "Konaklama bölgesi seçerken dikkat edilecekler: Ucuz olduğu için çok uzak, sanayi bölgesi veya ana tren istasyonlarının arka sokaklarında yer alan otellerden kaçının.",
              "Gece dışarı çıkarken dikkat edilecekler: Pasaportunuzun orijinalini otel kasasında bırakın, sadece fotokopisini yanınıza alın. Fazla nakit taşımayın."
            ])}

            {renderSection("Sık Karşılaşılan Turistik Güvenlik Riskleri", [
              "Yankesicilik: Özellikle Paris, Roma, Barselona gibi şehirlerde metro binerken veya kalabalık meydanlarda fotoğraf çekerken çanta fermuarlarına dikkat edin.",
              "İmza/Bağış İsteyenler: Elinde bir kağıtla size yaklaşıp imza veya bağış isteyen gruplar genellikle dikkatinizi dağıtıp yankesicilik yapmaya çalışır.",
              "Dost Canlısı Rehberler: Size zorla bileklik takmaya çalışan veya restoran önerip sizi o restorana götürüp aşırı hesap gelmesini sağlayan kişilerden kibarca uzaklaşın."
            ])}

            {renderSection("Pasaport/Kimlik Kaybında Yapılacaklar", [
              "Hemen en yakın polis karakoluna giderek kayıp/çalıntı tutanağı tutturun. Bu tutanak olmadan işlem yapmanız çok zordur.",
              "Acil numaralar ve konsolosluk iletişimi: Tutanağı aldıktan sonra bulunduğunuz ülkedeki Türk Konsolosluğu/Büyükelçiliği ile iletişime geçin. Size Türkiye'ye dönebilmeniz için 'Geçici Seyahat Belgesi' (Pembe Pasaport) düzenlenecektir."
            ])}
          </>
        )}

        {slug === "kamp-doga" && (
          <>
            {renderTitle("Kamp & Doğa Rehberi", "Doğa tatilleri, kamp alanları, kurallar ve gerekli ekipman listeleri hakkında kapsamlı bilgi.")}
            {renderWarning("Kamp yapmadan önce bölgenin resmi kurallarını ve izin durumunu kontrol edin. İzinsiz kamp, ateş yakma veya koruma alanlarında kural ihlali yapmayın.")}

            {renderSection("Kamp Öncesi Ekipman Kontrol Listesi", [
              "Mevsime uygun, su geçirmez çadır ve zemin brandası.",
              "Gidilecek bölgenin gece sıcaklığına uygun konfor derecesine sahip uyku tulumu.",
              "Yeterli miktarda temiz içme suyu ve bozulmayan yüksek kalorili yiyecekler.",
              "İlk yardım çantası, kafa lambası, yedek piller ve powerbank.",
              "Böcek ve sinek kovucu spreyler."
            ])}

            {renderSection("Doğayı Koruma ve Yasal Kurallar", [
              "Ateş yakma kuralları: Ormanlık alanlarda ve milli parklarda genellikle ateş yakmak kesinlikle yasaktır. Sadece özel olarak belirlenmiş kamp alanlarındaki varillerde veya mangal alanlarında ateş yakılabilir.",
              "Milli park ve koruma alanı kuralları: Belirli bitki örtüsü ve yaban hayatını korumak için bazı parklara giriş izne tabidir veya belirli saatler dışında yasaktır.",
              "Çöp bırakmama: Doğada bırakacağınız hiçbir çöp (organik atıklar dahi) kabul edilemez. 'Leave No Trace' (İz Bırakma) prensibini uygulayın."
            ])}

            {renderSection("Acil Durum Hazırlığı", [
              "Hava durumu kontrolü: Dağlık alanlarda hava aniden değişebilir. Çıkmadan önce radarı ve fırtına uyarılarını mutlaka kontrol edin.",
              "Offline harita ve eSIM önerisi: Şebekenin çekmediği ormanlık alanlar için telefonunuza bölgesel topografik haritaları indirin. Acil durumlarda iletişim için bir eSIM yedekte bulundurmak faydalıdır."
            ])}
          </>
        )}

        {slug === "balikcilar-icin-bilgiler" && (
          <>
            {renderTitle("Balıkçılar İçin Bilgiler", "Amatör balıkçılık, bölgesel av izinleri ve sürdürülebilirlik üzerine rehber.")}
            {renderWarning("Balıkçılık kuralları ülke, bölge ve sezona göre değişir. Balık tutmadan önce resmi kurumların güncel kurallarını kontrol edin.")}

            {renderSection("Seyahatte Balıkçılık İçin Kontrol Listesi", [
              "Gidilecek ülkedeki/şehirdeki tatlı su veya tuzlu su balıkçılığı lisans gereksinimleri araştırıldı mı?",
              "Olta takımları (iğneler, misinalar) uçak yolculuğunda kabine alınmaz, bagaja verildi mi?",
              "Gidilecek bölgeye özgü ekipman ve yem kuralları öğrenildi mi?"
            ])}

            {renderSection("Yasal İzinler ve Kurallar", [
              "Amatör balıkçılık izinleri: Avrupa'da ve Kuzey Amerika'da göl, nehir veya deniz kıyısından balık tutmak için günlük, haftalık veya yıllık ücretli 'Fishing License' almak zorunludur.",
              "Yasak dönem ve av limitleri uyarısı: Balıkların üreme dönemlerinde (örneğin bahar ayları) avlanmak kesinlikle yasaktır. Ayrıca tutulabilecek balıkların minimum boy ve maksimum adet limitleri vardır.",
              "Bölgesel kurallar: Bazı bölgelerde sadece suni yem kullanılmasına izin verilirken, canlı yem kullanımı yasaklanmış olabilir ('Catch and Release' - Yakala ve Bırak bölgeleri)."
            ])}

            {renderSection("Kıyı Balıkçılığı ve Tekne Turu Farkı", [
              "Kıyıdan avlanmak genellikle bireysel lisans gerektirirken, özel tekne turlarına (charter) katıldığınızda lisans ücreti genellikle turun fiyatına dahildir.",
              "Sürdürülebilir balıkçılık uyarısı: Limit altı olan veya yumurtalı dişi balıkları suya zarar vermeden geri iade etmek doğaya olan sorumluluğumuzdur."
            ])}
          </>
        )}

        {slug === "avcilar-icin-yasal-bilgilendirme" && (
          <>
            {renderTitle("Avcılar İçin Yasal Bilgilendirme", "Yurt içi ve yurt dışı yasal avcılık kuralları, izin süreçleri ve koruma altındaki türler.")}
            {renderWarning("Avcılık yalnızca ilgili ülkenin ve bölgenin yasal izinleri kapsamında yapılabilir. Kurallar değişebilir; resmi kaynaklardan kontrol edilmelidir.")}

            {renderSection("Yasal Avcılık İzinleri ve Süreçleri", [
              "Avcılık için yasal izin gerekliliği: Herhangi bir ülkede veya bölgede avlanabilmek için ilgili devlet kurumlarından alınmış resmi avcılık sertifikası, avlanma pulu ve izin belgesi zorunludur.",
              "Ekipman taşıma ve ülke kuralları: Ülkeler arası silah ve mühimmat nakli, uluslararası havacılık kurallarına, gümrük yasalarına ve hedef ülkenin emniyet müdürlüğü onaylarına tabidir.",
              "Resmi kaynak kontrolü: Yabancı bir ülkede faaliyet göstermeden önce mutlaka o ülkenin Tarım, Orman veya Yaban Hayatı bakanlıklarının yayımladığı yıllık avlanma sirküleri okunmalıdır."
            ])}

            {renderSection("Kısıtlamalar ve Yasaklar", [
              "Av sezonu ve yasak dönem uyarısı: Hayvanların üreme ve büyüme dönemleri boyunca her türlü avcılık faaliyeti yasaktır.",
              "Koruma altındaki türler uyarısı: Nesli tükenmekte olan veya yerel ekosistem için kritik öneme sahip türlerin avlanması uluslararası yasalarla (CITES) suçtur.",
              "Milli park ve özel koruma alanı kuralları: Sınırları belirlenmiş milli parklar, yaban hayatı koruma sahaları ve tabiatı koruma alanlarına silahlı giriş yapmak ve avlanmak yasaktır."
            ])}

            {renderSection("Etik ve Sürdürülebilirlik", [
              "Etik ve sürdürülebilir doğa yaklaşımı: Yasal kurallar çerçevesinde doğanın dengesini bozmayacak şekilde hareket edilmeli, yerel halkın haklarına ve doğa koruma projelerine saygı gösterilmelidir."
            ])}
          </>
        )}

        {slug === "acil-durum-faydali-numaralar" && (
          <>
            {renderTitle("Acil Durum & Faydalı Numaralar", "Yurt dışında karşılaşılabilecek acil durumlarda iletişim kurulacak kritik merkezler.")}
            {renderWarning("Acil numaralar ülkeye göre değişir. Seyahatten önce gideceğiniz ülkenin resmi acil durum numaralarını kontrol edin.")}

            {renderSection("Kayıp Durumlarında Yapılacaklar", [
              "Pasaport kaybolursa ne yapılır? Öncelikle en yakın polis merkezine gidip tutanak tutturun. Ardından bulunduğunuz ülkedeki Türk Büyükelçiliği veya Konsolosluğu ile iletişime geçerek Geçici Seyahat Belgesi talebinde bulunun.",
              "Kimlik veya cüzdan kaybolursa ne yapılır? Kredi kartlarınızı mobil bankacılık üzerinden anında iptal edin. Pasaportunuz yanınızdaysa kimlik kaybı dönüşünüzü engellemez ancak Türkiye'ye döndüğünüzde Nüfus Müdürlüğüne bildirmeniz gerekir.",
              "Konsoloslukla nasıl iletişime geçilir? T.C. Dışişleri Bakanlığı'nın Konsolosluk Çağrı Merkezi'ne (+90 312 292 29 29) dünyanın her yerinden 7/24 ulaşabilirsiniz."
            ])}

            {renderSection("Sağlık ve Güvenlik Acil Durumları", [
              "Sağlık acil durumunda yapılacaklar: Eğer hayati tehlike varsa yerel ambulans servisini arayın (Avrupa'nın genelinde 112). Hafif durumlarda otelinizden veya yakındaki bir eczaneden yardım isteyin.",
              "Seyahat sigortası acil yardım hattı: Hastaneye gitmeden önce (veya yoldayken) mutlaka seyahat sigortanızın poliçesinde yazan 'Asistans Hizmeti' numarasını arayarak dosya açtırın. Aksi takdirde masraflarınız karşılanmayabilir.",
              "Polis / ambulans / acil durum numarası kontrolü: Amerika'da 911, İngiltere'de 999, Avrupa Birliği ülkelerinde genel acil çağrı numarası 112'dir."
            ])}

            {renderSection("Önleyici İpuçları", [
              "Yakınlara konum paylaşma önerisi: Yalnız seyahat ediyorsanız, Whatsapp veya Google Maps üzerinden güvendiğiniz bir yakınınıza 'Canlı Konum' paylaşımı yapmayı unutmayın."
            ])}
          </>
        )}

        {slug === "ulke-bazli-sorunlar" && (
          <>
            {renderTitle("Ülke Bazlı Sorunlar & Deneyimler", "Sınır geçişleri, vizeler, güvenlik riski vakaları ve ülkelere özel diğer kullanıcı bildirimleri.")}
            
            {renderSection("Sınır ve Vize Deneyimleri", [
              "Ülkeye girişte yaşanan sorunlar: Pasaport polisinin sorduğu dönüş bileti, otel rezervasyonu ve günlük nakit para/kredi kartı kontrollerinde yaşanan en son sıkıntılar.",
              "Vize ve konsolosluk deneyimleri: Randevu bulma zorlukları, başvurunun sonuçlanma süreleri ve spesifik konsoloslukların ekstra belge talepleri.",
              "Pasaport kontrolü deneyimleri: Vizesiz ülkelerde dahi yaşanan geri çevrilme (deport) vakaları ve sınır kapılarında dikkat edilmesi gereken iletişim tarzı."
            ])}

            {renderSection("Altyapı ve Güvenlik", [
              "Güvenlik riskleri ve uyarılar: Taksicilerin para üstü hataları, sahte polis kontrolleri veya restoranlarda menüsüz gelen yüksek hesaplar.",
              "Konaklama ve ulaşım sorunları: Airbnb/Booking iptalleri, geciken trenler veya otobüs firmalarının iptal politikalarındaki mağduriyetler.",
              "İnternet/eSIM deneyimleri: Hangi eSIM sağlayıcısının hangi ülkede zayıf çektiği, havalimanlarındaki fahiş fiziksel hat fiyatları."
            ])}

            <div style={{ background: "#F8FAFC", padding: "32px", borderRadius: "24px", textAlign: "center", border: "1px solid #e2e8f0" }}>
              <div style={{ marginBottom: "24px" }}>
                <Search size={40} color="var(--l2t-blue)" style={{ margin: "0 auto 16px" }} />
                <h3 style={{ fontSize: "1.3rem", color: "var(--l2t-navy)", fontWeight: "800", marginBottom: "8px" }}>Deneyimleri Aramaya Başlayın</h3>
                <p style={{ color: "var(--l2t-soft)", fontSize: "0.95rem", marginBottom: "24px" }}>Gideceğiniz ülkeyi arayarak veya forum konularına giderek diğer gezginlerin en güncel sorunlarını okuyun.</p>
              </div>
              <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
                <Link href="/forum" className="l2t-btn" style={{ background: "var(--l2t-blue)", color: "#fff", border: "none" }}>Foruma Git</Link>
                <Link href="/rehber-merkezi" className="l2t-btn l2t-btn-outline">Rehberleri İncele</Link>
              </div>
            </div>
          </>
        )}

        {renderCTAs()}

      </div>
    </div>
  );
}
