import type { ViewId } from "../types";
import type { AppLocale } from "./locale";
import type { TravelToolArtworkKind } from "../components/TravelToolArtwork";

type Copy = readonly [string, string, string];
export type TravelAssistantTool = "map" | "nearby" | "safety" | "needs" | "explore" | "embassies" | "money" | "guide" | "translate" | "transit" | "photo" | "offline" | "saved";
export type TravelMapEntrySection = 'map' | 'saved' | 'offline' | 'nearby' | 'needs' | 'embassies';
// Old shortcuts and entry links retain their meaning inside the common map.
export function travelMapSectionForTool(tool: TravelAssistantTool | null | undefined): TravelMapEntrySection | null {
  if (tool === 'map' || tool === 'explore') return 'map';
  return tool === 'saved' || tool === 'offline' || tool === 'nearby' || tool === 'needs' || tool === 'embassies' ? tool : null;
}
export function canonicalAppShortcutId(value: unknown): AppShortcutId | null {
  if (typeof value !== 'string') return null;
  if (value === 'tool:transit') return null;
  return /^tool:(map|explore|needs|saved|offline|nearby|embassies)$/.test(value) ? 'tool:map' : value as AppShortcutId;
}
export type JourneyToolId = "journal" | "map" | "airport" | "safety" | "summary";
export type AppShortcutId = ViewId | `tool:${TravelAssistantTool}`;
type AppTool = { view: ViewId; tool?: TravelAssistantTool; group: "discover" | "plan" | "travel"; title: Copy; caption: Copy; icon: TravelToolArtworkKind; keywords: string };
export const appToolId = (tool: AppTool): AppShortcutId => tool.tool ? `tool:${tool.tool}` : tool.view;

