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

  return (
    <div className="max-w-7xl mx-auto py-12 px-4">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-extrabold text-white mb-4">Vize Merkezi</h1>
        <p className="text-gray-400 max-w-2xl mx-auto">
          Güncel randevu durumları, gerekli belgeler ve gerçek gezgin deneyimleriyle vize süreçlerini yakından takip edin.
        </p>
      </div>

      <div className="l2t-belgeli-gezgin-grid-3">
        {pages.map((p: any) => (
          <div key={p.id} className="l2t-belgeli-gezgin-card flex flex-col">
            <h2 className="l2t-belgeli-gezgin-title">{p.country_name} - {p.visa_title}</h2>
            <div className="text-sm text-gray-400 mb-4">{p.visa_type}</div>
            
            <div className="mb-6 flex-grow">
              <div className="text-sm font-semibold text-gray-300 mb-1">Randevu Durumu:</div>
              {p.appointment_status ? (
                <span className={APPOINTMENT_STATUS_INFO[p.appointment_status as AppointmentStatus]?.cssClass || 'l2t-apt-bilgiyok'}>
                  {APPOINTMENT_STATUS_INFO[p.appointment_status as AppointmentStatus]?.label || 'Bilgi Yok'}
                </span>
              ) : (
                <span className="l2t-apt-bilgiyok">Bilgi Yok</span>
              )}
            </div>

            <Link href={`/vize-merkezi/${p.slug}`} className="l2t-belgeli-gezgin-btn w-full text-center">
              Detayları Gör
            </Link>
          </div>
        ))}
      </div>

      {pages.length === 0 && (
        <div className="text-center py-12 text-gray-400">Şu anda aktif vize sayfası bulunmuyor.</div>
      )}

      <div className="l2t-legal-notice mt-12">
        Bu sayfadaki bilgiler ve kullanıcı yorumları bilgilendirme amaçlıdır. Vize kuralları, belge listeleri ve randevu süreçleri değişebilir. Başvuru öncesi resmi konsolosluk, aracı kurum ve yetkili makamların güncel duyurularını kontrol ediniz.
      </div>
    </div>
  );
}
