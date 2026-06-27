import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { notFound } from "next/navigation";
import { APPOINTMENT_STATUS_INFO, AppointmentStatus } from "@/lib/visa/appointmentStatus";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function VizeDetayPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const { slug } = resolvedParams;
  
  const supabase = getSupabaseAdmin();
  if (!supabase) return notFound();

  const { data: page } = await supabase
    .from('visa_center_pages')
    .select('*')
    .eq('slug', slug)
    .single();

  if (!page) return notFound();

  return (
    <div className="max-w-4xl mx-auto py-12 px-4">
      <div className="mb-8">
        <Link href="/vize-merkezi" className="text-[var(--l2t-blue)] hover:underline">&larr; Vize Merkezi'ne Dön</Link>
      </div>

      <div className="l2t-belgeli-gezgin-card mb-8">
        <h1 className="text-3xl font-extrabold text-white mb-2">{page.country_name} - {page.visa_title}</h1>
        <div className="text-gray-400 text-lg mb-6">{page.visa_type}</div>

        <div className="bg-black/20 p-4 rounded-lg border border-white/5 mb-6">
          <h2 className="text-lg font-bold text-white mb-2">Randevu Durumu</h2>
          <div className="flex items-center gap-4">
            {page.appointment_status ? (
              <span className={`px-3 py-1 rounded text-sm font-bold ${APPOINTMENT_STATUS_INFO[page.appointment_status as AppointmentStatus]?.cssClass || 'l2t-apt-bilgiyok'}`}>
                {APPOINTMENT_STATUS_INFO[page.appointment_status as AppointmentStatus]?.label || 'Bilgi Yok'}
              </span>
            ) : (
              <span className="l2t-apt-bilgiyok">Bilgi Yok</span>
            )}
            {page.last_checked_at && (
              <span className="text-sm text-gray-500">Son Güncelleme: {new Date(page.last_checked_at).toLocaleDateString('tr-TR')}</span>
            )}
          </div>
          {page.appointment_note && (
            <p className="mt-4 text-gray-300 text-sm bg-black/40 p-3 rounded">{page.appointment_note}</p>
          )}
        </div>

        {page.country_code === 'GB' && (
          <div className="bg-blue-900/20 border-l-4 border-blue-500 p-4 mb-6 rounded text-sm text-blue-200">
            <strong>Bilgi:</strong> UK vizesi Schengen değildir. İngiltere, İskoçya, Galler, Kuzey İrlanda için kullanılabilir. İrlanda Cumhuriyeti ayrı kurallara tabidir.
          </div>
        )}

        <div className="prose prose-invert max-w-none">
          {page.summary && (
             <div className="mb-6">
               <h3 className="text-xl font-bold text-white mb-2">Özet Bilgi</h3>
               <p className="text-gray-300">{page.summary}</p>
             </div>
          )}
          {page.who_should_apply && (
             <div className="mb-6">
               <h3 className="text-xl font-bold text-white mb-2">Kimler Başvurmalı?</h3>
               <p className="text-gray-300">{page.who_should_apply}</p>
             </div>
          )}
        </div>

        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/forum/yeni" className="l2t-belgeli-gezgin-btn">Forumda Soru Sor</Link>
          <Link href={`/pasaport-gucu/${page.slug}`} className="l2t-belgeli-gezgin-btn-outline">Pasaport Gücü & Deneyimler</Link>
        </div>
      </div>

      <div className="l2t-legal-notice">
        Bu sayfadaki bilgiler ve kullanıcı yorumları bilgilendirme amaçlıdır. Vize kuralları, belge listeleri ve randevu süreçleri değişebilir. Başvuru öncesi resmi konsolosluk, aracı kurum ve yetkili makamların güncel duyurularını kontrol ediniz.
      </div>
    </div>
  );
}