// These are the existing Home/Menu destinations, not separate tool routes.
export const APP_TOOLS: readonly AppTool[] = [
  { view: "route", group: "plan", title: ["Rota Oluştur", "Build a Route", "Krijo itinerar"], caption: ["Hayalini Planla", "Plan Your Dream", "Planifiko ëndrrën"], icon: "explore", keywords: "rota route plan itinerary itinerar bütçe budget" },
  { view: "explore", group: "discover", title: ["Ülke Keşfet", "Explore Countries", "Eksploro shtete"], caption: ["Keşfet, İlham Al", "Find Inspiration", "Gjej frymëzim"], icon: "globe", keywords: "ülke country countries şehir city destination destinacion" },
  { view: "passport", group: "plan", title: ["Pasaport & Vize", "Passport & Visa", "Pasaportë & Vizë"], caption: ["Sınırları Aş", "Cross Borders", "Kalo kufijtë"], icon: "passport", keywords: "vize visa pasaport passport hyrje giriş entry" },
  { view: "trips", group: "plan", title: ["Planlar", "Plans", "Planet"], caption: ["Rotaların ve kaydettiklerin", "Your routes and saved items", "Itineraret dhe gjërat e ruajtura"], icon: "trips", keywords: "kayıtlı saved favorites favoriler routes rota yer places ruajtura plane kaydedilenler" },
  { view: "companion", group: "travel", title: ["Tüm Araçlar", "All Tools", "Të gjitha mjetet"], caption: ["Daha Fazlası", "And More", "Dhe më shumë"], icon: "tools", keywords: "seyahat asistanı travel assistant çeviri çevir translate translation përkthim harita map hartë çevrimdışı offline para money kur currency acil emergency" },
  { view: "country-news", group: "discover", title: ["Ülke Gündemi", "Country Updates", "Lajme nga shtetet"], caption: ["Uyarılar ve önemli günler", "Advice and important dates", "Këshilla dhe data të rëndësishme"], icon: "globe", keywords: "haber news lajme hava weather moti uyarı advisory" },
  { view: "costs", group: "plan", title: ["Ülke Maliyetleri", "Country Costs", "Kostot sipas shtetit"], caption: ["Şehir bazında bütçeler", "Budgets by city", "Buxhete sipas qytetit"], icon: "money", keywords: "para money bütçe budget buxhet fiyat price kosto" },
  { view: "airports", group: "travel", title: ["Havalimanı Rehberi", "Airport Guide", "Udhëzues aeroportesh"], caption: ["Uçuşa hazırlan", "Prepare for your flight", "Përgatitu për fluturimin"], icon: "flight", keywords: "uçak uçuş flight fluturim aktarma transfer aeroport" },
  { view: "events", group: "discover", title: ["Etkinlik Radarı", "Event Radar", "Radar aktivitetesh"], caption: ["Konser, festival ve kültür", "Concerts, festivals and culture", "Koncerte, festivale dhe kulturë"], icon: "events", keywords: "maç konser concert festival sport culture aktivitet" },
  { view: "cockpit", group: "travel", title: ["Seyahatlerim", "My trips", "Udhëtimet e mia"], caption: ["Uçuşlar ve hazırlık listesi", "Flights and checklist", "Fluturime dhe lista e përgatitjeve"], icon: "trips", keywords: "uçak uçuş flight fluturim bilet ticket pnr seyahatlerim my trips check in kokpit cockpit" },
  { view: "alerts", group: "plan", title: ["Fiyat Alarmı", "Price Alerts", "Njoftime çmimesh"], caption: ["Hedef fiyatını takip et", "Track your target fare", "Ndiq çmimin tënd të synuar"], icon: "alerts", keywords: "ucuz cheap lirë bilet ticket uçuş flight" },
  { view: "community", group: "discover", title: ["Topluluk", "Community", "Komuniteti"], caption: ["Gezginlere sor", "Ask travellers", "Pyet udhëtarët"], icon: "community", keywords: "kaşif gezgin traveller league arkadaş friends miq soru question pyetje" },
  { view: "surprise", group: "discover", title: ["Sürpriz Rota", "Surprise Route", "Itinerar surprizë"], caption: ["Yeni bir yer keşfet", "Discover somewhere new", "Zbulo një vend të ri"], icon: "explore", keywords: "sürpriz surprise rastgele random" },
  { view: "phrases", group: "travel", title: ["Seyahat Sözlüğü", "Travel Phrasebook", "Fjalor udhëtimi"], caption: ["İşine yarayan ifadeler", "Useful phrases", "Shprehje të dobishme"], icon: "translate", keywords: "dil language gjuhë çeviri translation phrase sözlük" },
  { view: "companion", tool: "translate", group: "travel", title: ["Çeviri", "Translate", "Përkthimi"], caption: ["Metin çevir ve kayıtlarını aç", "Translate text and open saved translations", "Përkthe tekst dhe hap përkthimet e ruajtura"], icon: "translate", keywords: "çeviri ceviri tercüme tercume dil language translation përkthim" },
  { view: "companion", tool: "money", group: "travel", title: ["Para Merkezi", "Money", "Qendra e parave"], caption: ["Döviz çevir, masrafını hesapla", "Convert currencies and work out costs", "Konverto monedhat dhe llogarit shpenzimet"], icon: "money", keywords: "kur dolar euro lira bahşiş döviz doviz currency exchange rate tip" },
  { view: "companion", tool: "map", group: "travel", title: ["Harita", "Map", "Harta"], caption: ["Yakınındaki yerler, kayıtların ve çevrimdışı bölgeler", "Nearby places, saved pins and offline areas", "Vendet pranë, ruajtjet dhe zonat pa internet"], icon: "explore", keywords: "offline map essentials map sightseeing map saved places around me gezi haritası ihtiyaç haritası çevrimdışı harita cevrimdisi internetsiz indir download offline muze müze tarihi gezilecek museum sightseeing kayitli kayıtlı yerler favori favoriler not liste durak favourite favorite list notes hastane eczane tuvalet wifi hospital pharmacy toilet cash yakınımda yakinimda yakınında nearby around me konumum konum my location restoran restaurant kafe cafe kahve marka mağaza magaza brand shop store yol tarifi directions route map hartë harta vendndodhje konsolosluk konsolosluğum konsoloslugum büyükelçilik buyukelcilik embassy embassies consulate consulates citizenship pasaport konsullatë ambasadë" },
  { view: "companion", tool: "safety", group: "travel", title: ["Acil Mod", "Emergency", "Urgjenca"], caption: ["Acil numaralar ve yardım", "Emergency numbers and help", "Numrat e urgjencës dhe ndihma"], icon: "safety", keywords: "polis ambulans itfaiye police ambulance fire" },
  { view: "companion", tool: "guide", group: "travel", title: ["Ülke Rehberi", "Country Guide", "Udhëzues shteti"], caption: ["Para, priz ve gitmeden bilmen gerekenler", "Currency, plugs and essentials before you go", "Monedha, prizat dhe çfarë duhet të dish para nisjes"], icon: "guide", keywords: "ülke rehberi ulke bilgileri gitmeden önce bil para priz elektrik acil trafik internet sim saat farkı musluk suyu tax free kanun kültür kultur country guide before you go currency plug electricity emergency driving time difference tap water laws culture udhëzues shteti" },
  { view: "companion", tool: "photo", group: "travel", title: ["Fotoğraftan rehber", "Photo guide", "Udhëzues nga fotoja"], caption: ["Bir fotoğraf hakkında bilgi al", "Learn about a photo", "Merr informacion për një foto"], icon: "photo", keywords: "kamera fotoğraf fotograf camera picture" },
];

