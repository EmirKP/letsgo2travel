"use client";

import { useEffect, useState } from "react";
import { Trophy, ShieldCheck, Crown, AlertOctagon, EyeOff, CheckCircle } from "lucide-react";
import { supabase } from "@/lib/supabase-client";

export default function AdminKasiflerLigiPage() {
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [verifiedLeaders, setVerifiedLeaders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Bütün opt-in yapmış kullanıcıları (gizlenmiş olanlar dahil) getir.
      // Profil üzerinden SQL ile leaderboard_hidden, opt_in_leaderboard ve visited_countries çekilecek
      // RLS'i aşmak için API yazılabilirdi ancak admin olarak Supabase service client ile de alınabilir.
      // Ya da mevcut /api/kasifler-ligi ve /api/dogrulanmis-kasifler kullanılabilir ama onlar 'gizli' olanları filtreliyor.
      // Admin için her şeyi çeken özel bir sorgu yapmalıyız. 
      // Ancak hızlı çözüm için şimdilik client'tan tüm profilleri admin yetkisiyle çekmeye çalışıyoruz. 
      // Not: Eger profillerde RLS varsa auth.uid() izin vermezse bos doner. 
      // Admin API si yapmadığımız için standart çekmeyi deniyoruz, adminse okur:
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, email, visited_countries, leaderboard_hidden, opt_in_leaderboard')
        .eq('opt_in_leaderboard', true);

      if (profiles) {
        setLeaderboard(profiles.sort((a, b) => (b.visited_countries?.length || 0) - (a.visited_countries?.length || 0)));
      }

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleHideUser = async (userId: string, currentHidden: boolean) => {
    try {
      const { error } = await supabase.from('profiles').update({ leaderboard_hidden: !currentHidden }).eq('id', userId);
      if (!error) {
        setLeaderboard(prev => prev.map(p => p.id === userId ? { ...p, leaderboard_hidden: !currentHidden } : p));
      } else {
        alert("Güncellenemedi.");
      }
    } catch (e) {}
  };

  return (
    <section className="l2t-page l2t-wrap" style={{ minHeight: "80vh", padding: "40px 0" }}>
      <div className="l2t-page-head" style={{ marginBottom: "40px" }}>
        <p className="l2t-kicker" style={{ display: "flex", alignItems: "center", gap: "6px" }}><Trophy size={16} /> Admin Merkezi</p>
        <h1 style={{ fontSize: "2.5rem", color: "var(--l2t-navy)", marginBottom: "8px" }}>Kaşifler Ligi Yönetimi</h1>
        <p style={{ color: "var(--l2t-soft)", margin: 0 }}>Liderlik tablolarını yönetin ve şüpheli kullanıcıları public sıralamadan gizleyin.</p>
      </div>

      <div className="glass-panel" style={{ padding: "32px", borderRadius: "24px", background: "#fff", boxShadow: "0 10px 30px rgba(0,0,0,0.03)" }}>
        <h2 style={{ fontSize: "1.5rem", color: "var(--l2t-navy)", marginBottom: "24px", display: "flex", alignItems: "center", gap: "8px" }}>
          <Trophy color="#F59E0B" /> Beyan Esaslı Katılımcılar
        </h2>

        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--l2t-soft)" }}>Yükleniyor...</div>
        ) : leaderboard.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--l2t-soft)" }}>Katılımcı bulunamadı.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: "800px" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                  <th style={{ padding: "16px 12px", color: "var(--l2t-soft)", fontWeight: "600" }}>Sıra</th>
                  <th style={{ padding: "16px 12px", color: "var(--l2t-soft)", fontWeight: "600" }}>Kullanıcı</th>
                  <th style={{ padding: "16px 12px", color: "var(--l2t-soft)", fontWeight: "600" }}>E-posta</th>
                  <th style={{ padding: "16px 12px", color: "var(--l2t-soft)", fontWeight: "600" }}>Beyan Edilen Ülke</th>
                  <th style={{ padding: "16px 12px", color: "var(--l2t-soft)", fontWeight: "600" }}>Durum</th>
                  <th style={{ padding: "16px 12px", color: "var(--l2t-soft)", fontWeight: "600", textAlign: "right" }}>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((l, index) => {
                  const isHidden = l.leaderboard_hidden === true;
                  return (
                    <tr key={l.id} style={{ borderBottom: "1px solid #f1f5f9", background: isHidden ? "#fff1f2" : "transparent" }}>
                      <td style={{ padding: "16px 12px", fontWeight: "700", color: "var(--l2t-navy)" }}>#{index + 1}</td>
                      <td style={{ padding: "16px 12px", color: "var(--l2t-navy)", fontWeight: "600", textTransform: "capitalize" }}>{l.username || "Gezgin"}</td>
                      <td style={{ padding: "16px 12px", color: "var(--l2t-soft)" }}>{l.email}</td>
                      <td style={{ padding: "16px 12px", fontWeight: "800", color: "var(--l2t-blue)" }}>{l.visited_countries?.length || 0}</td>
                      <td style={{ padding: "16px 12px" }}>
                        {isHidden ? (
                          <span style={{ color: "#ef4444", fontSize: "0.85rem", fontWeight: "700", display: "flex", alignItems: "center", gap: "4px" }}><EyeOff size={14} /> Gizlendi</span>
                        ) : (
                          <span style={{ color: "#10b981", fontSize: "0.85rem", fontWeight: "700", display: "flex", alignItems: "center", gap: "4px" }}><CheckCircle size={14} /> Public Görünür</span>
                        )}
                      </td>
                      <td style={{ padding: "16px 12px", textAlign: "right" }}>
                        <button 
                          onClick={() => toggleHideUser(l.id, isHidden)}
                          style={{ padding: "8px 16px", background: isHidden ? "#10b981" : "#fef2f2", color: isHidden ? "#fff" : "#ef4444", border: "none", borderRadius: "8px", fontWeight: "600", cursor: "pointer" }}
                        >
                          {isHidden ? "Görünür Yap" : "Sıralamadan Gizle"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      <div style={{ marginTop: "40px", padding: "24px", background: "rgba(245, 158, 11, 0.05)", border: "1px solid rgba(245, 158, 11, 0.2)", borderRadius: "20px", display: "flex", alignItems: "flex-start", gap: "16px" }}>
        <AlertOctagon size={24} color="#b45309" style={{ flexShrink: 0 }} />
        <div>
          <h3 style={{ margin: "0 0 8px", color: "#b45309", fontSize: "1.1rem" }}>Aylık Ödül ve Doğrulanmış Sıralama</h3>
          <p style={{ margin: 0, color: "#92400e", fontSize: "0.95rem", lineHeight: "1.5" }}>
            Fiziksel ödüller için kazanan belirleme işlemini <strong>Seyahat Doğrulama</strong> menüsünden onaylanan puanlara göre manuel değerlendirebilirsiniz. `monthly_explorer_awards` tablosu SQL tarafında oluşturulmuştur ancak admin panelde henüz detaylı dashboard yapılmamıştır. Ödül gönderimi manuel takip edilebilir.
          </p>
        </div>
      </div>
    </section>
  );
}
