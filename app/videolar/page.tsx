import type { Metadata } from "next";

export const metadata: Metadata = { title: "Videolar", description: "Letsgo2Travel video rehberleri." };

export default function VideosPage() {
  return (
    <section className="l2t-page l2t-wrap">
      <div className="l2t-page-head"><p className="l2t-kicker">YouTube</p><h1>Video rehber alanı</h1><p>Buraya YouTube içerikleri Supabase `videos` tablosundan dinamik bağlanabilir.</p></div>
      <div className="l2t-empty-state">Video modülü hazır. YouTube ID eklenince kartlar burada görünecek.</div>
    </section>
  );
}
