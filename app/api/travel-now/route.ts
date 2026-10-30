import { translateAppCopy } from '../../../lib/locale-copy';
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Locale = "tr" | "en" | "sq" | "ro";
type Interest = "culture" | "food" | "outdoors" | "calm";
type Budget = "free" | "low" | "flexible";

function weatherDescription(code: number, locale: Locale) {
  if (locale === 'sq') {
    if (code === 0) return 'Kthjellët';
    if (code <= 3) return 'Pjesërisht me re';
    if (code === 45 || code === 48) return 'Mjegull';
    if (code >= 51 && code <= 67) return 'Shi';
    if (code >= 71 && code <= 77) return 'Borë';
    if (code >= 80 && code <= 82) return 'Rrebeshe';
    if (code >= 95) return 'Stuhi';
    return 'I ndryshueshëm';
  }
  if (code === 0) return translateAppCopy(locale, "Açık", "Clear");
  if (code <= 3) return translateAppCopy(locale, "Parçalı bulutlu", "Partly cloudy");
  if (code === 45 || code === 48) return translateAppCopy(locale, "Sisli", "Foggy");
  if (code >= 51 && code <= 67) return translateAppCopy(locale, "Yağmurlu", "Rainy");
  if (code >= 71 && code <= 77) return translateAppCopy(locale, "Karlı", "Snowy");
  if (code >= 80 && code <= 82) return translateAppCopy(locale, "Sağanak", "Showers");
  if (code >= 95) return translateAppCopy(locale, "Fırtınalı", "Stormy");
  return translateAppCopy(locale, "Değişken", "Variable");
}

