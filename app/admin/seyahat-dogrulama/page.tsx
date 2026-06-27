"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Check, X, FileText, MapPin, AlertTriangle, ExternalLink } from "lucide-react";

export default function AdminVerificationsPage() {
  const [verifications, setVerifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{title: string, message: string, type: 'error' | 'success'} | null>(null);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  useEffect(() => {
    fetchVerifications();
  }, []);

  const fetchVerifications = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/travel-verifications");
      const json = await res.json();
      if (json.data) {
        setVerifications(json.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (id: string, status: string, admin_note: string = "") => {
    setUpdating(id);
    try {
      const res = await fetch("/api/admin/travel-verifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, admin_note })
      });
      const json = await res.json();
      if (json.data) {
        setVerifications(prev => prev.map(v => v.id === id ? { ...v, ...json.data } : v));
        setToastMessage({ title: "Başarılı", message: "Durum güncellendi.", type: "success" });
      } else if (json.error) {
        setToastMessage({ title: "Hata", message: json.error, type: "error" });
      }
    } catch (e) {
      setToastMessage({ title: "Hata", message: "İşlem sırasında beklenmeyen bir hata oluştu.", type: "error" });
    } finally {
      setUpdating(null);
    }
  };

  const handleViewDocument = async (path: string) => {
    try {
      const res = await fetch(`/api/admin/travel-verifications/signed-url?path=${encodeURIComponent(path)}`);
      const json = await res.json();
      if (json.signedUrl) {
        window.open(json.signedUrl, '_blank');
      } else {
        setToastMessage({ title: "Hata", message: json.error || "Dosya açılamadı.", type: "error" });
      }
    } catch (e) {
      setToastMessage({ title: "Hata", message: "Bağlantı hatası.", type: "error" });
    }
  };

  return (
    <section className="l2t-page l2t-wrap" style={{ minHeight: "80vh", padding: "40px 0" }}>
      <div className="l2t-page-head" style={{ marginBottom: "40px" }}>
        <p className="l2t-kicker" style={{ display: "flex", alignItems: "center", gap: "6px" }}><ShieldCheck size={16} /> Admin Merkezi</p>
        <h1 style={{ fontSize: "2.5rem", color: "var(--l2t-navy)", marginBottom: "8px" }}>Seyahat Doğrulama</h1>
        <p style={{ color: "var(--l2t-soft)", margin: 0 }}>Kullanıcıların kanıtlı veya konum bazlı ülke doğrulama taleplerini inceleyin.</p>
      </div>

      <div className="glass-panel" style={{ padding: "32px", borderRadius: "24px", background: "#fff", boxShadow: "0 10px 30px rgba(0,0,0,0.03)" }}>
        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--l2t-soft)" }}>Yükleniyor...</div>
        ) : verifications.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--l2t-soft)" }}>Bekleyen veya tamamlanmış doğrulama bulunmuyor.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: "800px" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                  <th style={{ padding: "16px 12px", color: "var(--l2t-soft)", fontWeight: "600" }}>Kullanıcı</th>
                  <th style={{ padding: "16px 12px", color: "var(--l2t-soft)", fontWeight: "600" }}>Ülke</th>
                  <th style={{ padding: "16px 12px", color: "var(--l2t-soft)", fontWeight: "600" }}>Yöntem</th>
                  <th style={{ padding: "16px 12px", color: "var(--l2t-soft)", fontWeight: "600" }}>Tarih</th>
                  <th style={{ padding: "16px 12px", color: "var(--l2t-soft)", fontWeight: "600" }}>Durum</th>
                  <th style={{ padding: "16px 12px", color: "var(--l2t-soft)", fontWeight: "600", textAlign: "right" }}>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {verifications.map(v => {
                  const isPending = v.status === 'pending';
                  const isApproved = v.status === 'approved';
                  
                  return (
                    <tr key={v.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "16px 12px", color: "var(--l2t-navy)", fontWeight: "600" }}>
                        {v.profiles?.username || v.user_id?.substring(0, 8)}
                      </td>
                      <td style={{ padding: "16px 12px", color: "var(--l2t-navy)" }}>{v.country_name} ({v.country_code})</td>
                      <td style={{ padding: "16px 12px" }}>
                        {v.verification_method === 'location' ? (
                          <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--l2t-blue)", fontWeight: "600" }}>
                            <MapPin size={16} /> Konum
                          </span>
                        ) : (
                          <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#10b981", fontWeight: "600" }}>
                            <FileText size={16} /> Belge
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "16px 12px", color: "var(--l2t-soft)", fontSize: "0.9rem" }}>
                        {new Date(v.created_at).toLocaleDateString('tr-TR')}
                      </td>
                      <td style={{ padding: "16px 12px" }}>
                        <span style={{ 
                          padding: "4px 10px", borderRadius: "8px", fontSize: "0.85rem", fontWeight: "700",
                          background: isApproved ? "rgba(16,185,129,0.1)" : v.status === 'rejected' ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)",
                          color: isApproved ? "#10b981" : v.status === 'rejected' ? "#ef4444" : "#F59E0B"
                        }}>
                          {v.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: "16px 12px", textAlign: "right", display: "flex", gap: "8px", justifyContent: "flex-end", opacity: updating === v.id ? 0.5 : 1 }}>
                        
                        {v.verification_method === 'document' && v.proof_file_path && (
                          <button onClick={() => handleViewDocument(v.proof_file_path)} style={{ padding: "8px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", cursor: "pointer", color: "var(--l2t-soft)" }} title="Belgeyi İncele">
                            <ExternalLink size={16} />
                          </button>
                        )}

                        {v.verification_method === 'location' ? (
                          <span style={{ fontSize: "0.8rem", color: "var(--l2t-soft)" }}>Geçersiz (Konum)</span>
                        ) : isPending && (
                          <>
                            <button onClick={() => handleUpdate(v.id, "approved")} style={{ padding: "8px", background: "rgba(16,185,129,0.1)", border: "none", borderRadius: "8px", cursor: "pointer", color: "#10b981" }} title="Onayla">
                              <Check size={16} />
                            </button>
                            <button onClick={() => {
                              const note = prompt("Reddetme nedeni:");
                              if (note !== null) handleUpdate(v.id, "rejected", note);
                            }} style={{ padding: "8px", background: "rgba(239,68,68,0.1)", border: "none", borderRadius: "8px", cursor: "pointer", color: "#ef4444" }} title="Reddet">
                              <X size={16} />
                            </button>
                            <button onClick={() => {
                              const note = prompt("Daha fazla bilgi veya eksik belge:");
                              if (note !== null) handleUpdate(v.id, "needs_more_info", note);
                            }} style={{ padding: "8px", background: "rgba(245,158,11,0.1)", border: "none", borderRadius: "8px", cursor: "pointer", color: "#F59E0B" }} title="Bilgi İste">
                              <AlertTriangle size={16} />
                            </button>
                          </>
                        )}
                        
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toastMessage && (
        <div style={{ position: "fixed", bottom: "32px", right: "32px", background: toastMessage.type === "error" ? "#ef4444" : "#10b981", color: "#fff", padding: "16px 24px", borderRadius: "16px", boxShadow: "0 10px 25px rgba(0,0,0,0.2)", zIndex: 10000, display: "flex", flexDirection: "column", gap: "4px", minWidth: "300px", maxWidth: "400px", animation: "slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)" }}>
          <div style={{ fontWeight: "700", fontSize: "1.05rem" }}>{toastMessage.title}</div>
          <div style={{ fontSize: "0.9rem", opacity: 0.9, lineHeight: "1.4" }}>{toastMessage.message}</div>
        </div>
      )}

      <style jsx>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(50px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </section>
  );
}
