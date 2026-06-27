"use client";

import { useEffect, useState } from "react";
import { Users, Search, Settings as SettingsIcon, Mail, Key, KeyRound, ShieldCheck, CheckCircle2, AlertCircle } from "lucide-react";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [password, setPassword] = useState("");
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState("user");
  const [selectedRole, setSelectedRole] = useState("user");

  useEffect(() => {
    const saved = localStorage.getItem("l2t-admin-password") || "";
    setPassword(saved);
    if (saved) {
      loadUsers(saved);
    }
    
    // Get current user role
    import("@/lib/supabase-client").then(({ supabase }) => {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session?.user) {
          supabase.from("profiles").select("role").eq("id", data.session.user.id).single().then(({ data: profile }) => {
            if (profile) setCurrentUserRole(profile.role);
          });
        }
      });
    });
  }, []);

  async function loadUsers(pass: string) {
    try {
      const res = await fetch("/api/admin/users", {
        headers: { "x-admin-password": pass }
      });
      const data = await res.json();
      if (data.data) {
        setUsers(data.data);
      }
    } catch (e) {}
  }

  const handlePasswordSet = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionMessage("");
    setActionError("");

    if (newPassword.length < 8) {
      setActionError("Şifre en az 8 karakter olmalıdır.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setActionError("Şifreler eşleşmiyor.");
      return;
    }

    setIsActionLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}/password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": password
        },
        body: JSON.stringify({ newPassword })
      });
      const data = await res.json();
      if (data.error) {
        setActionError(data.error);
      } else {
        setActionMessage(data.message || "Şifre güncellendi.");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch (e) {
      setActionError("Bağlantı hatası oluştu.");
    }
    setIsActionLoading(false);
  };

  const handleSendResetEmail = async () => {
    setActionMessage("");
    setActionError("");
    setIsActionLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}/send-password-reset`, {
        method: "POST",
        headers: {
          "x-admin-password": password
        }
      });
      const data = await res.json();
      if (data.error) {
        setActionError(data.error);
      } else {
        setActionMessage(data.message || "Sıfırlama e-postası gönderildi.");
      }
    } catch (e) {
      setActionError("Bağlantı hatası oluştu.");
    }
    setIsActionLoading(false);
  };

  const handleUpdateRole = async () => {
    setActionMessage("");
    setActionError("");
    setIsActionLoading(true);

    try {
      const { supabase } = await import("@/lib/supabase-client");
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setActionError("Bu işlem için giriş yapmalısınız.");
        setIsActionLoading(false);
        return;
      }

      const res = await fetch(`/api/admin/users/${selectedUser.id}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ role: selectedRole })
      });
      const data = await res.json();
      
      if (data.error) {
        setActionError(data.error);
      } else {
        setActionMessage("Kullanıcı rolü başarıyla güncellendi.");
        loadUsers(password); // Reload users to reflect role change
      }
    } catch (e) {
      setActionError("Bağlantı hatası oluştu.");
    }
    setIsActionLoading(false);
  };

  const filteredUsers = users.filter(u => {
    const term = search.toLowerCase();
    const name = u.user_metadata?.name || u.user_metadata?.full_name || u.user_metadata?.username || "";
    const email = u.email || "";
    const username = u.username || "";
    return name.toLowerCase().includes(term) || email.toLowerCase().includes(term) || username.toLowerCase().includes(term);
  });

  return (
    <section className="l2t-page l2t-wrap" style={{ minHeight: "80vh", padding: "40px 0" }}>
      <div className="l2t-page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "40px" }}>
        <div>
          <p className="l2t-kicker" style={{ display: "flex", alignItems: "center", gap: "6px" }}><ShieldCheck size={16} /> Admin Merkezi</p>
          <h1 style={{ fontSize: "2.5rem", color: "var(--l2t-navy)", marginBottom: "8px" }}>Kullanıcı Yönetimi</h1>
          <p style={{ color: "var(--l2t-soft)", margin: 0 }}>Tüm kayıtlı kullanıcıları ve üyeliklerini buradan yönetin.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <input 
            type="password" 
            value={password} 
            onChange={(e) => {
              setPassword(e.target.value);
              if (e.target.value) loadUsers(e.target.value);
            }} 
            placeholder="Admin Şifresi" 
            style={{ padding: "10px 16px", borderRadius: "10px", border: "1px solid var(--l2t-border)", outline: "none" }}
          />
        </div>
      </div>

      <div className="glass-panel" style={{ background: "#fff", borderRadius: "24px", padding: "32px", marginBottom: "40px" }}>
        <div style={{ display: "flex", gap: "16px", marginBottom: "24px", position: "relative" }}>
          <Search size={20} color="var(--l2t-soft)" style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)" }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Kullanıcı adı, ad soyad veya e-posta ara..."
            style={{ width: "100%", padding: "14px 14px 14px 48px", borderRadius: "12px", border: "1px solid var(--l2t-border)", fontSize: "1rem", outline: "none" }}
          />
        </div>

        <div className="l2t-table-wrap" style={{ border: "1px solid var(--l2t-border)", boxShadow: "none", borderRadius: "16px", margin: 0, overflow: "hidden" }}>
          <table className="l2t-table" style={{ minWidth: "900px" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ padding: "16px 32px" }}>Ad Soyad</th>
                <th>E-posta</th>
                <th>Rol / Rütbe</th>
                <th>Kayıt Tarihi</th>
                <th>Son Giriş</th>
                <th style={{ textAlign: "right", paddingRight: "32px" }}>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => {
                const name = u.full_name || u.user_metadata?.name || u.user_metadata?.full_name || u.user_metadata?.username || "İsim eklenmemiş";
                const joined = new Date(u.created_at).toLocaleDateString("tr-TR");
                const lastLogin = u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString("tr-TR") : "Bilinmiyor";
                
                const roleBadgeColors: Record<string, { bg: string, text: string }> = {
                  'user': { bg: '#f1f5f9', text: '#64748b' }, // gri
                  'moderator': { bg: '#eff6ff', text: '#3b82f6' }, // mavi
                  'editor': { bg: '#faf5ff', text: '#a855f7' }, // mor
                  'admin': { bg: '#fff7ed', text: '#f97316' }, // turuncu
                  'super_admin': { bg: '#fef2f2', text: '#ef4444' } // kırmızı
                };
                const userRole = u.role || 'user';
                const badgeStyle = roleBadgeColors[userRole] || roleBadgeColors['user'];

                return (
                  <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "16px 32px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#e0e7ff", color: "#4f46e5", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700" }}>
                          {name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <strong style={{ color: "var(--l2t-navy)", display: "block", marginBottom: "2px" }}>{name}</strong>
                          <small style={{ color: "var(--l2t-soft)", fontWeight: "600", fontFamily: "monospace" }}>@{u.username || "Belirtilmemiş"}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{ color: "var(--l2t-navy)" }}>{u.email}</span>
                      {u.email_confirmed_at && <span style={{ display: "inline-flex", alignItems: "center", marginLeft: "8px", color: "#10B981" }}><CheckCircle2 size={14} /></span>}
                    </td>
                    <td>
                      <span style={{ 
                        background: badgeStyle.bg, 
                        color: badgeStyle.text, 
                        padding: "4px 10px", 
                        borderRadius: "100px", 
                        fontSize: "0.85rem", 
                        fontWeight: "700",
                        textTransform: "uppercase"
                      }}>
                        {userRole.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      <span style={{ color: "var(--l2t-soft)" }}>{joined}</span>
                    </td>
                    <td>
                      <span style={{ color: "var(--l2t-soft)" }}>{lastLogin}</span>
                    </td>
                    <td style={{ textAlign: "right", paddingRight: "32px" }}>
                      <button 
                        onClick={() => {
                          setSelectedUser(u);
                          setSelectedRole(userRole);
                          setActionMessage("");
                          setActionError("");
                          setNewPassword("");
                          setConfirmPassword("");
                        }} 
                        className="l2t-btn l2t-btn-outline" 
                        style={{ padding: "8px 16px", display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "0.9rem" }}
                      >
                        <SettingsIcon size={16} /> Ayarlar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredUsers.length === 0 && (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--l2t-soft)" }}>Aradığınız kriterlerde kullanıcı bulunamadı.</div>
          )}
        </div>
      </div>

      {/* USER SETTINGS MODAL */}
      {selectedUser && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(6, 24, 58, 0.4)", backdropFilter: "blur(4px)" }} onClick={() => setSelectedUser(null)} />
          <div className="glass-panel" style={{ position: "relative", zIndex: 101, background: "#fff", width: "100%", maxWidth: "600px", borderRadius: "24px", padding: "32px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
              <div>
                <h2 style={{ margin: "0 0 8px", color: "var(--l2t-navy)", fontSize: "1.5rem" }}>Kullanıcı Ayarları</h2>
                <p style={{ margin: 0, color: "var(--l2t-soft)" }}>{selectedUser.email}</p>
              </div>
              <button onClick={() => setSelectedUser(null)} style={{ background: "#f1f5f9", border: "none", width: "36px", height: "36px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <AlertCircle size={20} color="var(--l2t-navy)" style={{ display: 'none' }} />
                <span style={{ fontSize: "1.2rem", color: "var(--l2t-navy)", fontWeight: "bold" }}>&times;</span>
              </button>
            </div>

            {actionMessage && <div style={{ padding: "12px", background: "#d1fae5", color: "#065f46", borderRadius: "8px", marginBottom: "20px", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px" }}><CheckCircle2 size={18} /> {actionMessage}</div>}
            {actionError && <div style={{ padding: "12px", background: "#fef2f2", color: "#ef4444", borderRadius: "8px", marginBottom: "20px", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px" }}><AlertCircle size={18} /> {actionError}</div>}

            <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
              {/* Role Management Section (Only for super_admin) */}
              {currentUserRole === 'super_admin' && (
                <div style={{ padding: "24px", background: "#fef2f2", borderRadius: "16px", border: "1px solid #fecaca" }}>
                  <h3 style={{ margin: "0 0 12px", color: "#991b1b", fontSize: "1.1rem", display: "flex", alignItems: "center", gap: "8px" }}><ShieldCheck size={18} color="#ef4444" /> Rütbe / Yetki Yönetimi</h3>
                  <p style={{ margin: "0 0 16px", color: "#b91c1c", fontSize: "0.9rem" }}>Bu işlem kullanıcının site genelindeki yetkilerini değiştirir. Sadece Super Adminler tarafından görülebilir.</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <select 
                      value={selectedRole}
                      onChange={(e) => setSelectedRole(e.target.value)}
                      style={{ padding: "12px", borderRadius: "10px", border: "1px solid #fca5a5", outline: "none", width: "100%", background: "#fff", color: "#7f1d1d" }}
                    >
                      <option value="user">User (Normal Kullanıcı)</option>
                      <option value="moderator">Moderator (Forum Yöneticisi)</option>
                      <option value="editor">Editor (İçerik Yöneticisi)</option>
                      <option value="admin">Admin (Genel Yönetici)</option>
                      <option value="super_admin">Super Admin (Tam Yetkili)</option>
                    </select>
                    <button 
                      onClick={handleUpdateRole}
                      disabled={isActionLoading || selectedUser.role === selectedRole}
                      className="l2t-btn" 
                      style={{ width: "100%", padding: "12px", background: "#ef4444", color: "#fff", border: "none", opacity: isActionLoading || selectedUser.role === selectedRole ? 0.5 : 1, cursor: isActionLoading || selectedUser.role === selectedRole ? "not-allowed" : "pointer" }}
                    >
                      {isActionLoading ? "Güncelleniyor..." : "Rütbeyi Güncelle"}
                    </button>
                  </div>
                </div>
              )}

              {/* Reset Email Section */}
              <div style={{ padding: "24px", background: "#f8fafc", borderRadius: "16px", border: "1px solid var(--l2t-border)" }}>
                <h3 style={{ margin: "0 0 12px", color: "var(--l2t-navy)", fontSize: "1.1rem", display: "flex", alignItems: "center", gap: "8px" }}><Mail size={18} color="#1476f2" /> Şifre Sıfırlama E-postası</h3>
                <p style={{ margin: "0 0 16px", color: "var(--l2t-soft)", fontSize: "0.9rem" }}>Kullanıcıya şifresini kendisinin belirleyebileceği güvenli bir sıfırlama bağlantısı gönderir.</p>
                <button 
                  onClick={handleSendResetEmail} 
                  disabled={isActionLoading}
                  className="l2t-btn" 
                  style={{ width: "100%", display: "flex", justifyContent: "center", gap: "8px", padding: "12px", background: "#fff", color: "#1476f2", border: "1px solid #1476f2" }}
                >
                  <Mail size={18} /> Sıfırlama E-postası Gönder
                </button>
              </div>

              {/* Force Password Section */}
              <div style={{ padding: "24px", background: "#f8fafc", borderRadius: "16px", border: "1px solid var(--l2t-border)" }}>
                <h3 style={{ margin: "0 0 12px", color: "var(--l2t-navy)", fontSize: "1.1rem", display: "flex", alignItems: "center", gap: "8px" }}><KeyRound size={18} color="#f59e0b" /> Yeni Şifre Belirle (Zorunlu)</h3>
                <p style={{ margin: "0 0 16px", color: "var(--l2t-soft)", fontSize: "0.9rem" }}>Mevcut şifre okunamaz. Bu işlem kullanıcının şifresini doğrudan değiştirir. Minimum 8 karakter gereklidir.</p>
                <form onSubmit={handlePasswordSet} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <input
                    type="password"
                    placeholder="Yeni Şifre"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    style={{ padding: "12px", borderRadius: "10px", border: "1px solid var(--l2t-border)", outline: "none" }}
                    required
                    minLength={8}
                  />
                  <input
                    type="password"
                    placeholder="Yeni Şifre (Tekrar)"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    style={{ padding: "12px", borderRadius: "10px", border: "1px solid var(--l2t-border)", outline: "none" }}
                    required
                    minLength={8}
                  />
                  <button 
                    type="submit" 
                    disabled={isActionLoading}
                    className="l2t-btn" 
                    style={{ width: "100%", padding: "12px", marginTop: "8px", display: "flex", justifyContent: "center", gap: "8px" }}
                  >
                    <Key size={18} /> Şifreyi Güncelle
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
