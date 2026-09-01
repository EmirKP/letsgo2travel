import type { BlogPost, CountryGuide } from "./types";
import { siteSettings, trackedAffiliateUrl } from "./affiliate";

export const countryGuides: CountryGuide[] = [
  {
    id: 1,
    slug: "azerbaycan",
    country_code: "AZ",
    country_name: "Azerbaycan",
    continent: "Asya",
    region: "Kafkasya",
    emoji: "🇦🇿",
    icon_image: "/images/icon_generic_1781363859446.png",
    visa_status: "kimlikle",
    visa_note: "Türk vatandaşları yeni tip kimlikle giriş yapabilir.",
    flight_duration: "2 saat 45 dakika",
    best_months: "Nisan, Mayıs, Eylül, Ekim",
    airport_code: "GYD",
    is_popular: true,
    hero_image_url: "/travel-images/route-baku.jpg",
    content_markdown:
      "Bakü; kısa uçuş süresi, kimlikle giriş kolaylığı ve uygun şehir içi maliyetleriyle ilk yurt dışı seyahati için güçlü seçeneklerden biridir. Şehir merkezi, sahil hattı ve tarihi iç şehir kısa sürede gezilebilir.",
  },
  {
    id: 2,
    slug: "bosna-hersek",
    country_code: "BA",
    country_name: "Bosna Hersek",
    continent: "Avrupa",
    region: "Balkanlar",
    emoji: "🇧🇦",
    icon_image: "/images/icon_generic_1781363859446.png",
    visa_status: "vizesiz",
    visa_note: "180 gün içinde 90 güne kadar vizesiz kalış imkanı vardır.",
    flight_duration: "2 saat",
    best_months: "Mayıs, Haziran, Eylül",
    airport_code: "SJJ",
    is_popular: true,
    hero_image_url: "/travel-images/route-saraybosna.jpg",
    content_markdown:
      "<p><strong>Neden Bosna Hersek?</strong> Tarihi dokusu, çok kültürlü yapısı, hüzünlü yakın geçmişi ve yemyeşil doğasıyla hem kültürel hem de duygusal bir seyahat deneyimi sunar.</p><ul><li><strong>Gezilecek Yerler:</strong> Saraybosna Başçarşı (Bascarsija), Latin Köprüsü, Umut Tüneli, ikonik Mostar Köprüsü, Blagaj Tekkesi ve Kravice Şelaleleri mutlaka görülmesi gereken yerlerdir.</li><li><strong>Yeme-İçme:</strong> Balkan mutfağının incisi Cevapi (Cevapcici - Bosna köftesi), Boşnak böreği, begova çorbası ve geleneksel fincanda sunulan Boşnak kahvesi denenmeden dönülmemelidir. Porsiyonlar inanılmaz büyüktür ve fiyatlar çok ekonomiktir.</li><li><strong>Pratik Bilgi:</strong> Saraybosna ve Mostar arası tren yolculuğu, Avrupa'nın en manzaralı tren rotalarından biridir. Sadece 2-3 saat sürer ve çok ucuzdur.</li></ul><p>Vizesiz olması, düşük bütçeyle gezilebilmesi ve bize çok tanıdık gelen misafirperver kültürüyle kısa hafta sonu tatillerinin en popüler rotalarından biridir.</p>",
  },
  {
    id: 3,
    slug: "karadag",
    country_code: "ME",
    country_name: "Karadağ",
    continent: "Avrupa",
    region: "Balkanlar",
    emoji: "🇲🇪",
    icon_image: "/images/icon_generic_1781363859446.png",
    visa_status: "vizesiz",
    visa_note: "Türk vatandaşları turistik seyahatlerde vizesiz giriş yapabilir.",
    flight_duration: "1 saat 45 dakika",
    best_months: "Haziran, Eylül",
    airport_code: "TGD",
    is_popular: true,
    hero_image_url: "/travel-images/route-summer.jpg",
    content_markdown:
      "<p><strong>Neden Karadağ?</strong> Karadağ, Adriyatik kıyısındaki eşsiz plajları, Orta Çağ'dan kalma tarihi dokusu ve nispeten uygun bütçesiyle vizesiz rotaların vazgeçilmezidir.</p><ul><li><strong>Gezilecek Yerler:</strong> Muhteşem manzarasıyla Kotor Körfezi, gece hayatıyla meşhur Budva Eski Şehir (Stari Grad), lüks marinasıyla Porto Montenegro, ikonik Sveti Stefan adası, sakin Perast kasabası ve doğa severler için Durmitor Milli Parkı.</li><li><strong>Yeme-İçme ve Kültür:</strong> Taze deniz ürünleri, Balkan köftesi (Cevapi), siyah risotto ve yerel şaraplar oldukça meşhurdur. Porsiyonlar büyüktür ve fiyatlar diğer Avrupa sahil kasabalarına göre daha ulaşılabilirdir.</li><li><strong>Ulaşım Tavsiyesi:</strong> Tivat veya başkent Podgorica havalimanlarına inip araç kiralayarak tüm sahil şeridini 2-3 gün içinde keşfetmek en popüler ve konforlu rotadır.</li></ul><p>Kısa uçuş süresi ve vizesiz giriş avantajı nedeniyle özellikle yaz aylarında uzun deniz tatilleri veya bahar aylarında romantik hafta sonu kaçamakları için mükemmel bir destinasyondur.</p>",
  },
  {
    id: 4,
    slug: "arnavutluk",
    country_code: "AL",
    country_name: "Arnavutluk",
    continent: "Avrupa",
    region: "Balkanlar",
    emoji: "🇦🇱",
    icon_image: "/images/icon_generic_1781363859446.png",
    visa_status: "vizesiz",
    visa_note: "Türk vatandaşları turistik amaçlı vizesiz seyahat edebilir.",
    flight_duration: "1 saat 45 dakika",
    best_months: "Haziran, Eylül",
    airport_code: "TIA",
    is_popular: true,
    hero_image_url: "/travel-images/route-summer.jpg",
    content_markdown:
      "<p><strong>Neden Arnavutluk?</strong> Avrupa'nın Maldivleri olarak bilinen güney sahilleri, el değmemiş doğası ve Avrupa standartlarına göre son derece düşük bütçesiyle yükselen bir destinasyondur.</p><ul><li><strong>Gezilecek Yerler:</strong> Başkent Tiran'ın renkli sokakları ve Bunk'Art müzeleri; yaz ayları için Ksamil sahilleri, Saranda, tarihi berat kasabası (Bin Pencereli Şehir) ve doğa tutkunları için Theth Milli Parkı.</li><li><strong>Yeme-İçme:</strong> Taze deniz ürünleri, İtalyan mutfağına taş çıkaran pizzalar/makarnalar (İtalya'ya olan yakınlığı sebebiyle) ve Trileçe tatlısının en güzel hallerini burada bulabilirsiniz.</li><li><strong>Ulaşım Tavsiyesi:</strong> Toplu taşıma altyapısı çok gelişmiş olmadığı için, sahil şeridini ve dağ köylerini hakkıyla gezebilmek adına havalimanından araç kiralamak kesinlikle önerilir.</li></ul><p>Tiran, Ksamil ve Saranda hattı; yaz aylarında ekonomik deniz tatili arayanlar için öne çıkar. Erken rezervasyon ile çok uygun fiyatlara muazzam bir yaz tatili planlanabilir.</p>",
  },
  {
    id: 5,
    slug: "gurcistan",
    country_code: "GE",
    country_name: "Gürcistan",
    continent: "Asya",
    region: "Kafkasya",
    emoji: "🇬🇪",
    icon_image: "/images/icon_generic_1781363859446.png",
    visa_status: "kimlikle",
    visa_note: "Yeni tip kimlikle giriş yapılabilir.",
    flight_duration: "2 saat 15 dakika",
    best_months: "Mayıs, Haziran, Eylül, Ekim",
    airport_code: "TBS",
    is_popular: false,
    hero_image_url: "/travel-images/route-generic.jpg",
    content_markdown:
      "<p><strong>Neden Gürcistan?</strong> Pasaporta dahi ihtiyaç duymadan, sadece yeni tip T.C. kimlik kartınızla giriş yapabileceğiniz, vizesiz ötesi bir kolaylık sunan sınır komşumuzdur.</p><ul><li><strong>Gezilecek Yerler:</strong> Başkent Tiflis'in bohem kafeleri, Narikala Kalesi ve kükürt hamamları (Abanotubani); Karadeniz kıyısındaki modern Batum heykelleri (Ali ve Nino) ve botanik parkı; doğa tutkunları için Kazbegi dağları mutlaka görülmelidir.</li><li><strong>Yeme-İçme:</strong> Meşhur peynirli pide Haçapuri, büyük etli mantı Hinkali (Khinkali) ve kendine has yapım teknikleriyle dünyanın en eski şarap kültürlerinden biri olan Gürcü şarapları seyahatin tadını çıkarmanızı sağlar.</li><li><strong>Pratik Bilgi:</strong> Özellikle Artvin-Sarp sınır kapısından yürüyerek bile Batum'a geçmek mümkündür. Kimlikle giriş yapılabilmesi, ilk yurt dışı seyahati için bürokratik engelleri tamamen ortadan kaldırır.</li></ul><p>Tiflis; düşük bütçeli gastronomi, kültür ve hafta sonu seyahati için güçlü bir alternatiftir.</p>",
  },
  {
    id: 6,
    slug: "sirbistan",
    country_code: "RS",
    country_name: "Sırbistan",
    continent: "Avrupa",
    region: "Balkanlar",
    emoji: "🇷🇸",
    icon_image: "/images/icon_generic_1781363859446.png",
    visa_status: "vizesiz",
    visa_note: "Kısa süreli turistik seyahatlerde vize istenmez.",
    flight_duration: "1 saat 40 dakika",
    best_months: "Nisan, Mayıs, Eylül",
    airport_code: "BEG",
    is_popular: false,
    hero_image_url: "/travel-images/route-generic.jpg",
    content_markdown:
      "<p><strong>Neden Sırbistan?</strong> Tuna ve Sava nehirlerinin buluştuğu noktada kurulan başkent Belgrad, bitmeyen gece hayatı, festivalleri ve genç nüfusuyla Balkanlar'ın en hareketli rotasıdır.</p><ul><li><strong>Gezilecek Yerler:</strong> Belgrad Kalesi (Kalemegdan), bohem sokak Skadarlija, devasa Aziz Sava Katedrali, modern kafe ve barlarıyla ünlü Knez Mihailova Caddesi, ve Zemun bölgesi.</li><li><strong>Yeme-İçme:</strong> Izgara etlerin (Pljeskavica) ve hamur işlerinin ağırlıkta olduğu zengin bir Balkan mutfağı vardır. Skadarlija bölgesindeki geleneksel restoranlarda canlı müzik eşliğinde akşam yemeği oldukça popülerdir.</li><li><strong>Gece Hayatı:</strong> Belgrad, Avrupa'nın gece hayatı başkentlerinden biri olarak kabul edilir. Nehir üzerindeki yüzer kulüpler (Splavlar) yaz aylarında sabahın ilk ışıklarına kadar eğlence sunar.</li></ul><p>Hafta sonu kaçamağı için kısa uçuş avantajı, dinamik şehir hayatı ve ekonomik fiyatlarıyla ideal bir vizesiz destinasyondur.</p>",
  },
  {
    id: 7,
    slug: "makedonya",
    country_code: "MK",
    country_name: "Kuzey Makedonya",
    continent: "Avrupa",
    region: "Balkanlar",
    emoji: "🇲🇰",
    icon_image: "/images/icon_generic_1781363859446.png",
    visa_status: "vizesiz",
    visa_note: "Turistik ziyaretlerde 90 güne kadar vizesizdir.",
    flight_duration: "1 saat 25 dakika",
    best_months: "Mayıs, Haziran, Eylül",
    airport_code: "SKP",
    is_popular: false,
    hero_image_url: "/travel-images/route-generic.jpg",
    content_markdown:
      "<p><strong>Neden Kuzey Makedonya?</strong> Hem Osmanlı esintilerini taşıyan başkent Üsküp hem de muazzam doğası ve gölüyle ünlü Ohrid, vizesiz rotalar arasında sakinliği ve tarihi bir arada arayanlar için en bütçe dostu ülkelerden biridir.</p><ul><li><strong>Gezilecek Yerler:</strong> Üsküp'te heykellerle dolu Makedonya Meydanı, Taş Köprü, Eski Çarşı ve Matka Kanyonu; güneyde ise UNESCO mirası Ohrid Gölü ve çevresindeki tarihi kiliseler (özellikle St. John at Kaneo).</li><li><strong>Yeme-İçme:</strong> Balkan mutfağı burada da hakimdir; köfte, börek, kuru fasulye (Tavce Gravce), Trileçe ve taze göl balıkları denenmelidir.</li><li><strong>Pratik Bilgi:</strong> Üsküp ve Ohrid arası otobüslerle 3 saat sürer. Üsküp daha çok tarihi/kültürel bir tur, Ohrid ise doğa ve dinginlik (yazın ise plaj/göl tatili) arayanlara hitap eder.</li></ul><p>Küçük bir ülke olduğu için 3-4 günlük kısa bir tatilde iki önemli şehrini de gezebilirsiniz.</p>",
  },
  {
    id: 8,
    slug: "kosova",
    country_code: "XK",
    country_name: "Kosova",
    continent: "Avrupa",
    region: "Balkanlar",
    emoji: "🇽🇰",
    icon_image: "/images/icon_generic_1781363859446.png",
    visa_status: "vizesiz",
    visa_note: "Turistik kısa seyahatlerde vize gerektirmeyen Balkan rotalarındandır.",
    flight_duration: "1 saat 40 dakika",
    best_months: "Nisan, Mayıs, Eylül, Ekim",
    airport_code: "PRN",
    is_popular: false,
    hero_image_url: "/travel-images/route-generic.jpg",
    content_markdown:
      "Priştine; kısa uçuş süresi, uygun ulaşım ve Balkan atmosferiyle hafta sonu seyahatleri için değerlendirilebilir.",
  },
  {
    id: 9,
    slug: "italya",
    country_code: "IT",
    country_name: "İtalya",
    continent: "Avrupa",
    region: "Güney Avrupa",
    emoji: "🇮🇹",
    visa_status: "vizeli",
    visa_note: "Kısa süreli seyahatlerde genellikle Schengen vizesi gerekir; güncel şartları resmî kaynaktan doğrulayın.",
    flight_duration: "2 saat 40 dakika",
    best_months: "Nisan, Mayıs, Eylül, Ekim",
    airport_code: "FCO",
    is_popular: true,
    hero_image_url: "/destinations/italy/colosseum.jpg",
    content_markdown: "Roma, Floransa ve Venedik; tarih, sanat ve gastronomiyi aynı rotada birleştiren güçlü şehir seçenekleridir.",
  },
  {
    id: 10,
    slug: "cekya",
    country_code: "CZ",
    country_name: "Çekya",
    continent: "Avrupa",
    region: "Orta Avrupa",
    emoji: "🇨🇿",
    visa_status: "vizeli",
    visa_note: "Kısa süreli seyahatlerde genellikle Schengen vizesi gerekir; güncel şartları resmî kaynaktan doğrulayın.",
    flight_duration: "2 saat 45 dakika",
    best_months: "Nisan, Mayıs, Eylül, Aralık",
    airport_code: "PRG",
    is_popular: true,
    hero_image_url: "/destinations/prague/charles-bridge.jpg",
    content_markdown: "Prag; yürüyerek gezilebilen tarihi merkezi ve kısa şehir kaçamaklarına uygun yapısıyla öne çıkar.",
  },
  {
    id: 11,
    slug: "fransa",
    country_code: "FR",
    country_name: "Fransa",
    continent: "Avrupa",
    region: "Batı Avrupa",
    emoji: "🇫🇷",
    visa_status: "vizeli",
    visa_note: "Kısa süreli seyahatlerde genellikle Schengen vizesi gerekir; güncel şartları resmî kaynaktan doğrulayın.",
    flight_duration: "3 saat 40 dakika",
    best_months: "Nisan, Mayıs, Eylül, Ekim",
    airport_code: "CDG",
    is_popular: true,
    hero_image_url: "/destinations/paris-eiffel.jpg",
    content_markdown: "Paris; müze, mimari ve mahalle keşfini bir araya getiren, planlı bütçe gerektiren yoğun bir şehir rotasıdır.",
  },
  {
    id: 12,
    slug: "macaristan",
    country_code: "HU",
    country_name: "Macaristan",
    continent: "Avrupa",
    region: "Orta Avrupa",
    emoji: "🇭🇺",
    visa_status: "vizeli",
    visa_note: "Kısa süreli seyahatlerde genellikle Schengen vizesi gerekir; güncel şartları resmî kaynaktan doğrulayın.",
    flight_duration: "2 saat 5 dakika",
    best_months: "Nisan, Mayıs, Eylül, Aralık",
    airport_code: "BUD",
    is_popular: true,
    hero_image_url: "/destinations/budapest/parliament.jpg",
    content_markdown: "Budapeşte; Tuna kıyısı, termal hamamları ve toplu taşıma ağıyla kısa Orta Avrupa gezileri için uygundur.",
  },
];

