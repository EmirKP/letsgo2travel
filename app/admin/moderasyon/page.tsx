"use client";

import React, { useState, useEffect } from "react";
import { ShieldCheck, Flag, Scale, UserX, AlertTriangle, FileText, CheckCircle, XCircle } from "lucide-react";

type Tab = "verifications" | "comments" | "kvkk" | "disputes" | "risky_content" | "community_reports";

export default function ModerationPanel() {
  const [activeTab, setActiveTab] = useState<Tab>("verifications");
  const [objections, setObjections] = useState<any[]>([]);
  const [kvkkRequests, setKvkkRequests] = useState<any[]>([]);
  const [communityReports, setCommunityReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeTab === "disputes") {
      fetchObjections();
    } else if (activeTab === "kvkk") {
      fetchKvkkRequests();
    } else if (activeTab === "community_reports") {
      fetchCommunityReports();
    }
  }, [activeTab]);

  const fetchObjections = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/business-objections");
      const data = await res.json();
      if (data.success) {
        setObjections(data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchKvkkRequests = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/kvkk-requests");
      const data = await res.json();
      if (data.success) {
        setKvkkRequests(data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCommunityReports = async () => {
    setLoading(true);
    try {
      const { supabase } = await import("@/lib/supabase-client");
      const { data } = await supabase
        .from('content_reports')
        .select('*')
        .eq('status', 'open')
        .order('created_at', { ascending: false });
      
      if (data) setCommunityReports(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleModerationAction = async (reportId: string, targetType: string, targetId: string, action: string) => {
    if (!confirm(`${action} işlemini onaylıyor musunuz?`)) return;
    try {
      const { supabase } = await import("@/lib/supabase-client");
      const { data: { session } } = await supabase.auth.getSession();
      
      const res = await fetch(`/api/admin/moderation/action`, {
        method: "POST",
        headers: { 
          Authorization: `Bearer ${session?.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ reportId, targetType, targetId, action, reason: 'Admin panel aksiyonu' })
      });

      if (res.ok) {
        fetchCommunityReports();
      } else {
        alert("Hata oluştu");
      }
    } catch (err) {
      alert("Sunucu hatası");
    }
  };


  const updateObjectionStatus = async (id: string, status: string) => {
    try {
      const res = await fetch("/api/admin/business-objections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status })
      });
      const data = await res.json();
      if (data.success) {
        fetchObjections();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const updateKvkkStatus = async (id: string, status: string) => {
    try {
      const res = await fetch("/api/admin/kvkk-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status })
      });
      const data = await res.json();
      if (data.success) {
        fetchKvkkRequests();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <main className="l2t-page">
      <div className="l2t-wrap" style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '32px' }}>
        
        {/* Sidebar */}
        <div className="l2t-card" style={{ padding: '24px', height: 'max-content' }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '24px', color: 'var(--l2t-ink)' }}>Moderasyon ve Hukuk</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button 
              onClick={() => setActiveTab("verifications")}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: activeTab === 'verifications' ? 'rgba(245,184,27,0.1)' : 'transparent', color: activeTab === 'verifications' ? 'var(--l2t-gold)' : 'var(--l2t-soft)', border: 'none', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: activeTab === 'verifications' ? 600 : 400 }}
            >
              <ShieldCheck size={18} /> Doğrulama Talepleri
            </button>
            <button 
              onClick={() => setActiveTab("comments")}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: activeTab === 'comments' ? 'rgba(245,184,27,0.1)' : 'transparent', color: activeTab === 'comments' ? 'var(--l2t-gold)' : 'var(--l2t-soft)', border: 'none', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: activeTab === 'comments' ? 600 : 400 }}
            >
              <Flag size={18} /> Yorum Moderasyonu
            </button>
            <button 
              onClick={() => setActiveTab("disputes")}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: activeTab === 'disputes' ? 'rgba(245,184,27,0.1)' : 'transparent', color: activeTab === 'disputes' ? 'var(--l2t-gold)' : 'var(--l2t-soft)', border: 'none', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: activeTab === 'disputes' ? 600 : 400 }}
            >
              <Scale size={18} /> İşletme İtirazları
            </button>
            <button 
              onClick={() => setActiveTab("kvkk")}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: activeTab === 'kvkk' ? 'rgba(245,184,27,0.1)' : 'transparent', color: activeTab === 'kvkk' ? 'var(--l2t-gold)' : 'var(--l2t-soft)', border: 'none', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: activeTab === 'kvkk' ? 600 : 400 }}
            >
              <FileText size={18} /> KVKK Talepleri
            </button>
            <button 
              onClick={() => setActiveTab("risky_content")}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: activeTab === 'risky_content' ? 'rgba(245,184,27,0.1)' : 'transparent', color: activeTab === 'risky_content' ? 'var(--l2t-gold)' : 'var(--l2t-soft)', border: 'none', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: activeTab === 'risky_content' ? 600 : 400 }}
            >
              <AlertTriangle size={18} /> Riskli İçerikler
            </button>
            <button 
              onClick={() => setActiveTab("community_reports")}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: activeTab === 'community_reports' ? 'rgba(245,184,27,0.1)' : 'transparent', color: activeTab === 'community_reports' ? 'var(--l2t-gold)' : 'var(--l2t-soft)', border: 'none', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: activeTab === 'community_reports' ? 600 : 400 }}
            >
              <Flag size={18} /> Topluluk Şikayetleri
            </button>
          </div>
        </div>

        {/* Content */}
        <div>
          {activeTab === "verifications" && (
            <div className="l2t-card" style={{ padding: '32px' }}>
              <h2 style={{ margin: '0 0 24px', display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--l2t-ink)' }}><ShieldCheck color="var(--l2t-gold)" /> Doğrulama Talepleri (Manuel & AI)</h2>
              <div style={{ padding: '16px', border: '1px solid var(--l2t-border)', borderRadius: '12px', background: 'rgba(10,25,48,0.5)', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div>
                    <h4 style={{ margin: '0 0 4px', color: 'var(--l2t-ink)' }}>TR - İstanbul (Otel Rezervasyonu)</h4>
                    <span style={{ fontSize: '0.85rem', color: 'var(--l2t-muted)' }}>Kullanıcı: ahmet_gezgin | Tarih: 12 Eki 2026</span>
                  </div>
                  <span style={{ padding: '4px 8px', background: 'rgba(234,179,8,0.1)', color: '#eab308', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>Bekliyor</span>
                </div>
                <p style={{ fontSize: '0.9rem', color: 'var(--l2t-soft)', marginBottom: '16px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                  <em>Not: KVKK gereği kullanıcı hassas verilerini gizleyerek belge yükledi. Orijinal belge inceleme sonrası sunucudan kalıcı olarak silinecektir.</em>
                </p>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button className="l2t-btn l2t-btn-small" style={{ background: '#10b981', color: '#fff' }}><CheckCircle size={16} /> Onayla & Belgeyi Sil</button>
                  <button className="l2t-btn l2t-btn-small l2t-btn-ghost" style={{ borderColor: '#ef4444', color: '#ef4444' }}><XCircle size={16} /> Reddet & Belgeyi Sil</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "comments" && (
            <div className="l2t-card" style={{ padding: '32px' }}>
              <h2 style={{ margin: '0 0 24px', display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--l2t-ink)' }}><Flag color="var(--l2t-gold)" /> Suçlayıcı İfade & Şikayetler</h2>
              <div style={{ padding: '16px', border: '1px solid #ef4444', borderRadius: '12px', background: 'rgba(239,68,68,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', marginBottom: '12px' }}>
                  <AlertTriangle size={18} />
                  <strong>Sistem Filtresine Takıldı</strong>
                </div>
                <p style={{ margin: '0 0 16px', color: 'var(--l2t-ink)', lineHeight: 1.6 }}>
                  "Bu döviz bürosunda fiyatları kontrol edin, dikkatli olunması önerilir."
                </p>
                <p style={{ fontSize: '0.85rem', color: 'var(--l2t-soft)', marginBottom: '16px' }}>Kullanıcı: ayse_yolcu | Hedef: Kapalıçarşı Grand Exchange</p>
                
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button className="l2t-btn l2t-btn-small" style={{ background: '#ef4444', color: '#fff' }}><UserX size={16} /> Yayından Kaldır & Uyar</button>
                  <button className="l2t-btn l2t-btn-small l2t-btn-ghost">Düzenleme İste</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "disputes" && (
            <div className="l2t-card" style={{ padding: '32px' }}>
              <h2 style={{ margin: '0 0 24px', display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--l2t-ink)' }}><Scale color="var(--l2t-gold)" /> İşletme / Kurum İtirazları</h2>
              
              <div style={{ marginBottom: '32px', padding: '24px', border: '1px solid var(--l2t-border)', borderRadius: '12px', background: 'rgba(10,25,48,0.3)' }}>
                <h3 style={{ margin: '0 0 16px', color: 'var(--l2t-ink)' }}>Yeni İtiraz Talebi Ekle</h3>
                <form className="l2t-admin-form" onSubmit={(e) => { e.preventDefault(); alert("İtiraz başarıyla kaydedildi."); }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <input type="text" placeholder="İşletme Adı" required style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(10,25,48,0.5)', border: '1px solid var(--l2t-border)', color: '#fff' }} />
                    <input type="text" placeholder="Yetkili Kişi Adı" required style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(10,25,48,0.5)', border: '1px solid var(--l2t-border)', color: '#fff' }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <input type="email" placeholder="E-posta Adresi" required style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(10,25,48,0.5)', border: '1px solid var(--l2t-border)', color: '#fff' }} />
                    <select required style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(10,25,48,0.5)', border: '1px solid var(--l2t-border)', color: '#fff' }}>
                      <option value="">Talep Türü Seçin</option>
                      <option value="kaldırma">İçerik Kaldırma</option>
                      <option value="duzeltme">Bilgi Düzeltme</option>
                      <option value="cevap">Cevap Hakkı</option>
                      <option value="marka">Marka/İsim Hakkı İtirazı</option>
                    </select>
                  </div>
                  <textarea placeholder="İtiraz Edilen İçerik ve Sebep" required rows={4} style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(10,25,48,0.5)', border: '1px solid var(--l2t-border)', color: '#fff', marginBottom: '16px' }}></textarea>
                  <button type="submit" className="l2t-btn l2t-btn-small">Talebi Kaydet</button>
                </form>
              </div>

              {loading ? (
                <p style={{ color: "var(--l2t-soft)" }}>Yükleniyor...</p>
              ) : objections.length === 0 ? (
                <p style={{ color: "var(--l2t-soft)" }}>Henüz işletme itirazı bulunmuyor.</p>
              ) : (
                objections.map(objection => (
                  <div key={objection.id} style={{ padding: '16px', border: '1px solid var(--l2t-border)', borderRadius: '12px', background: 'rgba(10,25,48,0.5)', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <h4 style={{ margin: '0', color: 'var(--l2t-ink)' }}>{objection.business_name}</h4>
                      <span style={{ fontSize: '0.85rem', color: objection.status === 'pending' ? '#eab308' : objection.status === 'resolved' ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                        Durum: {objection.status}
                      </span>
                    </div>
                    <p style={{ margin: '0 0 16px', fontSize: '0.9rem', color: 'var(--l2t-soft)' }}>
                      <strong>Yetkili Kişi:</strong> {objection.authorized_person} <br/>
                      <strong>E-posta:</strong> {objection.email} <br/>
                      <strong>Talep Türü:</strong> {objection.objection_type} <br/>
                      <strong>Bağlantı:</strong> <a href={objection.content_url} target="_blank" style={{color: 'var(--l2t-gold)'}}>{objection.content_url}</a> <br/>
                      <strong>Açıklama:</strong> {objection.description} <br/>
                      <strong>Tarih:</strong> {new Date(objection.created_at).toLocaleString('tr-TR')}
                    </p>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <select 
                        value={objection.status}
                        onChange={(e) => updateObjectionStatus(objection.id, e.target.value)}
                        style={{ padding: '8px', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid var(--l2t-border)' }}
                      >
                        <option value="pending" style={{color: '#000'}}>Bekliyor (pending)</option>
                        <option value="reviewing" style={{color: '#000'}}>İnceleniyor (reviewing)</option>
                        <option value="resolved" style={{color: '#000'}}>Çözüldü (resolved)</option>
                        <option value="rejected" style={{color: '#000'}}>Reddedildi (rejected)</option>
                      </select>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "kvkk" && (
            <div className="l2t-card" style={{ padding: '32px' }}>
              <h2 style={{ margin: '0 0 24px', display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--l2t-ink)' }}><FileText color="var(--l2t-gold)" /> Veri Silme & Hak Talepleri (KVKK)</h2>
              {loading ? (
                <p style={{ color: "var(--l2t-soft)" }}>Yükleniyor...</p>
              ) : kvkkRequests.length === 0 ? (
                <p style={{ color: "var(--l2t-soft)" }}>Henüz KVKK talebi bulunmuyor.</p>
              ) : (
                kvkkRequests.map(req => (
                  <div key={req.id} style={{ padding: '16px', border: '1px solid var(--l2t-border)', borderRadius: '12px', background: 'rgba(10,25,48,0.5)', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <h4 style={{ margin: 0, color: 'var(--l2t-ink)' }}>{req.request_type}</h4>
                      <span style={{ fontSize: '0.85rem', color: req.status === 'pending' ? '#eab308' : req.status === 'resolved' ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                        Durum: {req.status}
                      </span>
                    </div>
                    <p style={{ margin: '0 0 16px', fontSize: '0.9rem', color: 'var(--l2t-soft)', whiteSpace: 'pre-wrap' }}>
                      <strong>Kullanıcı ID:</strong> {req.user_id} <br/>
                      {req.notes} <br/>
                      <strong>Tarih:</strong> {new Date(req.created_at).toLocaleString('tr-TR')}
                    </p>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <select 
                        value={req.status}
                        onChange={(e) => updateKvkkStatus(req.id, e.target.value)}
                        style={{ padding: '8px', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid var(--l2t-border)' }}
                      >
                        <option value="pending" style={{color: '#000'}}>Bekliyor (pending)</option>
                        <option value="reviewing" style={{color: '#000'}}>İnceleniyor (reviewing)</option>
                        <option value="resolved" style={{color: '#000'}}>Çözüldü (resolved)</option>
                        <option value="rejected" style={{color: '#000'}}>Reddedildi (rejected)</option>
                      </select>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          {activeTab === "risky_content" && (
            <div className="l2t-card" style={{ padding: '32px' }}>
              <h2 style={{ margin: '0 0 24px', display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--l2t-ink)' }}><AlertTriangle color="var(--l2t-gold)" /> Riskli İçerikler</h2>
              <div style={{ padding: '16px', border: '1px solid var(--l2t-border)', borderRadius: '12px', background: 'rgba(10,25,48,0.5)' }}>
                <p style={{ margin: '0 0 16px', fontSize: '0.9rem', color: 'var(--l2t-soft)' }}>
                  Sistem otomatik olarak moderasyon sürecine aldığı riskli içerikleri burada listeler. Şu an bekleyen riskli içerik bulunmuyor.
                </p>
              </div>
            </div>
          )}

          {activeTab === "community_reports" && (
            <div className="l2t-card" style={{ padding: '32px' }}>
              <h2 style={{ margin: '0 0 24px', display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--l2t-ink)' }}><Flag color="var(--l2t-gold)" /> Topluluk Şikayetleri</h2>
              
              {loading ? (
                <p style={{ color: "var(--l2t-soft)" }}>Yükleniyor...</p>
              ) : communityReports.length === 0 ? (
                <p style={{ color: "var(--l2t-soft)" }}>Açık şikayet/rapor bulunmuyor.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {communityReports.map(r => (
                    <div key={r.id} style={{ padding: '16px', border: '1px solid var(--l2t-border)', borderRadius: '12px', background: 'rgba(10,25,48,0.5)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                        <div>
                          <span style={{ padding: '4px 8px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600, marginRight: '8px', textTransform: 'uppercase' }}>{r.target_type}</span>
                          <span style={{ fontSize: '0.85rem', color: 'var(--l2t-muted)' }}>Ülke: {r.country_code || '-'}</span>
                        </div>
                        <span style={{ fontSize: '0.85rem', color: 'var(--l2t-muted)' }}>{new Date(r.created_at).toLocaleString('tr-TR')}</span>
                      </div>
                      
                      <div style={{ marginBottom: '16px' }}>
                        <strong style={{ color: '#ef4444', display: 'block', marginBottom: '4px' }}>Şikayet Sebebi:</strong>
                        <p style={{ margin: 0, padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '0.9rem', color: 'var(--l2t-ink)' }}>{r.reason}</p>
                        {r.note && <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: 'var(--l2t-soft)' }}>Ek Not: {r.note}</p>}
                      </div>

                      <div style={{ fontSize: '0.8rem', color: 'var(--l2t-muted)', marginBottom: '16px' }}>Hedef ID: {r.target_id}</div>

                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <button onClick={() => handleModerationAction(r.id, r.target_type, r.target_id, 'hide')} className="l2t-btn l2t-btn-small" style={{ background: '#f97316', color: '#fff' }}>Gizle</button>
                        <button onClick={() => handleModerationAction(r.id, r.target_type, r.target_id, 'remove')} className="l2t-btn l2t-btn-small" style={{ background: '#ef4444', color: '#fff' }}>Sil</button>
                        <button onClick={() => handleModerationAction(r.id, r.target_type, r.target_id, 'approve')} className="l2t-btn l2t-btn-small" style={{ background: '#10b981', color: '#fff' }}>Zararsız (Onayla)</button>
                        <button onClick={() => handleModerationAction(r.id, r.target_type, r.target_id, 'close')} className="l2t-btn l2t-btn-small l2t-btn-ghost" style={{ marginLeft: 'auto' }}>Raporu Kapat</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
