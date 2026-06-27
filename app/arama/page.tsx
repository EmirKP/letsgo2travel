import type { Metadata } from "next";
import AISearchBox from "../components/AISearchBox";

export const metadata: Metadata = { title: "Akıllı Arama", description: "AI destekli seyahat rota arama." };

export default function AiSearchPage() {
  return (
    <section className="l2t-page l2t-wrap">
      <div className="l2t-page-head"><p className="l2t-kicker">AI arama</p><h1>Nasıl bir seyahat istediğini yaz</h1></div>
      <AISearchBox />
    </section>
  );
}
