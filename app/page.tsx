import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Calculator,
  CheckCircle2,
  Compass,
  Globe2,
  Hotel,
  Map,
  Plane,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
  Wifi,
} from "lucide-react";
import FlightSearchCard from "./components/FlightSearchCard";
import HomeDealsTicker from "./components/HomeDealsTicker";
import PwaInstallButton from "./components/PwaInstallButton";
import HomeTripFinder from "./components/HomeTripFinder";
import HomeSavedBoard from "./components/HomeSavedBoard";
import HomeDealPreview from "./components/home/HomeDealPreview";
import { getCountryGuides, getFlightDeals } from "@/lib/data";
import { siteSettings, trackedAffiliateUrl } from "@/lib/affiliate";
import { formatFromPrice } from "@/lib/prices";
import styles from "./home.module.css";

const routeHighlights = [
  {
    image: "/destinations/italy/venice-hero-v26.jpg",
    city: "Venedik",
    country: "İtalya",
    tag: "Şehir kaçamağı",
    time: "2s 40dk",
    price: "Fiyatları gör",
    href: "/ulke-rehberi/italya",
    size: "tall",
  },
  {
    image: "/destinations/bosnia/mostar-hero-v26.jpg",
    city: "Mostar",
    country: "Bosna Hersek",
    tag: "Vizesiz",
    time: "2s",
    price: formatFromPrice("sarajevo"),
    href: "/ulke-rehberi/bosna-hersek",
    size: "wide",
  },
  {
    image: "/destinations/dubai-marina.jpg",
    city: "Dubai",
    country: "BAE",
    tag: "e-Vize",
    time: "4s",
    price: formatFromPrice("dubai"),
    href: "/ulke-rehberi/bae",
    size: "standard",
  },
  {
    image: "/destinations/prague/charles-bridge.jpg",
    city: "Prag",
    country: "Çekya",
    tag: "Schengen",
    time: "2s 45dk",
    price: "Fiyatları gör",
    href: "/ulke-rehberi/cekya",
    size: "standard",
  },
  {
    image: "/destinations/paris-eiffel.jpg",
    city: "Paris",
    country: "Fransa",
    tag: "Schengen",
    time: "3s 40dk",
    price: "Fiyatları gör",
    href: "/ulke-rehberi/fransa",
    size: "wide",
  },
];

const quickActions = [
  {
    href: "/pasaport-gucu",
    icon: ShieldCheck,
    title: "Pasaport Gücü",
    text: "Kimlikle, vizesiz ve e-Vize seçeneklerini karşılaştır.",
  },
  {
    href: "/rota-asistani",
    icon: Sparkles,
    title: "Rota Asistanı",
    text: "Bütçe, süre ve seyahat tarzına göre rota oluştur.",
  },
  {
    href: "/butce-hesapla",
    icon: Calculator,
    title: "Bütçe Hesapla",
    text: "Uçuş, otel ve günlük giderleri tek tabloda planla.",
  },
  {
    href: "/planlarim",
    icon: WalletCards,
    title: "Seyahat Panom",
    text: "Kaydettiğin planlara tek ekrandan geri dön.",
  },
];

