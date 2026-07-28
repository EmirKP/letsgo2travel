import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock3, FileCheck2, Info, ShieldCheck } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { APPOINTMENT_STATUS_INFO, type AppointmentStatus } from "@/lib/visa/appointmentStatus";
import styles from "./visa-center.module.css";

export const metadata: Metadata = {
  title: "Vize Merkezi",
  description: "Vize türlerini, hazırlanmış rehberleri ve güncel randevu notlarını tek ekranda incele.",
};

export const dynamic = "force-dynamic";

type VisaCenterPage = {
  id: string | number;
  country_name: string;
  visa_title: string;
  visa_type: string;
  appointment_status?: AppointmentStatus | null;
  slug?: string | null;
};

const fallbackPages: VisaCenterPage[] = [
  { id: "fb1", country_name: "Schengen Bölgesi", visa_title: "Turistik Vize", visa_type: "C Tipi Schengen" },
  { id: "fb2", country_name: "İngiltere", visa_title: "Standart Ziyaretçi Vizesi", visa_type: "Turistik" },
  { id: "fb3", country_name: "Almanya", visa_title: "Schengen Vizesi", visa_type: "Turistik / Ticari" },
  { id: "fb4", country_name: "Fransa", visa_title: "Schengen Vizesi", visa_type: "Turistik" },
  { id: "fb5", country_name: "İtalya", visa_title: "Schengen Vizesi", visa_type: "Turistik" },
  { id: "fb6", country_name: "Hollanda", visa_title: "Schengen Vizesi", visa_type: "Turistik / Aile Ziyareti" },
  { id: "fb7", country_name: "Amerika Birleşik Devletleri", visa_title: "B1/B2 Vizesi", visa_type: "Ziyaretçi" },
  { id: "fb8", country_name: "Birleşik Arap Emirlikleri", visa_title: "Dubai Vizesi", visa_type: "Online kısa süreli vize" },
  { id: "fb9", country_name: "Kanada", visa_title: "Geçici Ziyaretçi Vizesi", visa_type: "Turistik" },
];

function statusClass(status?: AppointmentStatus | null) {
  if (status === "yakin_tarih_bulundu") return styles.statusAvailable;
  if (status === "ara_ara_bosluk_var" || status === "manuel_kontrol_edildi") return styles.statusLimited;
  if (status === "yakin_tarih_zor") return styles.statusHard;
  return styles.statusUnknown;
}

export default async function VizeMerkeziPage() {
  const supabase = getSupabaseAdmin();
  let pages: VisaCenterPage[] = [];

  if (supabase) {
    const { data } = await supabase
      .from("visa_center_pages")
      .select("id,country_name,visa_title,visa_type,appointment_status,slug")
      .eq("is_active", true)
      .order("country_name", { ascending: true });

    if (data) pages = data as VisaCenterPage[];
  }

  const hasPublishedData = pages.length > 0;
  const displayPages = hasPublishedData ? pages : fallbackPages;

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.head}>
          <p className={styles.kicker}>Vize rehberleri</p>
          <h1>Vize sürecini daha düzenli takip et.</h1>
          <p>
            Vize türlerini, yayımlanmış belge rehberlerini ve mevcutsa güncel randevu notlarını aynı yerde karşılaştır.
          </p>
          <Link href="/vize-randevu" className={styles.heroAction}>
            Randevu takibi oluştur <ArrowRight size={16} />
          </Link>
        </header>

        {!hasPublishedData && (
          <div className={styles.notice} role="status">
            <Info size={23} />
            <div>
              <strong>Vize rehberleri hazırlanıyor</strong>
              <p>
                Henüz doğrulanmış randevu verisi yayımlanmadı. Bu nedenle belirsiz bilgileri “güncel” gibi göstermiyoruz.
                Hazır olan içerikler yönetim panelinden yayımlandığında detay bağlantıları otomatik açılacak.
              </p>
            </div>
          </div>
        )}

        <section className={styles.grid} aria-label="Vize rehberleri">
          {displayPages.map((page) => {
            const status = page.appointment_status;
            const statusLabel = status
              ? APPOINTMENT_STATUS_INFO[status]?.label || "Kontrol bekleniyor"
              : "Doğrulanmış veri bekleniyor";

            return (
              <article className={styles.card} key={page.id}>
                <div className={styles.cardTop}>
                  <h2>{page.country_name}</h2>
                  <span className={styles.icon} aria-hidden="true">
                    {hasPublishedData ? <FileCheck2 size={20} /> : <Clock3 size={20} />}
                  </span>
                </div>
                <p className={styles.visaTitle}>{page.visa_title}</p>
                <p className={styles.visaType}>{page.visa_type}</p>

                <div className={styles.status}>
                  <span className={styles.statusLabel}>Randevu durumu</span>
                  <span className={`${styles.statusValue} ${statusClass(status)}`}>{statusLabel}</span>
                </div>

                {hasPublishedData && page.slug ? (
                  <Link href={`/vize-merkezi/${page.slug}`} className={styles.action}>
                    Rehberi aç <ArrowRight size={15} />
                  </Link>
                ) : (
                  <span className={styles.actionDisabled} aria-label="Rehber hazırlanıyor">
                    <ShieldCheck size={15} /> Rehber hazırlanıyor
                  </span>
                )}
              </article>
            );
          })}
        </section>

        <div className={styles.legal}>
          <strong>Yasal uyarı:</strong> Vize kuralları, belge listeleri ve randevu süreçleri değişebilir. Başvuru öncesinde
          konsolosluk, yetkili aracı kurum ve resmi makamların güncel duyurularını doğrulayın.
        </div>
      </div>
    </div>
  );
}
