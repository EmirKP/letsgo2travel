// Bundled city photos keep the budget list available offline.
import AT_salzburg from "../assets/budget/cities/at-salzburg.webp";
import AT_vienna from "../assets/budget/cities/at-vienna.webp";
import BE_bruges from "../assets/budget/cities/be-bruges.webp";
import BE_brussels from "../assets/budget/cities/be-brussels.webp";
import CH_geneva from "../assets/budget/cities/ch-geneva.webp";
import CZ_prague from "../assets/budget/cities/cz-prague.webp";
import DE_berlin from "../assets/budget/cities/de-berlin.webp";
import DE_hamburg from "../assets/budget/cities/de-hamburg.webp";
import DK_copenhagen from "../assets/budget/cities/dk-copenhagen.webp";
import EE_tallinn from "../assets/budget/cities/ee-tallinn.webp";
import ES_barcelona from "../assets/budget/cities/es-barcelona.webp";
import ES_madrid from "../assets/budget/cities/es-madrid.webp";
import FI_helsinki from "../assets/budget/cities/fi-helsinki.webp";
import FR_lille from "../assets/budget/cities/fr-lille.webp";
import FR_lyon from "../assets/budget/cities/fr-lyon.webp";
import FR_nice from "../assets/budget/cities/fr-nice.webp";
import FR_strasbourg from "../assets/budget/cities/fr-strasbourg.webp";
import GB_belfast from "../assets/budget/cities/gb-belfast.webp";
import GB_cardiff from "../assets/budget/cities/gb-cardiff.webp";
import GB_edinburgh from "../assets/budget/cities/gb-edinburgh.webp";
import GB_london from "../assets/budget/cities/gb-london.webp";
import GR_athens from "../assets/budget/cities/gr-athens.webp";
import HR_dubrovnik from "../assets/budget/cities/hr-dubrovnik.webp";
import HR_zagreb from "../assets/budget/cities/hr-zagreb.webp";
import HU_budapest from "../assets/budget/cities/hu-budapest.webp";
import IE_cork from "../assets/budget/cities/ie-cork.webp";
import IE_dublin from "../assets/budget/cities/ie-dublin.webp";
import IT_florence from "../assets/budget/cities/it-florence.webp";
import IT_venice from "../assets/budget/cities/it-venice.webp";
import LT_vilnius from "../assets/budget/cities/lt-vilnius.webp";
import LU_luxembourg from "../assets/budget/cities/lu-luxembourg.webp";
import LV_riga from "../assets/budget/cities/lv-riga.webp";
import ME_podgorica from "../assets/budget/cities/me-podgorica.webp";
import NL_amsterdam from "../assets/budget/cities/nl-amsterdam.webp";
import NO_oslo from "../assets/budget/cities/no-oslo.webp";
import PL_gdansk from "../assets/budget/cities/pl-gdansk.webp";
import PL_krakow from "../assets/budget/cities/pl-krakow.webp";
import PL_warsaw from "../assets/budget/cities/pl-warsaw.webp";
import PT_lisbon from "../assets/budget/cities/pt-lisbon.webp";
import PT_porto from "../assets/budget/cities/pt-porto.webp";
import RO_bucharest from "../assets/budget/cities/ro-bucharest.webp";
import SE_stockholm from "../assets/budget/cities/se-stockholm.webp";
import SI_ljubljana from "../assets/budget/cities/si-ljubljana.webp";
import SK_bratislava from "../assets/budget/cities/sk-bratislava.webp";
import SK_trencin from "../assets/budget/cities/sk-trencin.webp";
import sarajevo from "../assets/destination-artwork/sarajevo.webp";
import tirana from "../assets/destination-artwork/tirana.webp";
import belgrade from "../assets/destination-artwork/belgrade.webp";
import paris from "../assets/home-reference/paris-eiffel-v3.webp";
import rome from "../assets/destination-artwork/rome.webp";
import credits from "../assets/budget/cities/photo-credits.json";
import { bundledImageSource } from "../lib/bundledImageSource";

export type BudgetCityPhoto = { src: string; credit?: { title: string; author: string; source: string; license: string; licenseUrl: string } };

