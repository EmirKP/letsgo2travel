"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { 
  ArrowLeft, AlertTriangle, CheckCircle, XCircle, EyeOff, Trash2, Loader2, 
  Search, Filter, ChevronLeft, ChevronRight, MessageSquare, FileText, 
  Flag, CheckSquare, X, AlignLeft, Calendar, User
} from "lucide-react";

type TabType = "topics" | "replies" | "reports";

export default function AdminForumPage() {
  const [password, setPassword] = useState("");
  const [activeTab, setActiveTab] = useState<TabType>("topics");
  
  // Data states
  const [items, setItems] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState<any>({});
  
  // UI states
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filter & Pagination states
  const [page, setPage] = useState(1);
  const limit = 20;
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  
  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Modals & Panels
  const [detailItem, setDetailItem] = useState<any>(null);
  const [actionModal, setActionModal] = useState<{ isOpen: boolean, action: string, type: TabType, id: string | null, isBulk: boolean }>({
    isOpen: false, action: "", type: "topics", id: null, isBulk: false
  });
  const [modNote, setModNote] = useState("");

  const fetchStats = useCallback(async (pass: string) => {
    try {
      const res = await fetch("/api/admin/forum/stats", { headers: { "x-admin-password": pass } });
      if (res.ok) {
        const json = await res.json();
        setStats(json.data || {});
      }
    } catch (e) {}
  }, []);

  const fetchData = useCallback(async (pass: string, currentTab: TabType, currentPage: number, currentSearch: string, currentStatus: string) => {
    setIsLoading(true);
    setError(null);
    try {
      let query = `?page=${currentPage}&limit=${limit}`;
      if (currentSearch) query += `&search=${encodeURIComponent(currentSearch)}`;
      if (currentStatus) query += `&status=${currentStatus}`;
      
      const endpoint = `/api/admin/forum/${currentTab}${query}`;
      
      const res = await fetch(endpoint, { headers: { "x-admin-password": pass } });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) throw new Error("Admin yetkisi doğrulanamadı.");
        throw new Error("Forum verileri alınamadı.");
      }

      const data = await res.json();
      setItems(data.data || []);
      setTotalCount(data.count || 0);
      setSelectedIds([]); // reset selection
    } catch (err: any) {
      setError(err.message || "İşlem sırasında hata oluştu.");
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("l2t-admin-password") || "";
    if (saved) {
      setPassword(saved);
      fetchStats(saved);
      fetchData(saved, activeTab, page, search, filterStatus);
    } else {
      setError("Admin yetkisi doğrulanamadı.");
      setIsLoading(false);
    }
  }, [activeTab, page, fetchStats, fetchData]); // Debounce search in a real app, here we will trigger manually or on blur

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchData(password, activeTab, 1, search, filterStatus);
  };

  const handleFilterChange = (status: string) => {
    setFilterStatus(status);
    setPage(1);
    fetchData(password, activeTab, 1, search, status);
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setPage(1);
    setSearch("");
    setFilterStatus("");
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(items.map(item => item.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectItem = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const performAction = async () => {
    const { action, type, id, isBulk } = actionModal;
    const ids = isBulk ? selectedIds : (id ? [id] : []);
    
    if (ids.length === 0) {
      alert("Seçili kayıt bulunamadı.");
      setActionModal({ ...actionModal, isOpen: false });
      return;
    }

    try {
      const method = action === "delete" ? "DELETE" : "PATCH";
      const body = action === "delete" ? { ids } : { ids, status: action };
      
      const res = await fetch(`/api/admin/forum/${type}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": password
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) throw new Error("İşlem sırasında hata oluştu.");
      
      // refresh
      fetchStats(password);
      fetchData(password, activeTab, page, search, filterStatus);
      setDetailItem(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionModal({ isOpen: false, action: "", type: "topics", id: null, isBulk: false });
      setModNote("");
    }
  };

  const openActionModal = (action: string, id: string | null = null, isBulk: boolean = false) => {
    setActionModal({ isOpen: true, action, type: activeTab, id, isBulk });
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case "pending": return <span style={{ background: "#F59E0B", color: "#fff", padding: "4px 8px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: "600" }}>Bekliyor</span>;
      case "published": return <span style={{ background: "#10B981", color: "#fff", padding: "4px 8px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: "600" }}>Yayında</span>;
      case "rejected": return <span style={{ background: "#EF4444", color: "#fff", padding: "4px 8px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: "600" }}>Reddedildi</span>;
      case "hidden": return <span style={{ background: "#6B7280", color: "#fff", padding: "4px 8px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: "600" }}>Gizli</span>;
      case "closed": return <span style={{ background: "#1E3A8A", color: "#fff", padding: "4px 8px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: "600" }}>Kilitli</span>;
      case "open": return <span style={{ background: "#F97316", color: "#fff", padding: "4px 8px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: "600" }}>Açık Rapor</span>;
      case "resolved": return <span style={{ background: "#10B981", color: "#fff", padding: "4px 8px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: "600" }}>Çözüldü</span>;
      case "dismissed": return <span style={{ background: "#9CA3AF", color: "#fff", padding: "4px 8px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: "600" }}>Reddedildi</span>;
      default: return <span>{status}</span>;
    }
  };

  // Error State Render (with password input)
  if (error) {
    return (
      <div className="l2t-page l2t-wrap" style={{ minHeight: "80vh", padding: "60px 20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", background: "#fff", padding: "48px", borderRadius: "24px", boxShadow: "0 24px 50px rgba(0,0,0,0.05)", maxWidth: "500px", margin: "0 auto", width: "100%" }}>
          <AlertTriangle size={48} color="#EF4444" style={{ margin: "0 auto 24px" }} />
          <h1 style={{ fontSize: "1.8rem", color: "var(--l2t-navy)", marginBottom: "16px" }}>Erişim Reddedildi</h1>
          <p style={{ color: "var(--l2t-soft)", marginBottom: "24px" }}>{error}</p>
          
          <div style={{ marginBottom: "32px", textAlign: "left" }}>
            <label style={{ display: "block", marginBottom: "8px", color: "var(--l2t-navy)", fontWeight: "600", fontSize: "0.95rem" }}>Admin Şifresi</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Şifrenizi girin..."
              style={{ width: "100%", padding: "14px 16px", borderRadius: "12px", border: "1px solid #e2e8f0", outline: "none", fontSize: "1rem" }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && password) {
                  localStorage.setItem("l2t-admin-password", password);
                  setError(null);
                  fetchStats(password);
                  fetchData(password, activeTab, page, search, filterStatus);
                }
              }}
            />
            <button 
              onClick={() => {
                if (password) {
                  localStorage.setItem("l2t-admin-password", password);
                  setError(null);
                  fetchStats(password);
                  fetchData(password, activeTab, page, search, filterStatus);
                }
              }} 
              className="l2t-btn" 
              style={{ width: "100%", background: "var(--l2t-blue)", color: "#fff", padding: "14px", marginTop: "12px", border: "none", borderRadius: "12px", cursor: "pointer", fontWeight: "600" }}
            >
              Giriş Yap
            </button>
          </div>

          <Link href="/admin/dashboard" style={{ color: "var(--l2t-soft)", textDecoration: "none", fontSize: "0.95rem", display: "inline-block" }}>
            Veya Dashboard'a Dön
          </Link>
        </div>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  return (
    <div className="l2t-page" style={{ background: "#F8FAFC", minHeight: "100vh", paddingBottom: "100px" }}>
      <div className="l2t-wrap" style={{ paddingTop: "40px" }}>
        
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "32px", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <Link href="/admin/dashboard" style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "var(--l2t-soft)", textDecoration: "none", marginBottom: "8px", fontWeight: "500" }}>
              <ArrowLeft size={18} /> Dashboard'a Dön
            </Link>
            <h1 style={{ fontSize: "2rem", color: "var(--l2t-navy)", margin: 0 }}>Gelişmiş Forum Yönetimi</h1>
          </div>
        </div>

        {/* Dashboard Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px", marginBottom: "32px" }}>
          {[
            { label: "Bekleyen Konular", val: stats.pendingTopics, icon: <FileText size={20} color="#F59E0B" />, bg: "#FEF3C7" },
            { label: "Yayındaki Konular", val: stats.publishedTopics, icon: <CheckCircle size={20} color="#10B981" />, bg: "#D1FAE5" },
            { label: "Bekleyen Cevaplar", val: stats.pendingReplies, icon: <MessageSquare size={20} color="#3B82F6" />, bg: "#DBEAFE" },
            { label: "Açık Raporlar", val: stats.openReports, icon: <Flag size={20} color="#EF4444" />, bg: "#FEE2E2" },
            { label: "Bugün Gelen Konu", val: stats.todayTopics, icon: <Calendar size={20} color="#8B5CF6" />, bg: "#EDE9FE" },
            { label: "Bugün Gelen Cevap", val: stats.todayReplies, icon: <Calendar size={20} color="#EC4899" />, bg: "#FCE7F3" },
          ].map((s, i) => (
            <div key={i} style={{ background: "#fff", padding: "20px", borderRadius: "16px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", display: "flex", alignItems: "center", gap: "16px" }}>
              <div style={{ background: s.bg, width: "48px", height: "48px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {s.icon}
              </div>
              <div>
                <div style={{ fontSize: "1.5rem", fontWeight: "700", color: "var(--l2t-navy)", lineHeight: "1" }}>{s.val ?? "-"}</div>
                <div style={{ fontSize: "0.85rem", color: "var(--l2t-soft)", marginTop: "4px" }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Main Content Area */}
        <div style={{ background: "#fff", borderRadius: "24px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.05)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          
          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid #E2E8F0", background: "#F8FAFC", overflowX: "auto" }}>
            <button 
              onClick={() => handleTabChange("topics")}
              style={{ flex: 1, padding: "20px 24px", border: "none", background: activeTab === "topics" ? "#fff" : "transparent", color: activeTab === "topics" ? "var(--l2t-blue)" : "var(--l2t-soft)", fontWeight: activeTab === "topics" ? "700" : "500", borderBottom: activeTab === "topics" ? "3px solid var(--l2t-blue)" : "3px solid transparent", cursor: "pointer", fontSize: "1.05rem", minWidth: "150px" }}
            >
              Konular
            </button>
            <button 
              onClick={() => handleTabChange("replies")}
              style={{ flex: 1, padding: "20px 24px", border: "none", background: activeTab === "replies" ? "#fff" : "transparent", color: activeTab === "replies" ? "var(--l2t-blue)" : "var(--l2t-soft)", fontWeight: activeTab === "replies" ? "700" : "500", borderBottom: activeTab === "replies" ? "3px solid var(--l2t-blue)" : "3px solid transparent", cursor: "pointer", fontSize: "1.05rem", minWidth: "150px" }}
            >
              Cevaplar
            </button>
            <button 
              onClick={() => handleTabChange("reports")}
              style={{ flex: 1, padding: "20px 24px", border: "none", background: activeTab === "reports" ? "#fff" : "transparent", color: activeTab === "reports" ? "var(--l2t-blue)" : "var(--l2t-soft)", fontWeight: activeTab === "reports" ? "700" : "500", borderBottom: activeTab === "reports" ? "3px solid var(--l2t-blue)" : "3px solid transparent", cursor: "pointer", fontSize: "1.05rem", minWidth: "150px" }}
            >
              Raporlar
            </button>
          </div>

          {/* Toolbar (Search & Filters) */}
          <div style={{ padding: "24px", borderBottom: "1px solid #E2E8F0", display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
            <form onSubmit={handleSearch} style={{ display: "flex", gap: "12px", flex: "1 1 300px" }}>
              <div style={{ position: "relative", flex: 1 }}>
                <Search size={18} color="#9CA3AF" style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)" }} />
                <input 
                  type="text" 
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={`${activeTab === "topics" ? "Konu başlığı veya yazar" : activeTab === "replies" ? "İçerik veya yazar" : "Rapor nedeni"} ara...`}
                  style={{ width: "100%", padding: "12px 16px 12px 44px", borderRadius: "12px", border: "1px solid #E2E8F0", outline: "none" }}
                />
              </div>
              <button type="submit" className="l2t-btn" style={{ background: "var(--l2t-blue)", color: "#fff", padding: "0 24px", borderRadius: "12px", border: "none", fontWeight: "600" }}>
                Ara
              </button>
            </form>
            
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <Filter size={18} color="#64748B" />
              <select 
                value={filterStatus}
                onChange={e => handleFilterChange(e.target.value)}
                style={{ padding: "12px 16px", borderRadius: "12px", border: "1px solid #E2E8F0", outline: "none", background: "#fff", minWidth: "150px" }}
              >
                <option value="">Tüm Durumlar</option>
                {activeTab !== "reports" ? (
                  <>
                    <option value="pending">Bekleyen (pending)</option>
                    <option value="published">Yayında (published)</option>
                    <option value="rejected">Reddedildi (rejected)</option>
                    <option value="hidden">Gizli (hidden)</option>
                    <option value="closed">Kilitli (closed)</option>
                  </>
                ) : (
                  <>
                    <option value="open">Açık (open)</option>
                    <option value="resolved">Çözüldü (resolved)</option>
                    <option value="dismissed">Reddedildi (dismissed)</option>
                  </>
                )}
              </select>
            </div>
          </div>

          {/* Bulk Actions */}
          {selectedIds.length > 0 && (
            <div style={{ background: "#EFF6FF", padding: "16px 24px", display: "flex", alignItems: "center", gap: "16px", borderBottom: "1px solid #BFDBFE" }}>
              <span style={{ fontWeight: "600", color: "var(--l2t-blue)" }}>{selectedIds.length} kayıt seçildi</span>
              
              {activeTab !== "reports" ? (
                <>
                  <button onClick={() => openActionModal("published", null, true)} style={{ background: "#10B981", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "8px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                    <CheckCircle size={16} /> Yayınla
                  </button>
                  <button onClick={() => openActionModal("rejected", null, true)} style={{ background: "#F59E0B", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "8px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                    <XCircle size={16} /> Reddet
                  </button>
                  <button onClick={() => openActionModal("hidden", null, true)} style={{ background: "#6B7280", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "8px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                    <EyeOff size={16} /> Gizle
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => openActionModal("resolved", null, true)} style={{ background: "#10B981", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "8px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                    <CheckCircle size={16} /> Çözüldü
                  </button>
                  <button onClick={() => openActionModal("dismissed", null, true)} style={{ background: "#6B7280", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "8px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                    <XCircle size={16} /> Reddet
                  </button>
                </>
              )}
              
              <button onClick={() => openActionModal("delete", null, true)} style={{ background: "#EF4444", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "8px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", marginLeft: "auto" }}>
                <Trash2 size={16} /> Sil
              </button>
            </div>
          )}

          {/* Table / List */}
          <div style={{ overflowX: "auto" }}>
            {isLoading ? (
              <div style={{ padding: "100px", textAlign: "center" }}>
                <Loader2 size={48} color="var(--l2t-blue)" className="l2t-spin" style={{ margin: "0 auto" }} />
                <p style={{ marginTop: "16px", color: "var(--l2t-soft)" }}>Veriler yükleniyor...</p>
              </div>
            ) : items.length === 0 ? (
              <div style={{ padding: "100px", textAlign: "center" }}>
                <CheckSquare size={64} color="#E2E8F0" style={{ margin: "0 auto 16px" }} />
                <h3 style={{ fontSize: "1.2rem", color: "var(--l2t-navy)", marginBottom: "8px" }}>Kayıt Bulunamadı</h3>
                <p style={{ color: "var(--l2t-soft)" }}>Bu sekmede veya filtreye uygun hiçbir kayıt yok.</p>
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "800px" }}>
                <thead>
                  <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                    <th style={{ padding: "16px 24px", width: "50px" }}>
                      <input 
                        type="checkbox" 
                        checked={items.length > 0 && selectedIds.length === items.length}
                        onChange={handleSelectAll}
                        style={{ width: "18px", height: "18px", cursor: "pointer" }}
                      />
                    </th>
                    <th style={{ padding: "16px 24px", textAlign: "left", color: "#64748B", fontWeight: "600", fontSize: "0.9rem" }}>Durum</th>
                    <th style={{ padding: "16px 24px", textAlign: "left", color: "#64748B", fontWeight: "600", fontSize: "0.9rem" }}>
                      {activeTab === "topics" ? "Başlık" : activeTab === "replies" ? "Cevap" : "Neden"}
                    </th>
                    <th style={{ padding: "16px 24px", textAlign: "left", color: "#64748B", fontWeight: "600", fontSize: "0.9rem" }}>
                      {activeTab === "reports" ? "Hedef" : "Yazar"}
                    </th>
                    <th style={{ padding: "16px 24px", textAlign: "left", color: "#64748B", fontWeight: "600", fontSize: "0.9rem" }}>Tarih</th>
                    <th style={{ padding: "16px 24px", textAlign: "right", color: "#64748B", fontWeight: "600", fontSize: "0.9rem" }}>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id} style={{ borderBottom: "1px solid #E2E8F0", transition: "background 0.2s" }} onMouseEnter={e => e.currentTarget.style.background = "#F8FAFC"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <td style={{ padding: "16px 24px" }}>
                        <input 
                          type="checkbox" 
                          checked={selectedIds.includes(item.id)}
                          onChange={() => handleSelectItem(item.id)}
                          style={{ width: "18px", height: "18px", cursor: "pointer" }}
                        />
                      </td>
                      <td style={{ padding: "16px 24px" }}>{getStatusBadge(item.status)}</td>
                      
                      <td style={{ padding: "16px 24px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }} onClick={() => setDetailItem(item)}>
                          <div style={{ background: "#F1F5F9", width: "40px", height: "40px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {activeTab === "topics" ? <FileText size={20} color="#64748B" /> : activeTab === "replies" ? <MessageSquare size={20} color="#64748B" /> : <Flag size={20} color="#64748B" />}
                          </div>
                          <div>
                            <div style={{ fontWeight: "600", color: "var(--l2t-navy)", maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {activeTab === "topics" ? item.title : activeTab === "replies" ? item.content : item.reason}
                            </div>
                            <div style={{ fontSize: "0.85rem", color: "var(--l2t-soft)", marginTop: "4px" }}>
                              Kimlik: {item.id.slice(0, 8)}...
                            </div>
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: "16px 24px", color: "var(--l2t-navy)" }}>
                        {activeTab === "reports" ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}><span style={{ textTransform: "uppercase", fontSize: "0.8rem", background: "#E2E8F0", padding: "2px 6px", borderRadius: "4px" }}>{item.target_type}</span></div>
                        ) : (
                          item.author_name
                        )}
                      </td>

                      <td style={{ padding: "16px 24px", color: "var(--l2t-soft)", fontSize: "0.95rem" }}>
                        {new Date(item.created_at).toLocaleDateString("tr-TR")}
                      </td>

                      <td style={{ padding: "16px 24px", textAlign: "right" }}>
                        <button 
                          onClick={() => setDetailItem(item)}
                          style={{ background: "#F1F5F9", color: "var(--l2t-blue)", border: "none", padding: "8px 16px", borderRadius: "8px", fontWeight: "600", cursor: "pointer", fontSize: "0.9rem" }}
                        >
                          İncele
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ padding: "24px", borderTop: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ color: "var(--l2t-soft)", fontSize: "0.95rem" }}>
                Toplam <strong>{totalCount}</strong> kayıt, Sayfa <strong>{page}</strong> / <strong>{totalPages}</strong>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button 
                  disabled={page === 1}
                  onClick={() => { setPage(p => p - 1); fetchData(password, activeTab, page - 1, search, filterStatus); }}
                  style={{ background: page === 1 ? "#F1F5F9" : "#fff", color: page === 1 ? "#9CA3AF" : "var(--l2t-navy)", border: "1px solid #E2E8F0", padding: "8px 16px", borderRadius: "8px", fontWeight: "600", cursor: page === 1 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "6px" }}
                >
                  <ChevronLeft size={18} /> Önceki
                </button>
                <button 
                  disabled={page === totalPages}
                  onClick={() => { setPage(p => p + 1); fetchData(password, activeTab, page + 1, search, filterStatus); }}
                  style={{ background: page === totalPages ? "#F1F5F9" : "#fff", color: page === totalPages ? "#9CA3AF" : "var(--l2t-navy)", border: "1px solid #E2E8F0", padding: "8px 16px", borderRadius: "8px", fontWeight: "600", cursor: page === totalPages ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "6px" }}
                >
                  Sonraki <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Slide-over Detail Panel */}
      {detailItem && (
        <>
          <div onClick={() => setDetailItem(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 998, backdropFilter: "blur(4px)" }} />
          <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "100%", maxWidth: "500px", background: "#fff", zIndex: 999, boxShadow: "-10px 0 30px rgba(0,0,0,0.1)", display: "flex", flexDirection: "column", transform: "translateX(0)", transition: "transform 0.3s" }}>
            
            <div style={{ padding: "24px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--l2t-navy)", color: "#fff" }}>
              <h2 style={{ margin: 0, fontSize: "1.2rem", display: "flex", alignItems: "center", gap: "8px" }}>
                <AlignLeft size={20} /> Detaylar
              </h2>
              <button onClick={() => setDetailItem(null)} style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer" }}>
                <X size={24} />
              </button>
            </div>

            <div style={{ padding: "24px", flex: 1, overflowY: "auto" }}>
              <div style={{ marginBottom: "24px" }}>
                {getStatusBadge(detailItem.status)}
              </div>

              {activeTab === "topics" && (
                <>
                  <h3 style={{ fontSize: "1.4rem", color: "var(--l2t-navy)", marginBottom: "16px" }}>{detailItem.title}</h3>
                  <div style={{ background: "#F8FAFC", padding: "20px", borderRadius: "12px", marginBottom: "24px", color: "var(--l2t-navy)", whiteSpace: "pre-wrap", lineHeight: "1.6", border: "1px solid #E2E8F0" }}>
                    {detailItem.content}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
                    <div>
                      <div style={{ fontSize: "0.85rem", color: "var(--l2t-soft)", marginBottom: "4px" }}>Yazar</div>
                      <div style={{ fontWeight: "600", color: "var(--l2t-navy)" }}>{detailItem.author_name}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.85rem", color: "var(--l2t-soft)", marginBottom: "4px" }}>Tarih</div>
                      <div style={{ fontWeight: "600", color: "var(--l2t-navy)" }}>{new Date(detailItem.created_at).toLocaleString("tr-TR")}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.85rem", color: "var(--l2t-soft)", marginBottom: "4px" }}>Kategori</div>
                      <div style={{ fontWeight: "600", color: "var(--l2t-navy)" }}>{detailItem.category}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.85rem", color: "var(--l2t-soft)", marginBottom: "4px" }}>Ülke</div>
                      <div style={{ fontWeight: "600", color: "var(--l2t-navy)" }}>{detailItem.country_slug || "-"}</div>
                    </div>
                  </div>
                </>
              )}

              {activeTab === "replies" && (
                <>
                  <div style={{ fontSize: "0.85rem", color: "var(--l2t-soft)", marginBottom: "8px" }}>Bağlı Konu</div>
                  <h3 style={{ fontSize: "1.1rem", color: "var(--l2t-navy)", marginBottom: "16px" }}>{detailItem.topic?.title || "Bilinmiyor"}</h3>
                  
                  <div style={{ fontSize: "0.85rem", color: "var(--l2t-soft)", marginBottom: "8px" }}>Cevap İçeriği</div>
                  <div style={{ background: "#F8FAFC", padding: "20px", borderRadius: "12px", marginBottom: "24px", color: "var(--l2t-navy)", whiteSpace: "pre-wrap", lineHeight: "1.6", border: "1px solid #E2E8F0" }}>
                    {detailItem.content}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
                    <div>
                      <div style={{ fontSize: "0.85rem", color: "var(--l2t-soft)", marginBottom: "4px" }}>Yazar</div>
                      <div style={{ fontWeight: "600", color: "var(--l2t-navy)" }}>{detailItem.author_name}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.85rem", color: "var(--l2t-soft)", marginBottom: "4px" }}>Tarih</div>
                      <div style={{ fontWeight: "600", color: "var(--l2t-navy)" }}>{new Date(detailItem.created_at).toLocaleString("tr-TR")}</div>
                    </div>
                  </div>
                </>
              )}

              {activeTab === "reports" && (
                <>
                  <div style={{ fontSize: "0.85rem", color: "var(--l2t-soft)", marginBottom: "8px" }}>Rapor Nedeni</div>
                  <div style={{ background: "#FEF2F2", padding: "20px", borderRadius: "12px", marginBottom: "24px", color: "#991B1B", fontWeight: "500", border: "1px solid #FECACA" }}>
                    {detailItem.reason}
                  </div>

                  <div style={{ fontSize: "0.85rem", color: "var(--l2t-soft)", marginBottom: "8px" }}>Raporlanan İçerik Özeti ({detailItem.target_type})</div>
                  <div style={{ background: "#F8FAFC", padding: "16px", borderRadius: "12px", marginBottom: "24px", border: "1px solid #E2E8F0" }}>
                    {detailItem.targetContent ? (
                      <>
                        {detailItem.targetContent.title && <div style={{ fontWeight: "700", marginBottom: "8px", color: "var(--l2t-navy)" }}>{detailItem.targetContent.title}</div>}
                        <div style={{ fontSize: "0.95rem", color: "var(--l2t-navy)", marginBottom: "12px" }}>{detailItem.targetContent.content.substring(0, 150)}...</div>
                        <div style={{ fontSize: "0.85rem", color: "var(--l2t-soft)" }}>Yazar: {detailItem.targetContent.author_name}</div>
                      </>
                    ) : (
                      <div style={{ color: "var(--l2t-soft)" }}>İçerik bulunamadı veya silinmiş olabilir.</div>
                    )}
                  </div>
                  
                  <div style={{ fontSize: "0.85rem", color: "var(--l2t-soft)", marginBottom: "4px" }}>Tarih</div>
                  <div style={{ fontWeight: "600", color: "var(--l2t-navy)", marginBottom: "24px" }}>{new Date(detailItem.created_at).toLocaleString("tr-TR")}</div>
                </>
              )}
            </div>

            {/* Action Footer */}
            <div style={{ padding: "24px", borderTop: "1px solid #E2E8F0", background: "#F8FAFC", display: "flex", gap: "12px", flexWrap: "wrap" }}>
              {activeTab !== "reports" ? (
                <>
                  <button onClick={() => openActionModal("published", detailItem.id)} style={{ flex: 1, background: "#10B981", color: "#fff", border: "none", padding: "12px", borderRadius: "12px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                    <CheckCircle size={18} /> Yayınla
                  </button>
                  <button onClick={() => openActionModal("rejected", detailItem.id)} style={{ flex: 1, background: "#F59E0B", color: "#fff", border: "none", padding: "12px", borderRadius: "12px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                    <XCircle size={18} /> Reddet
                  </button>
                  <button onClick={() => openActionModal("hidden", detailItem.id)} style={{ flex: 1, background: "#6B7280", color: "#fff", border: "none", padding: "12px", borderRadius: "12px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                    <EyeOff size={18} /> Gizle
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => openActionModal("resolved", detailItem.id)} style={{ flex: 1, background: "#10B981", color: "#fff", border: "none", padding: "12px", borderRadius: "12px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                    <CheckCircle size={18} /> Çözüldü
                  </button>
                  <button onClick={() => openActionModal("dismissed", detailItem.id)} style={{ flex: 1, background: "#6B7280", color: "#fff", border: "none", padding: "12px", borderRadius: "12px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                    <XCircle size={18} /> Reddet
                  </button>
                </>
              )}
              <button onClick={() => openActionModal("delete", detailItem.id)} style={{ width: "100%", background: "#FEF2F2", color: "#EF4444", border: "1px solid #FECACA", padding: "12px", borderRadius: "12px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginTop: "8px" }}>
                <Trash2 size={18} /> Kalıcı Sil
              </button>
            </div>

          </div>
        </>
      )}

      {/* Action Confirmation Modal */}
      {actionModal.isOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
          <div style={{ background: "#fff", width: "100%", maxWidth: "450px", borderRadius: "24px", overflow: "hidden", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)" }}>
            <div style={{ padding: "32px", textAlign: "center" }}>
              {actionModal.action === "delete" ? (
                <div style={{ background: "#FEF2F2", width: "64px", height: "64px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
                  <AlertTriangle size={32} color="#EF4444" />
                </div>
              ) : (
                <div style={{ background: "#F1F5F9", width: "64px", height: "64px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
                  <AlertTriangle size={32} color="var(--l2t-blue)" />
                </div>
              )}
              
              <h3 style={{ fontSize: "1.4rem", color: "var(--l2t-navy)", marginBottom: "16px" }}>
                {actionModal.action === "delete" ? "Kalıcı Olarak Silinsin mi?" : "İşlemi Onaylayın"}
              </h3>
              
              <p style={{ color: "var(--l2t-soft)", lineHeight: "1.5", marginBottom: "24px" }}>
                {actionModal.action === "delete" 
                  ? "Bu işlem geri alınamaz. Silmek yerine önce 'Gizle' seçeneğini kullanmanız önerilir. Yine de kalıcı olarak silmek istiyor musunuz?" 
                  : `${actionModal.isBulk ? selectedIds.length + " kaydı" : "Bu kaydı"} ${actionModal.action} statüsüne geçirmek üzeresiniz.`}
              </p>

              {(actionModal.action === "rejected" || actionModal.action === "hidden") && activeTab !== "reports" && (
                <div style={{ textAlign: "left", marginBottom: "24px" }}>
                  <label style={{ display: "block", fontSize: "0.9rem", fontWeight: "600", color: "var(--l2t-navy)", marginBottom: "8px" }}>Moderasyon Notu (İsteğe Bağlı)</label>
                  <textarea 
                    value={modNote}
                    onChange={e => setModNote(e.target.value)}
                    placeholder="Red veya gizleme nedeni yazın..."
                    style={{ width: "100%", padding: "12px", borderRadius: "12px", border: "1px solid #E2E8F0", minHeight: "80px", outline: "none", resize: "none" }}
                  />
                  <div style={{ fontSize: "0.75rem", color: "#9CA3AF", marginTop: "8px", display: "flex", gap: "6px" }}>
                    <AlertTriangle size={14} /> Bu not şu an yalnızca işlem sırasında bilgilendirme amaçlıdır. Kalıcı kayıt için ileride moderation_note alanı eklenmelidir.
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: "12px" }}>
                <button 
                  onClick={() => { setActionModal({ ...actionModal, isOpen: false }); setModNote(""); }}
                  style={{ flex: 1, padding: "14px", background: "#F1F5F9", color: "var(--l2t-navy)", border: "none", borderRadius: "12px", fontWeight: "600", cursor: "pointer" }}
                >
                  İptal
                </button>
                <button 
                  onClick={performAction}
                  style={{ flex: 1, padding: "14px", background: actionModal.action === "delete" ? "#EF4444" : "var(--l2t-blue)", color: "#fff", border: "none", borderRadius: "12px", fontWeight: "600", cursor: "pointer" }}
                >
                  {actionModal.action === "delete" ? "Evet, Kalıcı Sil" : "Onayla"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