function recommendations(options: {
  locale: Locale;
  interest: Interest;
  budget: Budget;
  weatherCode: number;
  temperature: number;
  precipitation: number;
  localTime: string;
}) {
  const { locale, interest, budget, weatherCode, temperature, precipitation, localTime } = options;
  const rainy = precipitation > 0.2 || (weatherCode >= 51 && weatherCode <= 99);
  const hour = Number(localTime.slice(11, 13));
  const night = hour >= 20 || hour < 6;
  const cold = temperature < 8;
  const freeOnly = budget === "free";

  const sqText: Record<string, [string, string]> = {
    museum: ['Vizito një muze pranë teje', rainy ? 'Shfrytëzo kohën me shi brenda.' : 'Moti është i freskët; një ndalesë kulturore brenda mund të jetë më e rehatshme.'],
    walk: ['Bëj një shëtitje të shkurtër', 'Moti duket i përshtatshëm për të kaluar kohë jashtë.'],
    food: [freeOnly ? 'Eksploro tregun lokal' : 'Gjej një shije lokale', freeOnly ? 'Një shëtitje në treg të njeh me qytetin pa detyrim për blerje.' : 'Krahaso vendet me ushqim lokal pranë teje.'],
    culture: ['Gjej një ndalesë kulturore', 'Shiko galeri, ndërtesa historike ose ekspozita pranë teje.'],
    nature: [rainy ? 'Gjej një kopsht të mbuluar' : 'Gjej një park ose pikë panoramike', rainy ? 'Zgjidh një vend të mbuluar kur bie shi.' : 'Shfrytëzo dritën e ditës dhe motin e përshtatshëm.'],
    calm: ['Gjej një vend të qetë për pushim', 'Zgjidh një kafene, bibliotekë ose shëtitore të qetë pranë teje.'],
    night: ['Zgjidh një itinerar të ndriçuar në qendër', 'Kontrollo transportin e kthimit dhe oraret aktuale për daljen në mbrëmje.'],
    event: ['Kontrollo aktivitetet e sotme', 'Një koncert, festival ose program kulturor mund ta bëjë ditën më të veçantë.'],
  };
  const items = [] as Array<{ id: string; title: string; reason: string; duration: string; mapQuery: string; indoor: boolean }>;
  const add = (id: string, titleTr: string, titleEn: string, reasonTr: string, reasonEn: string, duration: string, mapQuery: string, indoor: boolean) => {
    items.push({ id, title: translateAppCopy(locale, titleTr, titleEn, sqText[id][0]), reason: translateAppCopy(locale, reasonTr, reasonEn, sqText[id][1]), duration: locale === 'ro' ? duration.replace('Varies', 'Variază').replace('Değişir', 'Variază') : locale === "sq" ? duration.replace("Varies", "Ndryshon").replace(" h", " orë") : duration, mapQuery, indoor });
  };

  if (rainy || cold) {
    add("museum", "Yakındaki bir müzeye gir", "Visit a nearby museum", rainy ? "Yağış varken kapalı alanda zamanı iyi değerlendirirsin." : "Hava serin; kapalı bir kültür durağı daha rahat olur.", rainy ? "Make good use of the rainy spell indoors." : "It is chilly, so an indoor cultural stop will be more comfortable.", "1–2 h", "museum", true);
  } else {
    add("walk", "Kısa bir keşif yürüyüşü yap", "Take a short discovery walk", "Hava dışarıda vakit geçirmek için uygun görünüyor.", "The weather looks suitable for spending time outside.", "45–90 min", interest === "outdoors" ? "scenic viewpoint" : "historic center", false);
  }

  if (interest === "food") {
    add("food", freeOnly ? "Yerel pazarı keşfet" : "Yerel lezzet durağı bul", freeOnly ? "Explore a local market" : "Find a local food stop", freeOnly ? "Pazarı gezmek bütçe harcamadan şehri tanıtır." : "Yakındaki iyi puanlı yerel lezzetleri karşılaştır.", freeOnly ? "A market lets you feel the city without committing to a spend." : "Compare well-rated local food nearby.", "45–75 min", freeOnly ? "local market" : "local food", !freeOnly);
  } else if (interest === "culture") {
    add("culture", "Yerel kültür durağı bul", "Find a local culture stop", "Seçtiğin ilgi alanına uygun galeri, tarihî yapı veya sergiyi aç.", "Open a nearby gallery, historic building or exhibition that matches your interest.", "1–2 h", "art gallery historic attraction", true);
  } else if (interest === "outdoors") {
    add("nature", rainy ? "Kapalı botanik veya gözlem alanı bul" : "Park ya da manzara noktası bul", rainy ? "Find an indoor botanical or viewing space" : "Find a park or viewpoint", rainy ? "Yağmurda açık arazi yerine korunaklı bir alternatif seç." : "Gün ışığını ve uygun havayı değerlendirebilirsin.", rainy ? "Choose a sheltered option instead of exposed terrain." : "Make the most of daylight and suitable weather.", "60–120 min", rainy ? "indoor garden" : "park viewpoint", rainy);
  } else {
    add("calm", "Sakin bir mola noktası bul", "Find a calm place to pause", "Yoğun rota yerine yakınındaki sessiz bir kafe, kütüphane veya sahili seç.", "Choose a quiet café, library or waterfront nearby instead of a packed itinerary.", "45–90 min", "quiet cafe library", true);
  }

  if (night) {
    add("night", "Aydınlık ve merkezi bir akşam rotası seç", "Choose a central, well-lit evening route", "Geç saatte ulaşımı kolay, güncel yorumları olan merkezi bir yer daha güvenli bir seçimdir.", "At this hour, a central place with easy transport and recent reviews is a safer choice.", "1–2 h", "open now popular attraction", false);
  } else {
    add("event", "Bugünkü etkinlikleri kontrol et", "Check today's events", "Yakınındaki konser, festival veya kültür programı planını daha özel hâle getirebilir.", "A nearby concert, festival or cultural programme may make your day more memorable.", locale === 'tr' ? "Değişir" : "Varies", "events today", true);
  }
  return items.slice(0, 3);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const latitude = typeof body?.latitude === "number" ? body.latitude : NaN;
  const longitude = typeof body?.longitude === "number" ? body.longitude : NaN;
  const locale: Locale = body?.locale === 'ro' ? 'ro' : body?.locale === "sq" ? "sq" : body?.locale === "en" ? "en" : "tr";
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return NextResponse.json({ error: translateAppCopy(locale, "Geçerli konum gerekli.", "A valid location is required.", "Kërkohet një vendndodhje e vlefshme.") }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }
  const rawInterest = body?.interest as Interest;
  const rawBudget = body?.budget as Budget;
  const interest: Interest = ["culture", "food", "outdoors", "calm"].includes(rawInterest) ? rawInterest : "culture";
  const budget: Budget = ["free", "low", "flexible"].includes(rawBudget) ? rawBudget : "low";
  // Yaklaşık konum hava eşlemesi için yeterlidir. Hassas GPS değerini dış
  // sağlayıcıya aktarmamak için ~1 km'ye yuvarla; yanıtı da cache'leme.
  const approximateLatitude = Math.round(latitude * 100) / 100;
  const approximateLongitude = Math.round(longitude * 100) / 100;
  const params = new URLSearchParams({
    latitude: String(approximateLatitude),
    longitude: String(approximateLongitude),
    current: "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
    timezone: "auto",
  });
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`weather_${response.status}`);
    const payload = await response.json() as {
      timezone?: unknown;
      current?: { temperature_2m?: unknown; apparent_temperature?: unknown; precipitation?: unknown; weather_code?: unknown; time?: unknown };
    };
    const temperature = payload.current?.temperature_2m;
    const apparentTemperature = payload.current?.apparent_temperature;
    const precipitation = payload.current?.precipitation;
    const weatherCode = payload.current?.weather_code;
    const localTime = payload.current?.time;
    const finiteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
    // Missing observations must not become a fabricated 0°C / clear forecast.
    // In particular, Number(null), Number("") and Number(false) all return zero.
    if (!finiteNumber(temperature) || !finiteNumber(apparentTemperature)
      || !finiteNumber(precipitation) || !finiteNumber(weatherCode)
      || typeof localTime !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(localTime)) throw new Error("weather_shape");
    return NextResponse.json({ data: {
      weather: {
        temperature: Math.round(temperature),
        apparentTemperature: Math.round(apparentTemperature),
        precipitation,
        weatherCode,
        description: weatherDescription(weatherCode, locale),
        localTime,
        timeZone: String(payload.timezone || ""),
      },
      recommendations: recommendations({ locale, interest, budget, weatherCode, temperature, precipitation, localTime }),
      privacy: translateAppCopy(locale, "Konum yalnız bu anlık öneri için kullanıldı ve saklanmadı.", "Your location was used only for this live suggestion and was not stored.", "Vendndodhja u përdor vetëm për këtë sugjerim dhe nuk u ruajt."),
    } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: translateAppCopy(locale, "Anlık hava ve öneriler alınamadı.", "Live weather and suggestions are unavailable.", "Moti dhe sugjerimet nuk janë të disponueshme për momentin.") }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
