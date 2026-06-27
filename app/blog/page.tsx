import type { Metadata } from "next";
import Link from "next/link";
import { getBlogPosts } from "@/lib/data";

export const metadata: Metadata = { title: "Blog", description: "Letsgo2Travel seyahat blogu ve rehber içerikleri." };

export default async function BlogPage() {
  const posts = await getBlogPosts();
  return (
    <section className="l2t-page l2t-wrap" style={{ minHeight: "80vh", paddingBottom: "80px" }}>
      <div style={{ textAlign: "center", padding: "60px 20px", background: "linear-gradient(to bottom, #f8fafc, #fff)", borderRadius: "24px", marginBottom: "40px" }}>
        <span style={{ background: "var(--l2t-navy)", color: "#fff", padding: "6px 16px", borderRadius: "100px", fontSize: "0.85rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "16px", display: "inline-block" }}>Keşfet</span>
        <h1 style={{ fontSize: "2.5rem", color: "var(--l2t-navy)", fontWeight: "800", marginBottom: "16px", letterSpacing: "-0.5px" }}>Seyahat İpuçları & Rehberler</h1>
        <p style={{ color: "var(--l2t-soft)", fontSize: "1.1rem", maxWidth: "600px", margin: "0 auto" }}>Gizli kalmış rotalar, ucuz bilet bulma taktikleri ve hayat kurtaran seyahat hileleri.</p>
      </div>
      <div style={{ background: "linear-gradient(135deg, #1476f2, #0A1F4A)", borderRadius: "24px", padding: "32px", marginBottom: "40px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "24px", color: "#fff", boxShadow: "0 10px 30px rgba(20,118,242,0.15)" }}>
        <div style={{ flex: "1 1 300px" }}>
          <h2 style={{ fontSize: "1.5rem", color: "#fff", fontWeight: "800", marginBottom: "8px" }}>Okumak Yerine Hızlı Plan İster misin?</h2>
          <p style={{ color: "rgba(255,255,255,0.85)", fontSize: "1.05rem", margin: 0 }}>Blog okumaya vaktin yoksa, yapay zeka asistanımız bütçene ve tarzına en uygun 3 rotayı saniyeler içinde oluştursun.</p>
        </div>
        <Link href="/akilli-plan" className="l2t-btn" style={{ background: "#F59E0B", color: "var(--l2t-navy)", border: "none", whiteSpace: "nowrap", boxShadow: "0 4px 15px rgba(245,158,11,0.4)" }}>
          Hızlı Plan Oluştur
        </Link>
      </div>

      <div className="l2t-card-grid l2t-card-grid-3">
        {posts.map((post) => (
          <Link className="l2t-card hover-tilt" href={`/blog/${post.slug}`} key={post.id} style={{ border: "1px solid #e2e8f0", overflow: "hidden", borderRadius: "20px", textDecoration: "none", display: "flex", flexDirection: "column" }}>
            <div className="l2t-card-image" style={{ backgroundImage: `url(${post.image_url || "/travel-images/discover.jpg"})`, height: "220px", backgroundSize: "cover", backgroundPosition: "center" }} />
            <div className="l2t-card-body" style={{ padding: "24px", flex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <span style={{ color: "var(--l2t-blue)", fontWeight: "700", fontSize: "0.85rem", textTransform: "uppercase" }}>{post.category}</span>
                <span style={{ background: "#f1f5f9", color: "var(--l2t-soft)", padding: "4px 10px", borderRadius: "100px", fontSize: "0.8rem", fontWeight: "600" }}>⏱ {post.read_time}</span>
              </div>
              <h3 style={{ fontSize: "1.25rem", color: "var(--l2t-navy)", marginBottom: "12px", lineHeight: "1.4" }}>{post.title}</h3>
              <p style={{ color: "var(--l2t-soft)", fontSize: "0.95rem", lineHeight: "1.6", marginBottom: "0", flex: 1 }}>{post.excerpt}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
