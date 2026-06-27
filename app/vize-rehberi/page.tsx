import type { Metadata } from "next";
import Link from "next/link";
import { getCountryGuides } from "@/lib/data";

export const metadata: Metadata = {
  title: "Vize Rehberi — Hangi Ülkeye Nasıl Gidilir?",
  description: "Türk vatandaşları için vize türleri, başvuru süreçleri ve vizesiz rota önerileri.",
};

const visaTypes = [
  {
    icon: "🆔",
    title: "Kimlikle giriş",
    color: "#10b981",
    desc: "Yeni tip TC kimliğiyle pasaport gerekmeden girilebilen ülkeler. Bakü ve Tiflis başlıca örneklerdir.",
    tip: "En kolay başlangıç: ilk yurt dışı seyahati için idealdir.",
  },
  {
    icon: "✅",
    title: "Vizesiz",
    color: "#1476F2",
    desc: "Pasaportla herhangi bir ön başvuru gerektirmeden seyahat edilen ülkeler. Balkanlar'ın büyük çoğunluğu bu kapsamdadır.",
    tip: "180 günde 90 güne kadar kalış hakkı genellikle bu kategoride geçerlidir.",
  },
  {
    icon: "💻",
    title: "e-Vize",
    color: "#f59e0b",
    desc: "Seyahatten önce online başvuruyla alınan elektronik vize. Türkiye'den birçok ülkeye e-vize ile girilebilir.",
    tip: "Başvuru genellikle 24–72 saat içinde sonuçlanır. Seyahatten en az 3 gün önce başvur.",
  },
  {
    icon: "🛂",
    title: "Kapıda vize",
    color: "#8b5cf6",
    desc: "Varış havalimanında veya sınır kapısında alınan vize. Ücret ve belgeler ülkeye göre değişir.",
    tip: "Döviz ve pasaport fotoğrafını yanında bulundur. Bazı ülkeler önceden başvuruyu tercih eder.",
  },
  {
    icon: "📋",
    title: "Schengen",
    color: "#ef4444",
    desc: "26 Avrupa ülkesini kapsayan ortak vize bölgesi. Başvuru; ikamet, banka ekstresi ve sigorta belgesi gerektirir.",
    tip: "İlk Schengen başvurusunda ret riskini azaltmak için seyahat sigortasını eksiksiz hazırla.",
  },
];

const faqs = [
  {
    q: "Pasaportsuz yurt dışına çıkabilir miyim?",
    a: "Bakü ve Tiflis gibi bazı ülkelere yeni tip TC kimlik kartıyla giriş yapılabiliyor. Ancak çoğu ülke pasaport şartı koşuyor.",
  },
  {
    q: "Schengen vizesi başvurusunda en çok reddedilen sebep nedir?",
    a: "Yetersiz mali güç kanıtı, eksik banka ekstresi ve geçmiş seyahat deneyiminin olmaması en yaygın red sebepleridir.",
  },
  {
    q: "e-Vize ile Schengen vizesi arasındaki fark nedir?",
    a: "e-Vize belirli bir ülke için geçerlidir. Schengen ise tek vizeyle 26 ülkeye giriş imkanı sunar.",
  },
  {
    q: "Vize reddi yedim, ne yapmalıyım?",
    a: "İtiraz hakkını kullanabilir veya eksik belgeleri tamamlayarak yeniden başvurabilirsin. Bazı durumlarda farklı bir konsolosluktan başvurmak da işe yarayabilir.",
  },
];

export default async function VisaGuidePage() {
  const countries = await getCountryGuides();
  const easyEntry = countries.filter((c) => ["vizesiz", "kimlikle"].includes(c.visa_status)).slice(0, 4);

  return (
    <section className="l2t-page l2t-wrap">
      <div className="l2t-page-head">
        <p className="l2t-kicker">Vize rehberi</p>
        <h1>Hangi ülkeye nasıl gidilir?</h1>
        <p>
          Türk vatandaşları için vize türleri, başvuru süreçleri ve en kolay giriş imkanı sunan rotalar.
        </p>
      </div>

      {/* Vize türleri */}
      <div className="l2t-visa-type-grid">
        {visaTypes.map((v) => (
          <article key={v.title} className="l2t-visa-type-card">
            <span className="l2t-visa-icon" style={{ background: `${v.color}18`, color: v.color }}>
              {v.icon}
            </span>
            <h3>{v.title}</h3>
            <p>{v.desc}</p>
            <small>💡 {v.tip}</small>
          </article>
        ))}
      </div>

      {/* Kolay giriş ülkeleri */}
      {easyEntry.length > 0 && (
        <div style={{ marginTop: "32px" }}>
          <div className="l2t-section-head">
            <div>
              <p className="l2t-kicker">Kolay başlangıç</p>
              <h2>Vizesiz ve kimlikle gidilen rotalar</h2>
            </div>
            <Link href="/vizesiz-ulkeler" className="l2t-text-link">Tüm liste →</Link>
          </div>
          <div className="l2t-country-grid">
            {easyEntry.map((c) => (
              <Link href={`/ulke-rehberi/${c.slug}`} className="l2t-country-card" key={c.id}>
                <span>{c.emoji}</span>
                <h3>{c.country_name}</h3>
                <p>{c.visa_note}</p>
                <small>{c.flight_duration} · {c.avg_flight_price.toLocaleString("tr-TR")} TL+</small>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* SSS */}
      <div style={{ marginTop: "36px" }}>
        <h2 style={{ marginBottom: "16px", fontSize: "clamp(1.4rem,2.2vw,1.9rem)", letterSpacing: "-.025em", color: "var(--l2t-ink)" }}>
          Sık sorulan sorular
        </h2>
        <div className="l2t-faq-list">
          {faqs.map((faq) => (
            <article key={faq.q} className="l2t-faq-item">
              <h3>{faq.q}</h3>
              <p>{faq.a}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="l2t-soft-band">
        <p>
          <strong>Önemli:</strong> Vize kuralları değişebilir. Seyahat planlamadan önce ilgili ülkenin
          Türkiye konsolosluğu veya resmi devlet kaynaklarından güncel bilgiyi doğrula.
        </p>
      </div>
    </section>
  );
}
