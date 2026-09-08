import CountryToolsWeb from "../components/CountryToolsWeb";
import { isoCountryByAlpha2 } from "@/lib/countries/isoSource";
export const metadata = { title:"Ülke Gündemi · LetsGo2Travel", description:"Kaynaklı seyahat uyarıları, haberler ve önemli günler." };
export default async function Page({searchParams}:{searchParams:Promise<{country?:string}>}) {
  const params=await searchParams; const country=typeof params.country === "string" && isoCountryByAlpha2(params.country) ? params.country : "TR";
  return <CountryToolsWeb mode="news" country={country} key={country}/>;
}
