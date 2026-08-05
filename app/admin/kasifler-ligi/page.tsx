"use client";

import { useEffect, useState } from "react";
import { Trophy, AlertOctagon, EyeOff, CheckCircle } from "lucide-react";

type LeaderboardEntry = {
  id: string;
  username: string | null;
  visitedCount: number;
  hidden: boolean;
};

export default function AdminKasiflerLigiPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/admin/leaderboard", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Katılımcılar alınamadı.");
      }
      setLeaderboard(Array.isArray(payload.data) ? payload.data : []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Katılımcılar alınamadı.");
    } finally {
      setLoading(false);
    }
  };

  const toggleHideUser = async (userId: string, currentHidden: boolean) => {
    setErrorMessage("");
    try {
      const response = await fetch("/api/admin/leaderboard", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, hidden: !currentHidden }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Görünürlük güncellenemedi.");
      }
      setLeaderboard((current) =>
        current.map((entry) =>
          entry.id === userId ? { ...entry, hidden: !currentHidden } : entry,
        ),
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Görünürlük güncellenemedi.");
    }
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

        {errorMessage ? (
          <div role="alert" style={{ padding: "16px", marginBottom: "20px", borderRadius: "12px", background: "#fef2f2", color: "#b91c1c" }}>
            {errorMessage}
          </div>
        ) : null}

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
                  <th style={{ padding: "16px 12px", color: "var(--l2t-soft)", fontWeight: "600" }}>Beyan Edilen Ülke</th>
                  <th style={{ padding: "16px 12px", color: "var(--l2t-soft)", fontWeight: "600" }}>Durum</th>
                  <th style={{ padding: "16px 12px", color: "var(--l2t-soft)", fontWeight: "600", textAlign: "right" }}>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((l, index) => {
                  const isHidden = l.hidden;
                  return (
                    <tr key={l.id} style={{ borderBottom: "1px solid #f1f5f9", background: isHidden ? "#fff1f2" : "transparent" }}>
                      <td style={{ padding: "16px 12px", fontWeight: "700", color: "var(--l2t-navy)" }}>#{index + 1}</td>
                      <td style={{ padding: "16px 12px", color: "var(--l2t-navy)", fontWeight: "600", textTransform: "capitalize" }}>{l.username || "Gezgin"}</td>
                      <td style={{ padding: "16px 12px", fontWeight: "800", color: "var(--l2t-blue)" }}>{l.visitedCount}</td>
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
