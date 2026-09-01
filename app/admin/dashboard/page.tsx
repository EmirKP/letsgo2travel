"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";

export default function AdminDashboardPage() {
  const [users, setUsers] = useState<unknown[]>([]);

  async function loadStats() {
    try {
      const resUsers = await fetch("/api/admin/users");
      const usersData = await resUsers.json();
      if (usersData.data) {
        setUsers(usersData.data);
      }
    } catch {}
  }

  useEffect(() => {
    void loadStats();
  }, []);

  return (
    <section className="l2t-page l2t-wrap" style={{ minHeight: "80vh", padding: "40px 0" }}>
      <div className="l2t-page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "32px" }}>
        <div>
          <a href="/admin" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--l2t-soft)", textDecoration: "none", marginBottom: "16px", fontWeight: "600", fontSize: "0.95rem" }} className="hover-tilt">
            ← Admin Paneline Dön
          </a>
          <p className="l2t-kicker">Admin Dashboard</p>
          <h1 style={{ fontSize: "2.5rem", color: "var(--l2t-navy)", marginBottom: "8px" }}>Genel Bakış</h1>
          <p style={{ color: "var(--l2t-soft)", margin: 0 }}>Sistemdeki kullanıcı istatistikleri ve modül yönetimi.</p>
        </div>
      </div>

      {/* METRIC CARDS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "20px", marginBottom: "40px" }}>
        {[
          { title: "Kayıtlı Kullanıcı", value: users.length.toString(), icon: <Users size={24} color="#10B981" />, bg: "#d1fae5" },
        ].map((card, i) => (
          <div key={i} className="glass-panel hover-tilt" style={{ padding: "24px", borderRadius: "20px", background: "#fff", display: "flex", alignItems: "center", gap: "20px" }}>
            <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: card.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {card.icon}
            </div>
            <div>
              <p style={{ color: "var(--l2t-muted)", fontSize: "0.85rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 4px" }}>{card.title}</p>
              <strong style={{ fontSize: "1.8rem", color: "var(--l2t-navy)", lineHeight: "1" }}>{card.value}</strong>
            </div>
          </div>
        ))}
      </div>
      {/* MODÜLLER LİNKLERİ (FORUM & REHBER) */}
      <div style={{ marginBottom: "40px" }}>
        <h2 style={{ fontSize: "1.3rem", color: "var(--l2t-navy)", marginBottom: "20px" }}>Modül Yönetimi</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px" }}>

          <a href="/admin/forum" style={{ textDecoration: "none" }}>
            <div className="glass-panel hover-tilt" style={{ padding: "24px", borderRadius: "20px", background: "#fff", display: "flex", alignItems: "center", gap: "20px", border: "1px solid #f1f5f9" }}>
              <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--l2t-blue)" }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              </div>
              <div>
                <p style={{ color: "var(--l2t-muted)", fontSize: "0.85rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 4px" }}>Topluluk</p>
                <strong style={{ fontSize: "1.2rem", color: "var(--l2t-navy)", lineHeight: "1" }}>Forum Yönetimi</strong>
              </div>
            </div>
          </a>

          <a href="/admin/rehber" style={{ textDecoration: "none" }}>
            <div className="glass-panel hover-tilt" style={{ padding: "24px", borderRadius: "20px", background: "#fff", display: "flex", alignItems: "center", gap: "20px", border: "1px solid #f1f5f9" }}>
              <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: "#ECFDF5", display: "flex", alignItems: "center", justifyContent: "center", color: "#059669" }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
              </div>
              <div>
                <p style={{ color: "var(--l2t-muted)", fontSize: "0.85rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 4px" }}>Bilgi Bankası</p>
                <strong style={{ fontSize: "1.2rem", color: "var(--l2t-navy)", lineHeight: "1" }}>Rehber Merkezi</strong>
              </div>
            </div>
          </a>

          <a href="/admin/raporlar" style={{ textDecoration: "none" }}>
            <div className="glass-panel hover-tilt" style={{ padding: "24px", borderRadius: "20px", background: "#fff", display: "flex", alignItems: "center", gap: "20px", border: "1px solid #f1f5f9" }}>
              <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", color: "#EF4444" }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>
              </div>
              <div>
                <p style={{ color: "var(--l2t-muted)", fontSize: "0.85rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 4px" }}>Moderasyon</p>
                <strong style={{ fontSize: "1.2rem", color: "var(--l2t-navy)", lineHeight: "1" }}>Raporlanan İçerikler</strong>
              </div>
            </div>
          </a>

        </div>
      </div>
    </section>
  );
}
