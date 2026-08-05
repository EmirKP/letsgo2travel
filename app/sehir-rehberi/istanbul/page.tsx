"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Map, MapPin, AlertCircle, Euro, MessageSquare } from "lucide-react";

const REGIONS = ["Sultanahmet", "Eminönü", "Kapalıçarşı", "Taksim", "Karaköy", "Kadıköy", "Bağdat Caddesi", "Beşiktaş", "Üsküdar", "Balat"];

const POI_DATA = [
  { id: 1, region: "Sultanahmet", name: "Ayasofya", category: "Tarihi", flag: "recommended" },
  { id: 2, region: "Kapalıçarşı", name: "Döviz büroları", category: "Döviz", flag: "check_prices", note: "İşlem yapmadan önce alış ve satış kurunu, komisyonu ve alacağınız toplam tutarı birkaç noktada karşılaştırın." },
  { id: 3, region: "Taksim", name: "Restoran seçimi", category: "Restoran", flag: "warning", note: "Sipariş vermeden önce güncel menüyü, servis ücretini ve toplam fiyatı kontrol edin." },
];

export default function IstanbulGuidePage() {
  const [selectedRegion, setSelectedRegion] = useState("Sultanahmet");
  const [selectedCategory, setSelectedCategory] = useState("Tümü");

  const filteredPOIs = POI_DATA.filter(poi => 
    poi.region === selectedRegion && 
    (selectedCategory === "Tümü" || poi.category === selectedCategory)
  );

  return (
    <div className="l2t-page">
      <div className="l2t-wrap">
        <div style={{ textAlign: 'center', padding: '60px 0', background: 'linear-gradient(180deg, var(--l2t-navy), var(--l2t-page-bg))', borderRadius: '16px', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '3rem', color: '#fff', margin: '0 0 16px' }}>İstanbul Şehir Rehberi</h1>
          <p className="l2t-muted" style={{ fontSize: '1.2rem', maxWidth: '600px', margin: '0 auto' }}>
            Bölge ve kategori seçerek editoryal gezi notlarını inceleyin. Karar vermeden önce güncel fiyat ve koşulları yerinde doğrulayın.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: '32px' }}>
          {/* Sol Menü - Manuel Seçim (GPS YOK) */}
          <div className="l2t-card" style={{ padding: '24px', alignSelf: 'start', position: 'sticky', top: '100px' }}>
            <h3 style={{ margin: '0 0 16px', color: 'var(--l2t-ink)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Map size={20} color="var(--l2t-gold)" /> Bölgeler
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--l2t-soft)', marginBottom: '16px', lineHeight: 1.5 }}>
              Harita ve GPS izni istemiyoruz. Lütfen incelemek istediğiniz bölgeyi seçin.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {REGIONS.map(region => (
                <button
                  key={region}
                  onClick={() => setSelectedRegion(region)}
                  style={{
                    padding: '10px 16px',
                    textAlign: 'left',
                    background: selectedRegion === region ? 'rgba(245, 184, 27, 0.15)' : 'transparent',
                    color: selectedRegion === region ? 'var(--l2t-gold)' : 'var(--l2t-soft)',
                    border: '1px solid',
                    borderColor: selectedRegion === region ? 'var(--l2t-gold)' : 'var(--l2t-border)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: selectedRegion === region ? 700 : 500,
                    transition: 'all 0.2s'
                  }}
                >
                  {region}
                </button>
              ))}
            </div>
          </div>

          {/* İçerik Alanı */}
          <div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', overflowX: 'auto', paddingBottom: '8px' }}>
              {["Tümü", "Tarihi", "Döviz", "Restoran", "Alışveriş"].map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    padding: '8px 16px',
                    background: selectedCategory === cat ? 'var(--l2t-gold)' : 'rgba(10, 25, 48, 0.5)',
                    color: selectedCategory === cat ? 'var(--l2t-navy)' : 'var(--l2t-soft)',
                    border: '1px solid var(--l2t-border)',
                    borderRadius: '99px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    whiteSpace: 'nowrap'
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '1.8rem', color: 'var(--l2t-ink)', margin: '0 0 24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <MapPin color="var(--l2t-gold)" /> {selectedRegion}
              </h2>

              {filteredPOIs.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', border: '1px dashed var(--l2t-border)', borderRadius: '12px', color: 'var(--l2t-soft)' }}>
                  Bu bölge/kategori için henüz eklenmiş bir nokta bulunmuyor.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {filteredPOIs.map(poi => (
                    <div key={poi.id} className="l2t-card" style={{ padding: '20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                        <div>
                          <h3 style={{ margin: '0 0 4px', color: 'var(--l2t-ink)', fontSize: '1.2rem' }}>{poi.name}</h3>
                          <span style={{ fontSize: '0.85rem', color: 'var(--l2t-muted)' }}>{poi.category}</span>
                        </div>
                        {poi.flag === 'warning' && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '6px 12px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 700 }}>
                            <AlertCircle size={14} /> Dikkatli olun
                          </span>
                        )}
                        {poi.flag === 'check_prices' && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(245,184,27,0.1)', color: 'var(--l2t-gold)', padding: '6px 12px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 700 }}>
                            <Euro size={14} /> Fiyatları Kontrol Edin
                          </span>
                        )}
                      </div>
                      
                      {poi.note && (
                        <p style={{ margin: '0 0 16px', color: 'var(--l2t-soft)', lineHeight: 1.5, fontSize: '0.95rem' }}>
                          {poi.note}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <section className="l2t-card" style={{ padding: '24px', marginTop: '32px' }} aria-labelledby="istanbul-community-title">
              <h3 id="istanbul-community-title" style={{ fontSize: '1.4rem', color: 'var(--l2t-ink)', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <MessageSquare size={22} color="var(--l2t-blue)" /> Topluluk deneyimleri
              </h3>
              <p style={{ color: 'var(--l2t-soft)', lineHeight: 1.6, margin: '0 0 20px' }}>
                Bu şehir rehberinde doğrulanmış yorum akışı henüz aktif değil. Gerçek bir deneyim paylaşmak veya {selectedRegion} hakkında soru sormak için forumu kullanabilirsiniz.
              </p>
              <Link href={`/forum/yeni?title=${encodeURIComponent(`${selectedRegion} hakkında deneyim paylaşmak istiyorum`)}`} className="l2t-btn" style={{ display: 'inline-flex', textDecoration: 'none' }}>
                Forumda konu aç
              </Link>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}
