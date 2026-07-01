import type { CountryGuide } from "./types";

export type CountrySeoFaq = {
  question: string;
  answer: string;
};

export type CountrySeoContent = {
  searchTitle: string;
  intro: string;
  bestFor: string[];
  beforeYouGo: string[];
  budgetTips: string[];
  localTips: string[];
  faq: CountrySeoFaq[];
};

const DEFAULT_SEO_CONTENT: CountrySeoContent = {
  searchTitle: "Seyahat planı, bütçe ve giriş notları",
  intro:
    "Bu rehber; vize durumunu, uçuş süresini, ortalama bilet bütçesini ve gerçek gezgin deneyimlerine geçiş yollarını tek yerde toplar. Seyahatten önce resmi kuralları kontrol edip bilet, konaklama ve internet hazırlığını aynı akışta tamamlayabilirsin.",
  bestFor: [
    "İlk kez yurt dışına çıkacak kullanıcılar",
    "Kısa süreli hafta sonu kaçamağı planlayanlar",
    "Vize süreciyle uğraşmadan rota seçmek isteyenler",
  ],
  beforeYouGo: [
    "Pasaport veya kimlik geçerliliğini kontrol et.",
    "Dönüş bileti ve konaklama bilgilerini hazır bulundur.",
    "Havayolu bagaj ve check-in kurallarını seyahatten önce incele.",
  ],
  budgetTips: [
    "Esnek tarih aralığıyla arama yap; hafta içi uçuşları çoğu zaman daha uygun olabilir.",
    "Fiyat alarmı kurarak hedef fiyatın altına düşen biletleri kaçırma.",
    "Konaklamada merkez dışı ama toplu taşımaya yakın bölgeleri karşılaştır.",
  ],
  localTips: [
    "Havalimanından merkeze ulaşımı gitmeden önce planla.",
    "İlk gün için az miktarda nakit ve çalışan bir internet paketi hazırla.",
    "Forumda aynı ülkeye giden gezginlerin güncel notlarını kontrol et.",
  ],
  faq: [],
};

