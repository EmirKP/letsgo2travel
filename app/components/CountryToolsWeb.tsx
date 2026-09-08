"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { I18nProvider } from "../../mobile/src/lib/i18n";
import "../../mobile/src/country-intelligence.css";
import "./country-tools-web.css";

const Costs = dynamic(() => import("../../mobile/src/screens/CostsScreen").then(mod=>mod.CostsScreen), { ssr:false, loading:()=> <p>Fiyat araçları yükleniyor…</p> });
const News = dynamic(() => import("../../mobile/src/screens/CountryNewsScreen").then(mod=>mod.CountryNewsScreen), { ssr:false, loading:()=> <p>Ülke gündemi yükleniyor…</p> });
export default function CountryToolsWeb({ mode, country="TR" }: { mode:"costs"|"news"; country?:string }) {
  const router = useRouter();
  return <I18nProvider><div className="country-tools-web">{mode === "costs" ? <Costs onOpenCountryNews={code=>router.push(`/ulke-gundemi?country=${code}`)}/> : <News initialCountry={country}/>}</div></I18nProvider>;
}
