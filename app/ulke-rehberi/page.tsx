import type { Metadata } from "next";
import Link from "next/link";
import { getCountryGuides } from "@/lib/data";

export const metadata: Metadata = {
  title: "Ülke Rehberi",
  description: "Ülkelerin vize, uçuş, sezon ve seyahat notlarını gösteren Letsgo2Travel rehberi.",
};

export default async function CountryGuidesPage() {
  const countries = await getCountryGuides();
  return (
    <section className="l2t-page l2t-wrap">
      <div className="l2t-page-head">
        <p className="l2t-kicker">Ülke rehberleri</p>
        <h1>Rotanı bilinçli seç</h1>
        <p>Her ülke için vize durumu, uçuş süresi, iyi dönemler ve başlangıç bütçesini tek kartta gör.</p>
      </div>
      <div className="l2t-country-grid">
        {countries.map((country) => (
          <Link href={`/ulke-rehberi/${country.slug}`} className="l2t-country-card" key={country.id}>
            <span>{country.emoji}</span>
            <h3>{country.country_name}</h3>
            <p>{country.visa_note}</p>
            <small>{country.best_months}</small>
          </Link>
        ))}
      </div>
    </section>
  );
}