export const blogPosts: BlogPost[] = [
  {
    id: 1,
    slug: "ilk-kez-yurt-disina-cikacaklara-rehber",
    title: "İlk kez yurt dışına çıkacaklara pratik rehber",
    excerpt: "Pasaport, uçuş, havalimanı ve varış sonrası yapılacakları sade bir listeyle öğren.",
    category: "Başlangıç Rehberi",
    read_time: "6 dk",
    image_url: "/travel-images/discover.jpg",
    author: "Letsgo2Travel",
    published_at: new Date().toISOString(),
    content: `İlk yurt dışı seyahati heyecan verici olduğu kadar stresli de olabilir. Pasaport, vize, uçuş, havalimanı ve varış sonrası yapılacakları sade bir listeyle sizin için derledik.

### 1. Belgeler ve Hazırlık
Seyahate çıkmadan önce belgelerinizin eksiksiz olduğundan emin olun:
- **Pasaport ve Vize:** Gideceğiniz ülkenin vize isteyip istemediğini kontrol edin. Pasaportunuzun en az 6 ay geçerliliği olması önemlidir.
- **Konaklama ve Dönüş Bileti:** Sınır polisleri sıklıkla dönüş biletinizi ve nerede konaklayacağınızı sorar. Çıktılarını yanınızda bulundurun.
- **Seyahat Sağlık Sigortası:** Olası sağlık sorunlarına karşı mutlaka yaptırın.

### 2. Havalimanı Süreci
Havalimanında stres yaşamamak için:
- Uçuştan en az **2.5 - 3 saat önce** havalimanında olun.
- Online check-in işlemini 24 saat önceden yaparsanız zamandan tasarruf edersiniz.
- Bagaj kurallarına (sıvı kısıtlamaları, kg sınırı) mutlaka dikkat edin.

> ⚠️ **Uyarı:** Powerbank ve lityum pilli elektronik eşyalarınızı mutlaka el bagajınıza alın, uçak altı (kayıtlı) bagaja vermeyin.

### 3. İletişim ve İnternet (eSIM)
Yurt dışına adım attığınız an internete bağlı olmak hayat kurtarır. Eskiden fiziksel SIM kart aramak gerekirdi, artık eSIM ile çok daha kolay:
- Seyahate çıkmadan önce **[Airalo üzerinden eSIM paketlerine göz atın](https://airalo.pxf.io/c/5594042/1041180/13318)**.
- Paketi Türkiye'deyken satın alıp kurun, uçaktan inince hemen aktifleşsin.

### 4. Konaklama ve Ulaşım
Varış sonrası için planınızı önceden yapın:
- Havalimanından otele nasıl gideceğinizi araştırın (otobüs, tren veya Uber/Bolt).
- Konaklamanızı **[Booking.com üzerinden](https://www.booking.com/index.html?aid=2389146)** filtreleyerek iptal esnekliği olan yerlerden seçmeniz faydalıdır.
- Yanınızda her ihtimale karşı az miktarda nakit (Döviz) bulundurun, ancak pek çok ülkede kredi/banka kartı (temassız) rahatça kullanılır.
`,
  },
  {
    id: 2,
    slug: "vizesiz-ulkeler-nasil-secilir",
    title: "Vizesiz ülke seçerken nelere bakmalı?",
    excerpt: "Sadece vize durumuna değil; uçak fiyatı, şehir içi maliyet ve sezon etkisine de bakmalısın.",
    category: "Vizesiz Rotalar",
    read_time: "5 dk",
    image_url: "/travel-images/route-summer.jpg",
    author: "Letsgo2Travel",
    published_at: new Date().toISOString(),
    content:
      "Vizesiz rota seçerken uçak bileti toplam maliyetin sadece bir parçasıdır. Konaklama, yeme içme, şehir içi ulaşım ve sezon yoğunluğu seyahat bütçesini doğrudan etkiler. Balkanlar genelde kısa kaçamak için güçlüdür.",
  },
  {
    id: 3,
    slug: "ucus-haric-seyahat-butcesi-planlama",
    title: "Uçuş hariç seyahat bütçesi nasıl planlanır?",
    excerpt: "Konaklama, şehir içi ulaşım, yeme içme ve acil durum payını tek tabloda planla.",
    category: "Seyahat Planlama",
    read_time: "7 dk",
    image_url: "/travel-images/live-flights.jpg",
    author: "Letsgo2Travel",
    published_at: new Date().toISOString(),
    content:
      "Seyahat bütçeni uçuş hariç kalemler üzerinden kur: konaklama, şehir içi ulaşım, yeme içme, etkinlik, eSIM, sigorta ve acil durum payı. Uçak biletini satın aldıktan sonra ödediğin gerçek tutarı Seyahat Kokpiti'ne ekleyerek toplam maliyeti netleştirebilirsin.",
  },
  {
    id: 4,
    slug: "otel-secimi-icin-5-kontrol",
    title: "Otel seçerken 5 hızlı kontrol",
    excerpt: "Konum, iptal politikası, son yorumlar ve ulaşım maliyetiyle daha doğru konaklama seç.",
    category: "Konaklama",
    read_time: "4 dk",
    image_url: "/travel-images/discover.jpg",
    author: "Letsgo2Travel",
    published_at: new Date().toISOString(),
    content:
      "Otel seçerken yalnızca gecelik fiyata bakma. Merkeze ulaşım, yorum tarihi, iptal esnekliği, kahvaltı durumu ve havalimanı bağlantısı toplam seyahat konforunu belirler.",
  },
  {
    id: 5,
    slug: "esim-mi-roaming-mi",
    title: "eSIM mi roaming mi daha mantıklı?",
    excerpt: "Kısa seyahatlerde internet maliyetini ve kullanım kolaylığını karşılaştır.",
    category: "eSIM",
    read_time: "4 dk",
    image_url: "/travel-images/live-flights.jpg",
    author: "Letsgo2Travel",
    published_at: new Date().toISOString(),
    content:
      "eSIM, uyumlu cihazlarda varıştan önce interneti hazır hale getirir. Roaming ise operatöre göre pratik olabilir ancak ücretleri kontrol etmek gerekir. Gideceğin ülke, gün sayısı ve veri ihtiyacı karar verir.",
  },
];

export const affiliateCards = [
  {
    title: "eSIM internet",
    text: "Yurt dışında fiziksel SIM kart aramadan internet paketini seyahatten önce hazırla.",
    cta: "eSIM paketlerini gör",
    href: trackedAffiliateUrl({ provider: "airalo", url: siteSettings.airaloAffiliateUrl, sourcePage: "affiliate_cards" }),
  },
  {
    title: "Otel arama",
    text: "Konum, yorum, iptal esnekliği ve fiyat dengesine göre konaklama seçeneklerini karşılaştır.",
    cta: "Otelleri karşılaştır",
    href: trackedAffiliateUrl({ provider: "booking", url: siteSettings.bookingAffiliateUrl, sourcePage: "affiliate_cards" }),
  },
  {
    title: "Turlar & aktiviteler",
    text: "Şehir turu, müze bileti, tekne turu ve günlük aktivite seçeneklerini keşfet.",
    cta: "Aktiviteleri incele",
    href: trackedAffiliateUrl({ provider: "getyourguide", url: siteSettings.getYourGuideAffiliateUrl, sourcePage: "affiliate_cards" }),
  },
];