const COUNTRY_SEO_CONTENT: Record<string, Partial<CountrySeoContent>> = {
  azerbaycan: {
    searchTitle: "Azerbaycan vize istiyor mu, kimlikle gidilir mi?",
    intro:
      "Azerbaycan, Türk vatandaşları için kimlikle gidilebilen en pratik yurt dışı rotalarından biridir. İstanbul ve Ankara çıkışlı uçuşlar kısa sürdüğü için Bakü; ilk yurt dışı deneyimi, hafta sonu kaçamağı ve kültür gezisi için güçlü bir seçenektir.",
    bestFor: ["İlk kez yurt dışına çıkacaklar", "Kimlikle seyahat etmek isteyenler", "Bakü şehir kaçamağı planlayanlar"],
    beforeYouGo: [
      "Yeni tip T.C. kimlik kartın veya geçerli pasaportun hazır olsun.",
      "Konaklama adresini ve dönüş biletini sınırda sorulma ihtimaline karşı sakla.",
      "Bakü içinde taksi/uygulama kullanacaksan internet paketini önceden hazırla.",
    ],
    budgetTips: [
      "Bakü uçuşlarında hafta içi dönüşlü kombinasyonları kontrol et.",
      "Fiyat alarmını GYD hedefiyle kur; kısa rotalarda kampanyalar hızlı tükenebilir.",
      "İçerişehir ve sahil hattına yakın ama metroya erişimi olan otelleri karşılaştır.",
    ],
    localTips: [
      "İçerişehir, Bulvar ve Haydar Aliyev Merkezi kısa seyahatte öncelikli görülebilir.",
      "Havalimanından merkeze taksi fiyatını binmeden önce uygulama üzerinden kontrol etmek iyi olur.",
      "Restoran ve müze önerileri için Azerbaycan forum başlığındaki güncel yorumlara bak.",
    ],
    faq: [
      { question: "Azerbaycan'a kimlikle gidilir mi?", answer: "Türk vatandaşları yeni tip T.C. kimlik kartıyla Azerbaycan'a seyahat edebilir. Seyahatten önce güncel resmi giriş şartlarını kontrol etmek gerekir." },
      { question: "Bakü kaç günde gezilir?", answer: "Bakü şehir merkezi için 2-3 gün genelde yeterlidir. Gobustan veya çevre gezileri eklenecekse 4 gün daha rahat olur." },
      { question: "Azerbaycan için fiyat alarmı kurmak mantıklı mı?", answer: "Evet. Kısa uçuş rotalarında kampanya fiyatları hızlı değişebilir; hedef fiyat belirleyip alarm kurmak avantaj sağlar." },
    ],
  },
  "bosna-hersek": {
    searchTitle: "Bosna Hersek vizesiz mi, Saraybosna kaç günde gezilir?",
    intro:
      "Bosna Hersek, vizesiz Balkan rotaları içinde hem kültür hem tarih hem de uygun bütçe arayanlar için öne çıkar. Saraybosna ve Mostar birlikte planlandığında kısa ama dolu bir gezi yapılabilir.",
    bestFor: ["Vizesiz Balkan turu planlayanlar", "Tarih ve kültür gezisi isteyenler", "Ekonomik hafta sonu rotası arayanlar"],
    beforeYouGo: [
      "Pasaport geçerlilik süresini ve güncel vizesiz kalış hakkını kontrol et.",
      "Saraybosna-Mostar ulaşımını seyahat günlerine göre önceden planla.",
      "Nakit kullanımına karşı yanında düşük miktarda yerel para veya euro bulundur.",
    ],
    budgetTips: [
      "Saraybosna uçuşlarında dönüş tarihini esnetmek ciddi fark yaratabilir.",
      "Mostar'ı günübirlik gezmek bütçeyi düşürür, konaklamayı Saraybosna merkezde tutabilirsin.",
      "Fiyat alarmını SJJ rotası için kurup kampanyaları takip et.",
    ],
    localTips: [
      "Başçarşı, Latin Köprüsü ve Umut Tüneli ilk plan içine alınabilir.",
      "Mostar için erken saatlerde hareket etmek kalabalığı azaltır.",
      "Kış aylarında hava sertleşebilir; kısa seyahatlerde katmanlı giyinmek iyi olur.",
    ],
    faq: [
      { question: "Bosna Hersek Türk vatandaşlarından vize istiyor mu?", answer: "Kısa süreli turistik seyahatlerde Türk vatandaşları için vizesiz giriş imkanı bulunur. Güncel kalış süresi ve koşullar seyahat öncesi kontrol edilmelidir." },
      { question: "Saraybosna ve Mostar kaç günde gezilir?", answer: "Saraybosna için 2 gün, Mostar ile birlikte 3-4 gün daha dengeli bir plan sunar." },
      { question: "Bosna Hersek pahalı mı?", answer: "Birçok Avrupa rotasına göre daha ekonomik olabilir; toplam bütçe uçak bileti ve konaklama dönemine göre değişir." },
    ],
  },
  karadag: {
    searchTitle: "Karadağ vizesiz mi, Budva ve Kotor planı nasıl yapılır?",
    intro:
      "Karadağ; Budva, Kotor ve Adriyatik kıyılarıyla vizesiz yaz rotaları arasında öne çıkar. Kısa uçuş süresi ve deniz tatili avantajı nedeniyle özellikle yaz başı ve eylül döneminde güçlü bir seçenektir.",
    bestFor: ["Vizesiz deniz tatili arayanlar", "Budva-Kotor rotası yapmak isteyenler", "Araç kiralayarak sahil gezisi planlayanlar"],
    beforeYouGo: [
      "Pasaport geçerliliğini ve kalış süresini kontrol et.",
      "Yaz döneminde konaklama fiyatları hızla artabileceği için erken rezervasyon yap.",
      "Araç kiralayacaksan ehliyet, depozito ve sigorta koşullarını önceden incele.",
    ],
    budgetTips: [
      "Tivat ve Podgorica uçuşlarını birlikte karşılaştır.",
      "Budva merkez yerine çevre bölgeleri kontrol etmek konaklamayı ucuzlatabilir.",
      "Haziran ve eylül tarihleri temmuz-ağustos dönemine göre daha dengeli olabilir.",
    ],
    localTips: [
      "Kotor Körfezi, Budva Eski Şehir ve Perast kısa seyahatte öncelikli duraklardır.",
      "Sahil şehirleri arasında toplu taşıma mümkün olsa da araç kiralama rota esnekliği sağlar.",
      "Yaz aylarında otopark ve trafik planını hesaba katmak gerekir.",
    ],
    faq: [
      { question: "Karadağ Türk vatandaşlarından vize istiyor mu?", answer: "Turistik kısa seyahatlerde Türk vatandaşları için vizesiz giriş imkanı vardır. Güncel koşullar seyahatten önce kontrol edilmelidir." },
      { question: "Karadağ için Tivat mı Podgorica mı daha mantıklı?", answer: "Budva ve Kotor ağırlıklı tatillerde Tivat daha yakın olabilir; fiyat uygunsa Podgorica da değerlendirilebilir." },
      { question: "Karadağ kaç günde gezilir?", answer: "Budva-Kotor-Perast hattı için 3-4 gün yeterli olabilir. Sahil ve doğa rotası uzatılacaksa 5-7 gün daha rahat olur." },
    ],
  },
  gurcistan: {
    searchTitle: "Gürcistan kimlikle gidilir mi, Tiflis ve Batum planı",
    intro:
      "Gürcistan, Türk vatandaşları için kimlikle gidilebilen yakın rotalardan biridir. Tiflis kültür, gastronomi ve şehir gezisi; Batum ise Karadeniz kıyısı ve kısa kaçamak için öne çıkar.",
    bestFor: ["Kimlikle yurt dışına çıkmak isteyenler", "Tiflis gastronomi gezisi planlayanlar", "Batum'a kısa kaçamak düşünenler"],
    beforeYouGo: [
      "Yeni tip T.C. kimlik kartını ve seyahat belgelerini kontrol et.",
      "Tiflis-Batum arası geçiş planını uçuş saatine göre ayarla.",
      "İnternet ve ulaşım uygulamalarını gitmeden önce kur.",
    ],
    budgetTips: [
      "Tiflis uçuşlarını TBS koduyla, Batum seçeneklerini ayrıca karşılaştır.",
      "Hafta içi uçuşlar ve erken saat dönüşler fiyat avantajı sağlayabilir.",
      "Fiyat alarmı kurarak kısa süreli kampanyaları kaçırma.",
    ],
    localTips: [
      "Tiflis'te Eski Şehir, Narikala ve sülfür hamamları ilk plana alınabilir.",
      "Batum için sahil hattı, Ali ve Nino heykeli ve botanik park değerlendirilebilir.",
      "Yeme-içme tarafında haçapuri ve hinkali deneyimi öne çıkar.",
    ],
    faq: [
      { question: "Gürcistan'a kimlikle gidilir mi?", answer: "Türk vatandaşları yeni tip T.C. kimlik kartıyla Gürcistan'a seyahat edebilir. Güncel giriş şartları seyahatten önce kontrol edilmelidir." },
      { question: "Tiflis mi Batum mu?", answer: "Kültür ve gastronomi için Tiflis, deniz ve kısa kıyı kaçamağı için Batum daha uygun olabilir." },
      { question: "Gürcistan pahalı mı?", answer: "Bütçe seçilen şehir, sezon ve konaklama standardına göre değişir; erken bilet ve konaklama planı toplam maliyeti düşürür." },
    ],
  },
  arnavutluk: {
    searchTitle: "Arnavutluk vizesiz mi, Tiran ve Ksamil planı",
    intro:
      "Arnavutluk, vizesiz Balkan rotaları içinde hem şehir gezisi hem de ekonomik deniz tatili arayanlar için yükselen seçeneklerden biridir. Tiran kısa şehir gezisi, Ksamil ve Saranda ise yaz tatili için öne çıkar.",
    bestFor: ["Vizesiz yaz tatili arayanlar", "Ekonomik Balkan rotası isteyenler", "Araç kiralayarak kıyı gezisi yapmak isteyenler"],
    beforeYouGo: [
      "Pasaport ve güncel giriş koşullarını kontrol et.",
      "Sahil rotası planlıyorsan araç kiralama koşullarını önceden incele.",
      "Yaz sezonunda konaklamayı erken ayarlamak fiyatı düşürebilir.",
    ],
    budgetTips: [
      "Tiran uçuş fiyatlarını eylül-haziran gibi omuz sezonlarda takip et.",
      "Ksamil/Saranda konaklamalarında merkeze yakınlık ile fiyatı karşılaştır.",
      "Sahil rotasında ulaşım maliyetini toplam bütçeye dahil et.",
    ],
    localTips: [
      "Tiran, Berat, Gjirokaster ve Ksamil farklı gezi türleri sunar.",
      "Sahil yolunda mesafeler kısa görünse de süreler uzayabilir.",
      "Nakit kullanımına hazırlıklı olmak bazı küçük yerlerde kolaylık sağlar.",
    ],
  },
  sirbistan: {
    searchTitle: "Sırbistan vizesiz mi, Belgrad gezi planı",
    intro:
      "Sırbistan, kısa uçuş süresi ve hareketli şehir hayatıyla vizesiz hafta sonu rotaları arasında güçlü bir alternatiftir. Belgrad; kafe kültürü, nehir kıyısı ve gece hayatıyla öne çıkar.",
    bestFor: ["Hafta sonu şehir kaçamağı isteyenler", "Vizesiz Balkan rotası arayanlar", "Belgrad gece hayatı ve kafe kültürü planlayanlar"],
    beforeYouGo: [
      "Pasaport geçerliliğini ve güncel vizesiz kalış hakkını kontrol et.",
      "Havalimanı transferini önceden planla.",
      "Kış aylarında soğuk hava ihtimaline göre hazırlık yap.",
    ],
    budgetTips: [
      "Belgrad uçuşlarında farklı havayolları ve dönüş saatlerini karşılaştır.",
      "Merkez dışı ama toplu taşımaya yakın konaklamalar bütçeyi düşürebilir.",
      "Fiyat alarmını BEG rotası için kurmak kampanya takibini kolaylaştırır.",
    ],
    localTips: [
      "Kalemegdan, Knez Mihailova ve Skadarlija kısa seyahatte ana duraklardır.",
      "Nehir kıyısı mekanları yaz aylarında daha hareketlidir.",
      "Forumda güncel restoran ve ulaşım önerilerini kontrol etmek faydalı olur.",
    ],
  },
  kosova: {
    searchTitle: "Kosova vizesiz mi, Priştine kısa gezi planı",
    intro:
      "Kosova, kısa uçuş süresi ve uygun Balkan atmosferiyle hafta sonu için değerlendirilebilecek vizesiz rotalardan biridir. Priştine ve Prizren birlikte planlandığında daha dengeli bir gezi çıkar.",
    bestFor: ["Kısa Balkan kaçamağı isteyenler", "Ekonomik rota arayanlar", "Priştine-Prizren kültür gezisi planlayanlar"],
    beforeYouGo: ["Pasaport ve giriş koşullarını kontrol et.", "Priştine-Prizren ulaşımını önceden planla.", "Kısa gezilerde dönüş saatini şehir içi ulaşımı düşünerek seç."],
    budgetTips: ["PRN uçuşlarını erken takip etmek avantaj sağlar.", "Kısa konaklamalarda merkezi oteller ulaşım maliyetini azaltabilir.", "Fiyat alarmı ile ani kampanyaları yakalayabilirsin."],
    localTips: ["Priştine merkez yürüyerek gezilebilir.", "Prizren tarihi dokusuyla eklenmeye değer.", "Balkan mutfağı ve kafe kültürü öne çıkar."],
  },
};

export function getCountrySeoContent(country: CountryGuide): CountrySeoContent {
  const custom = COUNTRY_SEO_CONTENT[country.slug] || {};
  const faq = custom.faq && custom.faq.length > 0
    ? custom.faq
    : [
        {
          question: `${country.country_name} Türk vatandaşlarından vize istiyor mu?`,
          answer: country.visa_note,
        },
        {
          question: `${country.country_name} uçuş süresi ne kadar?`,
          answer: `Türkiye çıkışlı uçuşlarda ortalama süre ${country.flight_duration}. Uçuş süresi aktarma, havayolu ve kalkış şehrine göre değişebilir.`,
        },
        {
          question: `${country.country_name} için fiyat alarmı kurulur mu?`,
          answer: `Evet. ${country.airport_code || country.country_name} rotası için hedef fiyat belirleyerek bilet fiyatı düştüğünde e-posta bildirimi alabilirsin.`,
        },
      ];

  return {
    ...DEFAULT_SEO_CONTENT,
    ...custom,
    faq,
  };
}
