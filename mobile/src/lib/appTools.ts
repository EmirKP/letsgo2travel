import type { ViewId } from "../types";
import type { AppLocale } from "./locale";
import type { TravelToolArtworkKind } from "../components/TravelToolArtwork";

type Copy = readonly [string, string, string];
export type TravelAssistantTool = "safety" | "needs" | "explore" | "embassies" | "money" | "guide" | "translate" | "transit" | "photo" | "offline" | "saved";
export type AppShortcutId = ViewId | `tool:${TravelAssistantTool}`;
type AppTool = { view: ViewId; tool?: TravelAssistantTool; group: "discover" | "plan" | "travel"; title: Copy; caption: Copy; icon: TravelToolArtworkKind; keywords: string };
export const appToolId = (tool: AppTool): AppShortcutId => tool.tool ? `tool:${tool.tool}` : tool.view;

// These are the existing Home/Menu destinations, not separate tool routes.
export const APP_TOOLS: readonly AppTool[] = [
  { view: "route", group: "plan", title: ["Rota Oluştur", "Build a Route", "Krijo itinerar"], caption: ["Hayalini Planla", "Plan Your Dream", "Planifiko ëndrrën"], icon: "explore", keywords: "rota route plan itinerary itinerar bütçe budget" },
  { view: "explore", group: "discover", title: ["Ülke Keşfet", "Explore Countries", "Eksploro shtete"], caption: ["Keşfet, İlham Al", "Find Inspiration", "Gjej frymëzim"], icon: "globe", keywords: "ülke country countries şehir city destination destinacion" },
  { view: "passport", group: "plan", title: ["Pasaport & Vize", "Passport & Visa", "Pasaportë & Vizë"], caption: ["Sınırları Aş", "Cross Borders", "Kalo kufijtë"], icon: "passport", keywords: "vize visa pasaport passport hyrje giriş entry" },
  { view: "trips", group: "plan", title: ["Seyahatlerim", "My Trips", "Udhëtimet e mia"], caption: ["Tüm Planların Burada", "All Your Plans Here", "Të gjitha planet këtu"], icon: "trips", keywords: "kayıtlı saved favorites favoriler routes rota yer places ruajtura plane" },
  { view: "companion", group: "travel", title: ["Tüm Araçlar", "All Tools", "Të gjitha mjetet"], caption: ["Daha Fazlası", "And More", "Dhe më shumë"], icon: "tools", keywords: "seyahat asistanı travel assistant çeviri çevir translate translation përkthim harita map hartë çevrimdışı offline ulaşım transport para money kur currency konsolosluk consulate acil emergency" },
  { view: "country-news", group: "discover", title: ["Ülke Gündemi", "Country Updates", "Lajme nga shtetet"], caption: ["Uyarılar ve önemli günler", "Advice and important dates", "Këshilla dhe data të rëndësishme"], icon: "globe", keywords: "haber news lajme hava weather moti uyarı advisory" },
  { view: "costs", group: "plan", title: ["Ülke Maliyetleri", "Country Costs", "Kostot sipas shtetit"], caption: ["Şehir bazında bütçeler", "Budgets by city", "Buxhete sipas qytetit"], icon: "money", keywords: "para money bütçe budget buxhet fiyat price kosto" },
  { view: "airports", group: "travel", title: ["Havalimanı Rehberi", "Airport Guide", "Udhëzues aeroportesh"], caption: ["Uçuşa hazırlan", "Prepare for your flight", "Përgatitu për fluturimin"], icon: "flight", keywords: "uçak uçuş flight fluturim aktarma transfer aeroport" },
  { view: "events", group: "discover", title: ["Etkinlik Radarı", "Event Radar", "Radar aktivitetesh"], caption: ["Konser, festival ve kültür", "Concerts, festivals and culture", "Koncerte, festivale dhe kulturë"], icon: "events", keywords: "maç konser concert festival sport culture aktivitet" },
  { view: "cockpit", group: "travel", title: ["Seyahat Kokpiti", "Travel Cockpit", "Paneli i udhëtimit"], caption: ["Uçuşlar ve hazırlık listesi", "Flights and checklist", "Fluturime dhe lista e përgatitjeve"], icon: "trips", keywords: "uçak uçuş flight fluturim bilet ticket pnr seyahatlerim my trips check in" },
  { view: "alerts", group: "plan", title: ["Fiyat Alarmı", "Price Alerts", "Njoftime çmimesh"], caption: ["Hedef fiyatını takip et", "Track your target fare", "Ndiq çmimin tënd të synuar"], icon: "alerts", keywords: "ucuz cheap lirë bilet ticket uçuş flight" },
  { view: "community", group: "discover", title: ["Topluluk", "Community", "Komuniteti"], caption: ["Gezginlere sor", "Ask travellers", "Pyet udhëtarët"], icon: "community", keywords: "kaşif gezgin traveller league arkadaş friends miq soru question pyetje" },
  { view: "surprise", group: "discover", title: ["Sürpriz Rota", "Surprise Route", "Itinerar surprizë"], caption: ["Yeni bir yer keşfet", "Discover somewhere new", "Zbulo një vend të ri"], icon: "explore", keywords: "sürpriz surprise rastgele random" },
  { view: "phrases", group: "travel", title: ["Seyahat Sözlüğü", "Travel Phrasebook", "Fjalor udhëtimi"], caption: ["İşine yarayan ifadeler", "Useful phrases", "Shprehje të dobishme"], icon: "translate", keywords: "dil language gjuhë çeviri translation phrase sözlük" },
  { view: "companion", tool: "translate", group: "travel", title: ["Çeviri", "Translate", "Përkthimi"], caption: ["Metin çevir ve kayıtlarını aç", "Translate text and open saved translations", "Përkthe tekst dhe hap përkthimet e ruajtura"], icon: "translate", keywords: "çeviri ceviri tercüme tercume dil language translation përkthim" },
  { view: "companion", tool: "money", group: "travel", title: ["Para Merkezi", "Money", "Qendra e parave"], caption: ["Döviz çevir, masrafını hesapla", "Convert currencies and work out costs", "Konverto monedhat dhe llogarit shpenzimet"], icon: "money", keywords: "kur dolar euro lira bahşiş döviz doviz currency exchange rate tip" },
  { view: "companion", tool: "explore", group: "travel", title: ["Gezi haritası", "Sightseeing map", "Harta e vizitave"], caption: ["Gezilecek yerleri haritada bul", "Find places to visit on the map", "Gjej në hartë vende për t’u vizituar"], icon: "explore", keywords: "muze müze tarihi gezilecek museum sightseeing" },
  { view: "companion", tool: "saved", group: "travel", title: ["Kayıtlı yerler", "Saved places", "Vendet e ruajtura"], caption: ["Yerler, notlar ve gezi sıran", "Places, notes and your day list", "Vende, shënime dhe rendi i vizitave"], icon: "saved", keywords: "favori favoriler not liste durak favourite favorite list notes" },
  { view: "companion", tool: "offline", group: "travel", title: ["Çevrimdışı harita", "Offline map", "Harta pa internet"], caption: ["Gitmeden harita indir", "Download a map before you go", "Shkarko hartën para nisjes"], icon: "offline", keywords: "internetsiz çevrimdışı cevrimdisi indir download offline" },
  { view: "companion", tool: "transit", group: "travel", title: ["Ulaşım", "Transport", "Transporti"], caption: ["Toplu taşıma için güzergâh bul", "Find a public transport journey", "Gjej një itinerar me transport publik"], icon: "transit", keywords: "metro tren otobüs otobus toplu taşıma bus subway rail" },
  { view: "companion", tool: "safety", group: "travel", title: ["Acil Mod", "Emergency", "Urgjenca"], caption: ["Acil numaralar ve yardım", "Emergency numbers and help", "Numrat e urgjencës dhe ndihma"], icon: "safety", keywords: "polis ambulans itfaiye police ambulance fire" },
  { view: "companion", tool: "needs", group: "travel", title: ["İhtiyaç haritası", "Essentials map", "Harta e nevojave"], caption: ["Hastane, eczane, ATM", "Hospitals, pharmacies and ATMs", "Spitale, farmaci dhe bankomate"], icon: "needs", keywords: "eczane hastane tuvalet wifi hospital pharmacy toilet cash" },
  { view: "companion", tool: "embassies", group: "travel", title: ["Konsolosluk", "Consulate", "Konsullata"], caption: ["Büyükelçilik ve konsolosluk bilgileri", "Embassy and consulate information", "Informacion për ambasadat dhe konsullatat"], icon: "embassies", keywords: "büyükelçilik pasaport embassy consulate passport" },
  { view: "companion", tool: "guide", group: "travel", title: ["Gitmeden Önce Bil", "Before you go", "Para se të nisesh"], caption: ["Su, saatler ve yerel kurallar", "Water, hours and local rules", "Uji, oraret dhe rregullat vendase"], icon: "guide", keywords: "musluk suyu tax free saat kanun kültür kultur tap water laws culture" },
  { view: "companion", tool: "photo", group: "travel", title: ["Fotoğraftan rehber", "Photo guide", "Udhëzues nga fotoja"], caption: ["Bir fotoğraf hakkında bilgi al", "Learn about a photo", "Merr informacion për një foto"], icon: "photo", keywords: "kamera fotoğraf fotograf camera picture" },
];

export function appTools(locale: AppLocale) {
  const index = locale === "tr" ? 0 : locale === "sq" ? 2 : 1;
  return APP_TOOLS.map(tool => ({ ...tool, id: appToolId(tool), label: tool.title[index], text: tool.caption[index] }));
}
