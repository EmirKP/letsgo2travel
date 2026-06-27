import Link from "next/link";

export default function NotFound() {
  return (
    <section className="l2t-page l2t-wrap l2t-empty-state">
      <h1>Sayfa bulunamadı</h1>
      <p>Aradığın içerik taşınmış veya kaldırılmış olabilir.</p>
      <Link href="/" className="l2t-btn">Ana sayfaya dön</Link>
    </section>
  );
}