const bundledPhotos = {
  "BA-sarajevo": { src: sarajevo },
  "AL-tirana": { src: tirana },
  "RS-belgrade": { src: belgrade },
  "FR-paris": { src: paris },
  "IT-rome": { src: rome },
  "AT-salzburg": { src: AT_salzburg, credit: credits["AT-salzburg"] },
  "AT-vienna": { src: AT_vienna, credit: credits["AT-vienna"] },
  "BE-bruges": { src: BE_bruges, credit: credits["BE-bruges"] },
  "BE-brussels": { src: BE_brussels, credit: credits["BE-brussels"] },
  "CH-geneva": { src: CH_geneva, credit: credits["CH-geneva"] },
  "CZ-prague": { src: CZ_prague, credit: credits["CZ-prague"] },
  "DE-berlin": { src: DE_berlin, credit: credits["DE-berlin"] },
  "DE-hamburg": { src: DE_hamburg, credit: credits["DE-hamburg"] },
  "DK-copenhagen": { src: DK_copenhagen, credit: credits["DK-copenhagen"] },
  "EE-tallinn": { src: EE_tallinn, credit: credits["EE-tallinn"] },
  "ES-barcelona": { src: ES_barcelona, credit: credits["ES-barcelona"] },
  "ES-madrid": { src: ES_madrid, credit: credits["ES-madrid"] },
  "FI-helsinki": { src: FI_helsinki, credit: credits["FI-helsinki"] },
  "FR-lille": { src: FR_lille, credit: credits["FR-lille"] },
  "FR-lyon": { src: FR_lyon, credit: credits["FR-lyon"] },
  "FR-nice": { src: FR_nice, credit: credits["FR-nice"] },
  "FR-strasbourg": { src: FR_strasbourg, credit: credits["FR-strasbourg"] },
  "GB-belfast": { src: GB_belfast, credit: credits["GB-belfast"] },
  "GB-cardiff": { src: GB_cardiff, credit: credits["GB-cardiff"] },
  "GB-edinburgh": { src: GB_edinburgh, credit: credits["GB-edinburgh"] },
  "GB-london": { src: GB_london, credit: credits["GB-london"] },
  "GR-athens": { src: GR_athens, credit: credits["GR-athens"] },
  "HR-dubrovnik": { src: HR_dubrovnik, credit: credits["HR-dubrovnik"] },
  "HR-zagreb": { src: HR_zagreb, credit: credits["HR-zagreb"] },
  "HU-budapest": { src: HU_budapest, credit: credits["HU-budapest"] },
  "IE-cork": { src: IE_cork, credit: credits["IE-cork"] },
  "IE-dublin": { src: IE_dublin, credit: credits["IE-dublin"] },
  "IT-florence": { src: IT_florence, credit: credits["IT-florence"] },
  "IT-venice": { src: IT_venice, credit: credits["IT-venice"] },
  "LT-vilnius": { src: LT_vilnius, credit: credits["LT-vilnius"] },
  "LU-luxembourg": { src: LU_luxembourg, credit: credits["LU-luxembourg"] },
  "LV-riga": { src: LV_riga, credit: credits["LV-riga"] },
  "ME-podgorica": { src: ME_podgorica, credit: credits["ME-podgorica"] },
  "NL-amsterdam": { src: NL_amsterdam, credit: credits["NL-amsterdam"] },
  "NO-oslo": { src: NO_oslo, credit: credits["NO-oslo"] },
  "PL-gdansk": { src: PL_gdansk, credit: credits["PL-gdansk"] },
  "PL-krakow": { src: PL_krakow, credit: credits["PL-krakow"] },
  "PL-warsaw": { src: PL_warsaw, credit: credits["PL-warsaw"] },
  "PT-lisbon": { src: PT_lisbon, credit: credits["PT-lisbon"] },
  "PT-porto": { src: PT_porto, credit: credits["PT-porto"] },
  "RO-bucharest": { src: RO_bucharest, credit: credits["RO-bucharest"] },
  "SE-stockholm": { src: SE_stockholm, credit: credits["SE-stockholm"] },
  "SI-ljubljana": { src: SI_ljubljana, credit: credits["SI-ljubljana"] },
  "SK-bratislava": { src: SK_bratislava, credit: credits["SK-bratislava"] },
  "SK-trencin": { src: SK_trencin, credit: credits["SK-trencin"] },
};

export const BUDGET_CITY_PHOTOS: Record<string, BudgetCityPhoto> = Object.fromEntries(
  Object.entries(bundledPhotos).map(([id, photo]) => [id, { ...photo, src: bundledImageSource(photo.src) }]),
);
