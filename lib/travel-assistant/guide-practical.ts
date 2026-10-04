import type { GuideCard } from './types';

// Each entry was checked against its linked national tourism/government source.
// These are travel planning notes, not live opening times or local water alerts.
const checked = { verifiedAt: '2026-10-04', reviewAfter: '2027-01-02' };
export const PRACTICAL_GUIDES: GuideCard[] = [
  {
    ...checked, country: 'AL', category: 'law',
    sourceUrl: 'https://www.gov.uk/foreign-travel-advice/albania/safety-and-security',
    title: { tr: 'Araçla gezerken kaza prosedürü', en: 'Road accident procedure', sq: "Procedura pas një aksidenti rrugor" },
    text: {
      tr: 'FCDO rehberine göre, küçük bir trafik kazasında bile polis gelene kadar olay yerinde kalmalısın; beklemeden ayrılmak cezai sonuç doğurabilir. Araç kiralıyorsan şirketin kaza bildirim ve sigorta koşullarını önceden öğren.',
      en: 'The FCDO guide advises remaining at the scene of even a minor road accident until police arrive; leaving early can have legal consequences. If hiring a car, check the rental company’s accident-reporting and insurance procedures beforehand.',
      sq: "Sipas udhëzuesit të FCDO-së, duhet të qëndrosh në vendngjarje derisa të mbërrijë policia, edhe pas një aksidenti të vogël rrugor; largimi më herët mund të ketë pasoja ligjore. Nëse merr makinë me qira, mëso paraprakisht procedurat e kompanisë për raportimin e aksidenteve dhe kushtet e sigurimit.",
    },
  },
  {
    ...checked, country: 'XK', category: 'law',
    sourceUrl: 'https://www.gov.uk/foreign-travel-advice/kosovo/safety-and-security',
    title: { tr: 'Kimlik ve güvenlik alanlarında fotoğraf', en: 'ID and photography near security sites', sq: "Dokumentet dhe fotografimi pranë objekteve të sigurisë" },
    text: {
      tr: 'FCDO, pasaportunu yanında, bir kopyasını ise ayrı ve güvenli bir yerde tutmanı öneriyor. Askerî veya polis tesislerini, personelini ve araçlarını fotoğraflamak yetkililerle sorun yaşatabilir; güvenlik uyarılarına ve görevlilerin talimatlarına uy.',
      en: 'FCDO recommends carrying your passport and keeping a copy separately in a safe place. Photographing military or police premises, personnel or vehicles can cause difficulties with authorities; follow security notices and officials’ instructions.',
      sq: "FCDO rekomandon të mbash pasaportën me vete dhe një kopje të saj veçmas, në një vend të sigurt. Fotografimi i objekteve, personelit ose automjeteve ushtarake apo të policisë mund të krijojë probleme me autoritetet; respekto njoftimet e sigurisë dhe udhëzimet e zyrtarëve.",
    },
  },
  {
    ...checked, country: 'AT', category: 'water', status: 'drinkable',
    sourceUrl: 'https://www.austria.info/en-gb/planning/drinking-water/',
    title: { tr: 'Şebeke suyu ve mataran', en: 'Tap water and your refill bottle', sq: "Uji i rubinetit dhe shishja jote" },
    text: {
      tr: 'Avusturya’da kamu şebekesinden gelen su genel olarak içmeye uygundur. Mataranı musluktan doldurabilirsin. Bu bilgi göl, dere veya içilemez işaretli çeşmeler için geçerli değildir; geçici yerel duyurulara uy.',
      en: 'Public tap water in Austria is generally suitable for drinking, so you can refill your bottle. This does not cover lakes, streams or fountains marked non-potable; follow temporary local notices.',
      sq: "Uji nga rrjeti publik në Austri është përgjithësisht i përshtatshëm për t’u pirë, ndaj mund të mbushësh shishen në rubinet. Kjo nuk vlen për liqenet, përrenjtë ose çezmat e shënuara si të papijshme; ndiq njoftimet e përkohshme lokale.",
    },
  },
  {
    ...checked, country: 'FI', category: 'water', status: 'drinkable',
    sourceUrl: 'https://www.visitfinland.com/en/articles/11-sustainable-travel-tips/',
    title: { tr: 'Mataranı musluktan doldur', en: 'Refill from the tap', sq: "Mbush shishen nga rubineti" },
    text: {
      tr: 'Visit Finland, düzenli denetlenen şebeke suyunu içmek ve matarayı musluktan doldurmak için öneriyor. Doğadaki su kaynaklarını aynı kapsamda değerlendirme; içilemez işaretlerini ve yerel uyarıları dikkate al.',
      en: 'Visit Finland recommends drinking regularly tested tap water and refilling a reusable bottle. Do not extend this advice to untreated natural water; observe non-potable signs and local alerts.',
      sq: "Visit Finland rekomandon pirjen e ujit të rubinetit, i cili kontrollohet rregullisht, dhe mbushjen e një shisheje të ripërdorshme. Mos e zbato këtë këshillë për burimet natyrore me ujë të patrajtuar; respekto shenjat për ujë të papijshëm dhe paralajmërimet lokale.",
    },
  },
  {
    ...checked, country: 'CH', category: 'water', status: 'drinkable',
    sourceUrl: 'https://www.myswitzerland.com/en-gb/planning/about-switzerland/general-facts/general-information/drinking-water/',
    title: { tr: 'Şebeke suyu içilebilir', en: 'Drinkable tap water', sq: "Ujë rubineti i pijshëm" },
    text: {
      tr: 'İsviçre Turizm Ofisi, şebeke suyunun içmeye uygun olduğunu belirtiyor. Bu bilgi tüm doğal kaynakları veya süs havuzlarını kapsamaz. İçilemez işaretli çıkışları kullanma ve varsa yerel su uyarılarına uy.',
      en: 'Switzerland Tourism identifies public tap water as suitable for drinking. This does not cover every natural source or ornamental fountain. Avoid outlets marked non-potable and follow local water notices.',
      sq: "Switzerland Tourism e përshkruan ujin nga rrjeti publik si të përshtatshëm për t’u pirë. Kjo nuk përfshin çdo burim natyror ose shatërvan dekorativ. Mos përdor dalje uji të shënuara si të papijshme dhe ndiq njoftimet lokale për ujin.",
    },
  },
  {
    ...checked, country: 'NO', category: 'water', status: 'drinkable',
    sourceUrl: 'https://www.visitnorway.com/plan-your-trip/travel-tips-a-z/',
    title: { tr: 'Musluk suyu ve doğal kaynaklar', en: 'Tap water and natural sources', sq: "Uji i rubinetit dhe burimet natyrore" },
    text: {
      tr: 'Norveç’te şebeke suyu genel olarak içilebilir. Dağ ve akarsu suyunu otomatik olarak güvenli sayma; resmî turizm rehberi özellikle mera ve buzul akıntılarından kaçınılmasını söylüyor. Yerel uyarılar önceliklidir.',
      en: 'Tap water in Norway is generally drinkable. Do not assume mountain or stream water is safe: the national tourism guide specifically cautions against pasture runoff and glacial streams. Local notices take priority.',
      sq: "Uji i rubinetit në Norvegji është përgjithësisht i pijshëm. Mos supozo se uji i maleve ose i përrenjve është i sigurt: udhëzuesi kombëtar i turizmit paralajmëron veçanërisht për rrjedhjet nga kullotat dhe përrenjtë akullnajorë. Njoftimet lokale kanë përparësi.",
    },
  },
  {
    ...checked, country: 'ES', category: 'hours',
    sourceUrl: 'https://www.spain.info/en/travel-tips/opening-times-public-holidays-spain/',
    title: { tr: 'Geç yemek saatlerine hazırlan', en: 'Plan for later meals', sq: "Planifiko vakte në orare më të vona" },
    text: {
      tr: 'Restoranlarda öğle servisi çoğunlukla 13.00–16.00, akşam servisi 20.00’den sonra başlar. Bazı dükkânlar 14.00–17.00 arasında ara verebilir; pazar günü kapanış yaygındır. Bunlar genel alışkanlıklardır; gideceğin işletmenin saatini ve yerel tatilleri ayrıca kontrol et.',
      en: 'Lunch service is commonly around 13:00–16:00 and dinner starts from about 20:00. Some shops close between 14:00 and 17:00, and Sunday closures are common. These are general patterns; check the particular business and local holidays.',
      sq: "Dreka shërbehet zakonisht rreth orës 13:00–16:00 dhe darka fillon rreth orës 20:00. Disa dyqane mbyllen ndërmjet orës 14:00 dhe 17:00, ndërsa mbyllja të dielave është e zakonshme. Këto janë zakone të përgjithshme; kontrollo orarin e biznesit konkret dhe festat lokale.",
    },
  },
  {
    ...checked, country: 'CH', category: 'hours',
    sourceUrl: 'https://www.myswitzerland.com/en-gb/planning/about-switzerland/general-facts/money-and-shopping/business-hours/',
    title: { tr: 'Pazar alışverişini önceden planla', en: 'Plan Sunday shopping ahead', sq: "Planifiko paraprakisht blerjet e së dielës" },
    text: {
      tr: 'Mağazalar genellikle hafta içi 09.00–18.30, cumartesi 09.00–17.00 açıktır. Birçoğu pazar kapalıdır; istasyon ve havalimanı mağazaları istisna olabilir. Saatler kantona ve işletmeye göre değişir, kırsalda öğle arası görülebilir.',
      en: 'Typical shop hours are 09:00–18:30 on weekdays and 09:00–17:00 on Saturdays. Many close on Sundays, with exceptions at stations and airports. Hours vary by canton and business, and rural services may close at lunchtime.',
      sq: "Dyqanet zakonisht hapen 09:00–18:30 gjatë javës dhe 09:00–17:00 të shtunave. Shumë mbyllen të dielave, me përjashtime në stacione dhe aeroporte. Oraret ndryshojnë sipas kantonit dhe biznesit; në zonat rurale mund të ketë pushim në mesditë.",
    },
  },
  {
    ...checked, country: 'AT', category: 'hours',
    sourceUrl: 'https://www.bmwet.gv.at/en/Topics/Enterprise/Trades/Businesshours.html',
    title: { tr: 'Pazar ve tatil günü kapanışları', en: 'Sunday and holiday closures', sq: "Mbylljet të dielave dhe gjatë festave" },
    text: {
      tr: 'Perakende mağazaları pazar ve resmî tatillerde genel olarak kapalıdır. İstasyon, havalimanı ve bazı özel mağazalar ile bölgesel düzenlemeler istisna oluşturabilir. İzin verilen azami saatler, bir mağazanın gerçekten açık olduğu saatler değildir; alışverişten önce işletmeyi kontrol et.',
      en: 'Retail shops generally close on Sundays and public holidays. Station, airport and other special outlets or regional rules can provide exceptions. Legally permitted hours are not a shop’s actual schedule; check the business before visiting.',
      sq: "Dyqanet e shitjes me pakicë përgjithësisht mbyllen të dielave dhe gjatë festave zyrtare. Dyqanet në stacione, aeroporte e vende të tjera të veçanta ose rregullat rajonale mund të bëjnë përjashtim. Orari maksimal i lejuar me ligj nuk është orari real i një dyqani; kontrollo biznesin përpara vizitës.",
    },
  },
  {
    ...checked, country: 'NO', category: 'hours',
    sourceUrl: 'https://www.visitnorway.com/plan-your-trip/travel-tips-a-z/',
    title: { tr: 'Tatil günlerinde hizmetler azalabilir', en: 'Reduced services on public holidays', sq: "Shërbime të reduktuara gjatë festave zyrtare" },
    text: {
      tr: 'Resmî tatillerde mağazaların çoğu kapanır; toplu taşıma daha seyrek çalışabilir. Bazı müzeler pazar açık olsa da ertesi pazartesi kapalı olabilir. Günlük rotanı işletmenin takvimi ve ulaşımın güncel tarifesiyle doğrula.',
      en: 'Most shops close on public holidays and transit services may be reduced. Some museums open on Sundays but close on the following Monday. Confirm your daily plan against each venue’s calendar and the current transport timetable.',
      sq: "Shumica e dyqaneve mbyllen gjatë festave zyrtare dhe transporti publik mund të jetë më i rrallë. Disa muze hapen të dielave, por mbyllen të hënën pasuese. Verifiko planin ditor me kalendarin e secilit vend dhe orarin aktual të transportit.",
    },
  },
  {
    ...checked, country: 'SE', category: 'culture',
    sourceUrl: 'https://visitsweden.com/what-to-do/nature-outdoors/nature/the-right-of-public-access/',
    title: { tr: 'Doğada dolaşma hakkı sınırsız değildir', en: 'Responsible access to nature', sq: "Qasje e përgjegjshme në natyrë" },
    text: {
      tr: 'Doğada dolaşırken evlerin özel alanlarına ve koruma bölgelerinin işaretlerine saygı göster. Ateş yakmak her yerde serbest değildir; millî parklar, doğa rezervleri ve geçici yangın yasaklarının ayrı kuralları vardır. Çöpünü yanında götür ve güncel yerel kısıtlamaları kontrol et.',
      en: 'Respect private areas around homes and signs in protected areas when exploring outdoors. Fires are not allowed everywhere: national parks, reserves and temporary fire bans have their own rules. Take litter away and check current local restrictions.',
      sq: "Kur shëtit në natyrë, respekto hapësirat private pranë banesave dhe shenjat në zonat e mbrojtura. Ndezja e zjarrit nuk lejohet kudo: parqet kombëtare, rezervatet dhe ndalimet e përkohshme për shkak të rrezikut nga zjarri kanë rregullat e tyre. Merr mbeturinat me vete dhe kontrollo kufizimet aktuale lokale.",
    },
  },
  {
    ...checked, country: 'FI', category: 'culture',
    sourceUrl: 'https://www.visitfinland.com/en/articles/11-sustainable-travel-tips/',
    title: { tr: 'Fotoğraf ve doğada saygı', en: 'Photography and care for nature', sq: "Fotografimi dhe kujdesi për natyrën" },
    text: {
      tr: 'İnsanları fotoğraflamadan önce izin iste. Doğada, özellikle hassas Laponya çevresinde, iz bırakmadan gez ve çöplerini yanında götür. Bu kart görgü ve sorumlu seyahat önerisidir; her bölgenin erişim ve koruma kurallarını ayrıca kontrol et.',
      en: 'Ask permission before photographing people. Leave no trace outdoors, especially in fragile Lapland environments, and take your litter with you. This is etiquette and responsible-travel guidance; check each area’s access and conservation rules separately.',
      sq: "Kërko leje përpara se të fotografosh njerëz. Mos lër gjurmë në natyrë, veçanërisht në mjediset e brishta të Laplandës, dhe merr mbeturinat me vete. Kjo është këshillë për mirësjellje dhe udhëtim të përgjegjshëm; kontrollo veçmas rregullat e hyrjes dhe të mbrojtjes për çdo zonë.",
    },
  },
];