export function appTools(locale: AppLocale) {
  const index = locale === "tr" ? 0 : locale === "sq" ? 2 : 1;
  return APP_TOOLS.map(tool => ({ ...tool, id: appToolId(tool), label: tool.title[index], text: tool.caption[index] }));
}

// Search-only destinations do not change stored Home shortcut identifiers.
type SearchFeature = Omit<AppTool, "tool"> & { id: string; journeyTool?: JourneyToolId; guide?: true };
const SEARCH_FEATURES: readonly SearchFeature[] = [
  { id: "journey:journal", view: "trips", journeyTool: "journal", group: "travel", title: ["Seyahat günlüğüm", "Travel journal", "Ditari im i udhëtimit"], caption: ["Anılarını ve gezi notlarını sakla", "Save memories and travel notes", "Ruaj kujtimet dhe shënimet e udhëtimit"], icon: "guide", keywords: "günlük gunluk gezi notlarım notlarim anı ani journal diary memories notes ditar kujtime shënime" },
  { id: "journey:map", view: "trips", journeyTool: "map", group: "travel", title: ["Dünya haritam", "My world map", "Harta ime e botës"], caption: ["Gezdiğin ülkeleri tek haritada gör", "See visited countries on one map", "Shih në një hartë shtetet e vizituara"], icon: "globe", keywords: "dünya dunya haritam gezdiğim gezdigim gittiğim gittigim ülkeler ulkeler visited countries world map harta bota vizituara" },
  { id: "journey:summary", view: "trips", journeyTool: "summary", group: "travel", title: ["Yıllık seyahat özetim", "Year in travel", "Përmbledhja vjetore e udhëtimeve"], caption: ["Bu yılın rotalarını ve anılarını gör", "Review this year's routes and memories", "Shih itineraret dhe kujtimet e këtij viti"], icon: "league", keywords: "yıllık yillik özet ozet yıl yil seyahat recap summary year annual vjetore përmbledhje vit" },
  { id: "journey:airport", view: "trips", journeyTool: "airport", group: "travel", title: ["Aktarma yardımcısı", "Transfer assistant", "Ndihmësi i tranzitit"], caption: ["Aktarma süreni ve adımlarını kontrol et", "Check your connection timing and steps", "Kontrollo kohën dhe hapat e tranzitit"], icon: "flight", keywords: "aktarma transfer connection bağlantı bagaj baggage tranzit" },
  { id: "journey:safety", view: "trips", journeyTool: "safety", group: "travel", title: ["Güvenli seyahat", "Travel safety", "Udhëtim i sigurt"], caption: ["Seyahatine ait acil hazırlıklarını aç", "Open emergency preparations for your trip", "Hap përgatitjet e urgjencës për udhëtimin"], icon: "safety", keywords: "güvenli guvenli güvenlik guvenlik safety emergency acil sigurt urgjencë" },
  { id: "help:guide", view: "profile", guide: true, group: "discover", title: ["Nasıl kullanılır?", "How to use the app", "Si përdoret aplikacioni?"], caption: ["Örneklerle öğren veya eğitimine devam et", "Learn with examples or continue your guide", "Mëso me shembuj ose vazhdo udhëzuesin"], icon: "guide", keywords: "nasıl nasil kullanılır kullanilir kullanım kullanim eğitim egitim yardım yardim rehber how to use help tutorial guide learn si përdoret ndihmë udhëzues mëso" },
];

export function searchableAppTools(locale: AppLocale) {
  const index = locale === "tr" ? 0 : locale === "sq" ? 2 : 1;
  return [...appTools(locale), ...SEARCH_FEATURES.map(tool => ({ ...tool, label: tool.title[index], text: tool.caption[index] }))];
}
