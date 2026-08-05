import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { notFound } from "next/navigation";
import { APPOINTMENT_STATUS_INFO, AppointmentStatus } from "@/lib/visa/appointmentStatus";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import styles from "../visa-center.module.css";

export const dynamic = "force-dynamic";

export default async function VizeDetayPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const { slug } = resolvedParams;
  
  const supabase = getSupabaseAdmin();
  if (!supabase) return notFound();

  const { data: page } = await supabase
    .from('visa_center_pages')
    .select('country_code,country_name,visa_title,visa_type,summary,who_should_apply,appointment_status,appointment_note,official_source_url,last_checked_at,is_active')
    .eq('slug', slug)
    .eq('is_active', true)
    .single();

  if (!page) return notFound();
  const officialSourceUrl = typeof page.official_source_url === "string" && page.official_source_url.startsWith("https://")
    ? page.official_source_url
    : null;

  return (
    <div className={styles.detailPage}>
      <div className={styles.detailBack}>
        <Link href="/vize-merkezi">&larr; Vize Merkezi'ne Dön</Link>
      </div>

      <div className={`l2t-belgeli-gezgin-card ${styles.detailCard}`}>
        <h1>{page.country_name} - {page.visa_title}</h1>
        <div className={styles.detailType}>{page.visa_type}</div>

        <div className={styles.detailStatus}>
          <h2>Randevu Durumu</h2>
          <div className={styles.detailStatusRow}>
            {page.appointment_status ? (
              <span className={`${styles.detailStatusBadge} ${APPOINTMENT_STATUS_INFO[page.appointment_status as AppointmentStatus]?.cssClass || 'l2t-apt-bilgiyok'}`}>
                {APPOINTMENT_STATUS_INFO[page.appointment_status as AppointmentStatus]?.label || 'Bilgi Yok'}
              </span>
            ) : (
              <span className="l2t-apt-bilgiyok">Bilgi Yok</span>
            )}
            {page.last_checked_at && (
              <span className={styles.detailDate}>Son güncelleme: {new Date(page.last_checked_at).toLocaleString('tr-TR')}</span>
            )}
          </div>
          {page.appointment_note && (
            <p className={styles.detailNote}>{page.appointment_note}</p>
          )}
          {officialSourceUrl && (
            <a className={styles.detailSource} href={officialSourceUrl} target="_blank" rel="noopener noreferrer">
              Resmî kaynağı aç <ExternalLink size={15} />
            </a>
          )}
        </div>

        {page.country_code === 'GB' && (
          <div className={styles.ukNotice}>
            <strong>Bilgi:</strong> UK vizesi Schengen değildir. İngiltere, İskoçya, Galler, Kuzey İrlanda için kullanılabilir. İrlanda Cumhuriyeti ayrı kurallara tabidir.
          </div>
        )}

        <div className={styles.detailContent}>
          {page.summary && (
             <div className={styles.detailBlock}>
               <h3>Özet Bilgi</h3>
               <p>{page.summary}</p>
             </div>
          )}
          {page.who_should_apply && (
             <div className={styles.detailBlock}>
               <h3>Kimler Başvurmalı?</h3>
               <p>{page.who_should_apply}</p>
             </div>
          )}
        </div>

        <div className={styles.detailActions}>
          <Link href="/forum/yeni" className="l2t-belgeli-gezgin-btn">Forumda Soru Sor</Link>
          <Link href="/pasaport-gucu" className="l2t-belgeli-gezgin-btn-outline">Pasaport Gücü & Deneyimler</Link>
        </div>
      </div>

      <div className="l2t-legal-notice">
        Bu sayfadaki bilgiler ve kullanıcı yorumları bilgilendirme amaçlıdır. Vize kuralları, belge listeleri ve randevu süreçleri değişebilir. Başvuru öncesi resmi konsolosluk, aracı kurum ve yetkili makamların güncel duyurularını kontrol ediniz.
      </div>
    </div>
  );
}
