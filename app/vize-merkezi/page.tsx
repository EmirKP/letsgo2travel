import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { APPOINTMENT_STATUS_INFO, AppointmentStatus } from "@/lib/visa/appointmentStatus";

export const dynamic = "force-dynamic";

export default async function VizeMerkeziPage() {
  const supabase = getSupabaseAdmin();
  let pages = [];
  
  if (supabase) {
    const { data } = await supabase
      .from('visa_center_pages')
      .select('*')
      .eq('is_active', true)
      .order('country_name', { ascending: true });
    
    if (data) pages = data;
  }

  // Static Fallback Data
  const fallbackPages = [
    { id: 'fb1', country_name: 'Schengen Bölgesi', visa_title: 'Turistik Vize (Kısa Süreli)', visa_type: 'C Tipi Schengen', appointment_status: 'moderate' },
    { id: 'fb2', country_name: 'İngiltere (Birleşik Krallık)', visa_title: 'Standart Ziyaretçi Vizesi', visa_type: 'Turistik', appointment_status: 'available' },
    { id: 'fb3', country_name: 'Almanya', visa_title: 'Schengen Vizesi', visa_type: 'Turistik / Ticari', appointment_status: 'critical' },
    { id: 'fb4', country_name: 'Fransa', visa_title: 'Schengen Vizesi', visa_type: 'Turistik', appointment_status: 'moderate' },
    { id: 'fb5', country_name: 'İtalya', visa_title: 'Schengen Vizesi', visa_type: 'Turistik', appointment_status: 'moderate' },
    { id: 'fb6', country_name: 'Hollanda', visa_title: 'Schengen Vizesi', visa_type: 'Turistik / Aile Ziyareti', appointment_status: 'critical' },
    { id: 'fb7', country_name: 'Amerika Birleşik Devletleri', visa_title: 'B1/B2 Vizesi', visa_type: 'Ziyaretçi', appointment_status: 'critical' },
    { id: 'fb8', country_name: 'Birleşik Arap Emirlikleri', visa_title: 'Dubai Vizesi (Online)', visa_type: 'E-Vize (Kısa Süreli)', appointment_status: 'available' },
    { id: 'fb9', country_name: 'Kanada', visa_title: 'Geçici Ziyaretçi Vizesi (TRV)', visa_type: 'Turistik', appointment_status: 'moderate' },
  ];

  const hasData = pages.length > 0;
  const displayPages = hasData ? pages : fallbackPages;

  return (
    <div className="l2t-wrap l2t-page">
      <div className="l2t-page-hero">
        <h1>Vize Merkezi</h1>
        <p>
          Güncel randevu durumları, gerekli belgeler ve gerçek gezgin deneyimleriyle vize süreçlerini yakından takip edin.
        </p>
      </div>

      <div className="l2t-visa-grid">
        {displayPages.map((p: any) => (
          <div key={p.id} className="l2t-glass-card l2t-card">
            <div className="l2t-card-body" style={{ padding: "24px" }}>
              <h2 className="l2t-card-title">{p.country_name}</h2>
              <div className="l2t-card-subtitle">{p.visa_title}</div>
              <div className="l2t-card-muted">{p.visa_type}</div>
              
              <div className="l2t-status-box">
                <div className="l2t-status-label">Randevu Durumu</div>
                {p.appointment_status ? (
                  <span className={`l2t-status-val ${
                    p.appointment_status === 'available' ? 'l2t-color-available' :
                    p.appointment_status === 'moderate' ? 'l2t-color-moderate' :
                    p.appointment_status === 'critical' ? 'l2t-color-critical' : 'l2t-color-none'
                  }`}>
                    <span className={`l2t-dot ${
                      p.appointment_status === 'available' ? 'l2t-bg-available' :
                      p.appointment_status === 'moderate' ? 'l2t-bg-moderate' :
                      p.appointment_status === 'critical' ? 'l2t-bg-critical l2t-dot-pulse' : 'l2t-bg-none'
                    }`}></span>
                    {APPOINTMENT_STATUS_INFO[p.appointment_status as AppointmentStatus]?.label || 'Bilgi Yok'}
                  </span>
                ) : (
                  <span className="l2t-status-val l2t-color-none">Bilgi Yok</span>
                )}
              </div>

              {hasData && p.slug ? (
                <Link href={`/vize-merkezi/${p.slug}`} className="l2t-button l2t-button-gold" style={{ width: "100%", marginTop: "auto" }}>
                  Detayları Gör
                </Link>
              ) : (
                <button disabled className="l2t-button" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--l2t-muted)", width: "100%", marginTop: "auto", cursor: "not-allowed" }}>
                  Yakında Hazırlanıyor
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="l2t-info-box" style={{ maxWidth: "800px", margin: "48px auto 0" }}>
        <strong>Yasal Uyarı:</strong> Bu sayfadaki bilgiler ve kullanıcı yorumları bilgilendirme amaçlıdır. Vize kuralları, belge listeleri ve randevu süreçleri sürekli olarak değişebilir. Başvurunuzu yapmadan önce resmi konsolosluk, aracı kurum ve yetkili makamların güncel duyurularını her zaman kontrol ediniz.
      </div>
    </div>
  );
}
