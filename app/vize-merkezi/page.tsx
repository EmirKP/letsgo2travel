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
      <div className="l2t-page-head text-center max-w-3xl mx-auto mb-12">
        <h1 className="text-4xl font-extrabold text-[var(--l2t-text)] mb-4">Vize Merkezi</h1>
        <p className="text-[var(--l2t-soft)] mx-auto">
          Güncel randevu durumları, gerekli belgeler ve gerçek gezgin deneyimleriyle vize süreçlerini yakından takip edin.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {displayPages.map((p: any) => (
          <div key={p.id} className="l2t-glass-card p-6 flex flex-col transition-transform hover:-translate-y-1">
            <h2 className="text-xl font-bold text-[var(--l2t-text)] mb-1">{p.country_name}</h2>
            <div className="text-sm text-[var(--l2t-gold)] font-bold mb-1">{p.visa_title}</div>
            <div className="text-xs text-[var(--l2t-muted)] mb-4 uppercase tracking-wider">{p.visa_type}</div>
            
            <div className="mb-6 flex-grow p-4 rounded-xl bg-[var(--l2t-card-strong)] border border-[var(--l2t-border)]">
              <div className="text-xs font-bold text-[var(--l2t-soft)] mb-2 uppercase tracking-wide">Randevu Durumu</div>
              {p.appointment_status ? (
                <span className={`inline-flex items-center gap-1.5 font-bold ${
                  p.appointment_status === 'available' ? 'text-emerald-400' :
                  p.appointment_status === 'moderate' ? 'text-yellow-400' :
                  p.appointment_status === 'critical' ? 'text-red-400' : 'text-gray-400'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    p.appointment_status === 'available' ? 'bg-emerald-400' :
                    p.appointment_status === 'moderate' ? 'bg-yellow-400' :
                    p.appointment_status === 'critical' ? 'bg-red-400 animate-pulse' : 'bg-gray-400'
                  }`}></span>
                  {APPOINTMENT_STATUS_INFO[p.appointment_status as AppointmentStatus]?.label || 'Bilgi Yok'}
                </span>
              ) : (
                <span className="text-gray-400 font-bold">Bilgi Yok</span>
              )}
            </div>

            {hasData && p.slug ? (
              <Link href={`/vize-merkezi/${p.slug}`} className="l2t-button l2t-button-gold w-full text-center">
                Detayları Gör
              </Link>
            ) : (
              <button disabled className="l2t-button bg-white/5 text-[var(--l2t-muted)] border border-white/10 w-full text-center cursor-not-allowed">
                Yakında Hazırlanıyor
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="l2t-info-box mt-12 mx-auto max-w-4xl text-sm leading-relaxed">
        <strong>Yasal Uyarı:</strong> Bu sayfadaki bilgiler ve kullanıcı yorumları bilgilendirme amaçlıdır. Vize kuralları, belge listeleri ve randevu süreçleri sürekli olarak değişebilir. Başvurunuzu yapmadan önce resmi konsolosluk, aracı kurum ve yetkili makamların güncel duyurularını her zaman kontrol ediniz.
      </div>
    </div>
  );
}