export default async function HomePage() {
  const [rawDeals, countries] = await Promise.all([getFlightDeals(), getCountryGuides()]);

  // Ana sayfa ve kampanyalar aynı fırsat kaynağını kullanır.
  const deals = rawDeals;

  const popularCountries = countries.filter((country) => country.is_popular).slice(0, 6);
  const activeDeals = deals.filter((deal) => deal.active !== false).slice(0, 3);

  return (
    <div className={styles.home}>
      <section className={styles.hero}>
        <div className={`l2t-container ${styles.heroGrid}`}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}><Globe2 size={16} /> Akıllı seyahat platformu</span>
            <h1>Pasaportuna göre keşfet. <span>Bütçene göre planla.</span></h1>
            <p>
              Gidebileceğin ülkeleri gör, uçuşları karşılaştır ve bütün seyahatini tek bir panoda düzenle.
            </p>
            <div className={styles.heroActions}>
              <Link href="#ucus-ara" className={styles.primaryAction}><Plane size={19} /> Uçuş ara</Link>
              <Link href="/rota-asistani" className={styles.secondaryAction}><Sparkles size={19} /> Rota oluştur</Link>
            </div>
            <div className={styles.heroChecks}>
              <span><CheckCircle2 size={16} /> Giriş şartları</span>
              <span><CheckCircle2 size={16} /> Fiyat sinyalleri</span>
              <span><CheckCircle2 size={16} /> Kaydedilebilir planlar</span>
            </div>
            <div className={styles.install}><PwaInstallButton /></div>
          </div>

          <div className={styles.heroGallery} aria-label="Öne çıkan seyahat rotaları">
            <Link href="/ulke-rehberi/italya" className={styles.heroMainPhoto}>
              <Image
                src="/destinations/italy/venice-hero-v26.jpg"
                alt="Venedik kanalları"
                fill
                priority
                sizes="(max-width: 920px) 92vw, 42vw"
              />
              <div className={styles.photoShade} />
              <span className={styles.photoTag}>Haftanın rotası</span>
              <div className={styles.photoCaption}>
                <div><small>Şehir kaçamağı</small><strong>Venedik</strong></div>
                <span>Rotayı incele <ArrowRight size={17} /></span>
              </div>
            </Link>
            <Link href="/ulke-rehberi/bosna-hersek" className={`${styles.heroSidePhoto} ${styles.heroSidePhotoTop}`}>
              <Image src="/destinations/bosnia/mostar-hero-v26.jpg" alt="Mostar Köprüsü" fill sizes="(max-width: 920px) 44vw, 16vw" />
              <div className={styles.photoShade} />
              <span><small>Vizesiz</small><strong>Mostar</strong></span>
            </Link>
            <Link href="/ulke-rehberi/bae" className={`${styles.heroSidePhoto} ${styles.heroSidePhotoBottom}`}>
              <Image src="/destinations/dubai-marina.jpg" alt="Dubai şehir manzarası" fill sizes="(max-width: 920px) 44vw, 16vw" />
              <div className={styles.photoShade} />
              <span><small>e-Vize</small><strong>Dubai</strong></span>
            </Link>
            <div className={styles.heroStat}>
              <Compass size={20} />
              <span><strong>50+ rota</strong><small>Tek ekranda keşfet</small></span>
            </div>
          </div>
        </div>
      </section>

      <section id="ucus-ara" className={`l2t-container ${styles.searchSection}`}>
        <FlightSearchCard />
      </section>

      <section className={`l2t-container ${styles.quickGrid}`} aria-label="Hızlı seyahat araçları">
        {quickActions.map(({ href, icon: Icon, title, text }) => (
          <Link href={href} key={href} className={styles.quickCard}>
            <span className={styles.quickIcon}><Icon size={21} /></span>
            <span className={styles.quickText}><strong>{title}</strong><small>{text}</small></span>
            <ArrowRight size={18} />
          </Link>
        ))}
      </section>

      <HomeDealsTicker deals={deals} />

      <HomeTripFinder />

      <section className={`l2t-container ${styles.section}`}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.kicker}>Fotoğraflı rota keşfi</span>
            <h2>Yakın rotalardan hayalindeki şehre</h2>
            <p>Giriş kolaylığı, uçuş süresi ve fiyat sinyalini tek bakışta karşılaştır.</p>
          </div>
          <Link href="/ulke-rehberi">Tüm ülkeler <ArrowRight size={16} /></Link>
        </div>

        <div className={styles.routeGrid}>
          {routeHighlights.map((route) => (
            <Link href={route.href} className={`${styles.routeCard} ${styles[route.size]}`} key={route.city}>
              <Image src={route.image} alt={`${route.city} seyahat rotası`} fill sizes="(max-width: 760px) 88vw, (max-width: 1100px) 44vw, 30vw" />
              <div className={styles.routeShade} />
              <div className={styles.routeTop}><span>{route.tag}</span><small>{route.time}</small></div>
              <div className={styles.routeBottom}>
                <div><small>{route.country}</small><h3>{route.city}</h3></div>
                <strong>{route.price}</strong>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className={`l2t-container ${styles.featureGrid}`}>
        <article className={`${styles.featureCard} ${styles.passportCard}`}>
          <div className={styles.featureCopy}>
            <span className={styles.kicker}><ShieldCheck size={15} /> Pasaport merkezi</span>
            <h2>“Vize var mı?” sorusuna daha hızlı cevap.</h2>
            <p>Kimlikle, vizesiz, e-Vize, kapıda vize ve vize gerekli ülkeleri filtrele.</p>
            <div className={styles.featureActions}>
              <Link href="/pasaport-gucu">Pasaport Gücünü aç <ArrowRight size={16} /></Link>
              <Link href="/vize-merkezi">Vize merkezine git</Link>
            </div>
          </div>
          <div className={styles.passportVisual}>
            <div className={styles.passportGlow} />
            <Image src="/turkish-passport.webp" alt="Türkiye pasaportu" width={180} height={257} />
            <span className={styles.passportPillOne}>Kimlikle</span>
            <span className={styles.passportPillTwo}>Vizesiz</span>
            <span className={styles.passportPillThree}>e-Vize</span>
          </div>
        </article>

        <article className={`${styles.featureCard} ${styles.budgetCard}`}>
          <div className={styles.budgetPhoto}>
            <Image src="/destinations/budapest/parliament.jpg" alt="Budapeşte şehir manzarası" fill sizes="(max-width: 900px) 92vw, 42vw" />
            <div className={styles.photoShade} />
          </div>
          <div className={styles.featureCopy}>
            <span className={styles.kicker}><Calculator size={15} /> Bütçe planlayıcı</span>
            <h2>Yola çıkmadan toplam maliyeti gör.</h2>
            <p>Uçuş, konaklama, yeme içme ve ulaşım giderlerini kişi ve gün sayısına göre hesapla.</p>
            <div className={styles.featureActions}><Link href="/butce-hesapla">Bütçemi hesapla <ArrowRight size={16} /></Link></div>
          </div>
        </article>
      </section>

      {activeDeals.length > 0 && (
        <section className={`${styles.dealsSection} ${styles.section}`}>
          <div className="l2t-container">
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.kicker}>Güncel fırsatlar</span>
                <h2>Takip etmeye değer uçuşlar</h2>
                <p>Yakın tarihli fiyat sinyallerini incele, uygun rotayı detay sayfasında aç.</p>
              </div>
              <Link href="/kampanyalar">Tüm fırsatlar <ArrowRight size={16} /></Link>
            </div>
            <div className={styles.dealGrid}>
              {activeDeals.map((deal) => <HomeDealPreview key={deal.id} deal={deal} />)}
            </div>
          </div>
        </section>
      )}

      {popularCountries.length > 0 && (
        <section className={`l2t-container ${styles.section}`}>
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.kicker}>Ülke rehberleri</span>
              <h2>Karar vermeden önce önemli bilgileri gör</h2>
              <p>Giriş şartı, vize notu ve ülke rehberi aynı sayfada.</p>
            </div>
            <Link href="/ulke-rehberi">Tüm rehberler <ArrowRight size={16} /></Link>
          </div>
          <div className={styles.countryGrid}>
            {popularCountries.map((country) => (
              <Link href={`/ulke-rehberi/${country.slug}`} key={country.id} className={styles.countryCard}>
                <span className={styles.countryEmoji}>{country.emoji}</span>
                <div><h3>{country.country_name}</h3><p>{country.visa_note}</p></div>
                <span className={styles.countryVisa}>{country.visa_status}</span>
                <ArrowRight size={17} />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className={`l2t-container ${styles.communityCard}`}>
        <div className={styles.communityPhoto}>
          <Image src="/destinations/georgia/tbilisi.jpg" alt="Tiflis şehir manzarası" fill sizes="(max-width: 900px) 92vw, 46vw" />
          <div className={styles.photoShade} />
        </div>
        <div className={styles.communityCopy}>
          <span className={styles.kicker}><Users size={15} /> Gerçek gezgin deneyimleri</span>
          <h2>Sınırda ne sorulduğunu topluluktan öğren.</h2>
          <p>Doğrulanmış seyahat deneyimleri, ülke soruları ve güncel giriş notlarıyla bilinmezliği azalt.</p>
          <div>
            <Link href="/forum">Topluluğu keşfet <ArrowRight size={16} /></Link>
            <Link href="/profil/dogrulama">Deneyimimi doğrula</Link>
          </div>
        </div>
      </section>

      <HomeSavedBoard />

      <section className={`l2t-container ${styles.partnerStrip}`}>
        <div>
          <span className={styles.kicker}>Seyahati tamamla</span>
          <h2>Uçuş, konaklama ve internet tek akışta</h2>
          <p>Dış partner bağlantıları güvenli biçimde yeni sekmede açılır.</p>
        </div>
        <div className={styles.partnerActions}>
          <a href={trackedAffiliateUrl({ provider: "booking", url: siteSettings.bookingAffiliateUrl, sourcePage: "home_sprint_2" })} target="_blank" rel="nofollow sponsored noreferrer">
            <Hotel size={20} /><span><strong>Otel bul</strong><small>Booking üzerinden</small></span>
          </a>
          <a href={trackedAffiliateUrl({ provider: "airalo", url: siteSettings.airaloAffiliateUrl, sourcePage: "home_sprint_2" })} target="_blank" rel="nofollow sponsored noreferrer">
            <Wifi size={20} /><span><strong>eSIM al</strong><small>Airalo üzerinden</small></span>
          </a>
          <Link href="/rota-asistani"><Map size={20} /><span><strong>Rota hazırla</strong><small>Rota Asistanı ile</small></span></Link>
        </div>
      </section>
    </div>
  );
}
