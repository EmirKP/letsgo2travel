"use client";

import React, { useState } from "react";
import { Map, MapPin, Search, AlertCircle, Info, Landmark, Coffee, ShoppingBag, Euro } from "lucide-react";
import ReviewCard, { ReviewType } from "@/components/ReviewCard";
import CommentForm from "@/components/CommentForm";

const REGIONS = ["Sultanahmet", "Eminönü", "Kapalıçarşı", "Taksim", "Karaköy", "Kadıköy", "Bağdat Caddesi", "Beşiktaş", "Üsküdar", "Balat"];

const POI_DATA = [
  { id: 1, region: "Sultanahmet", name: "Ayasofya", category: "Tarihi", flag: "recommended" },
  { id: 2, region: "Kapalıçarşı", name: "Grand Bazaar Exchange", category: "Döviz", flag: "check_prices", note: "Bazı kullanıcılar havalimanına göre daha iyi kur aldığını belirtmiştir. İşlem yapmadan önce güncel kuru sormanız önerilir." },
  { id: 3, region: "Taksim", name: "İstiklal Restoran", category: "Restoran", flag: "warning", note: "Fiyatlar menüde yazandan farklı olabilir. Sipariş vermeden önce fiyatları teyit etmeniz önerilir." },
];

export default function IstanbulGuidePage() {
  const [selectedRegion, setSelectedRegion] = useState("Sultanahmet");
  const [selectedCategory, setSelectedCategory] = useState("Tümü");

  const filteredPOIs = POI_DATA.filter(poi => 
    poi.region === selectedRegion && 
    (selectedCategory === "Tümü" || poi.category === selectedCategory)
  );

  const handleCommentSubmit = async (content: string) => {
    // Simüle edilmiş yorum gönderimi
    console.log("Gönderilen yorum:", content);
    await new Promise(resolve => setTimeout(resolve, 1000));
    alert("Yorumunuz başarıyla gönderildi ve moderasyon sırasına alındı.");
  };

  return (
    <main className="l2t-page">
      <div className="l2t-wrap">
        <div style={{ textAlign: 'center', padding: '60px 0', background: 'linear-gradient(180deg, var(--l2t-navy), var(--l2t-page-bg))', borderRadius: '16px', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '3rem', color: '#fff', margin: '0 0 16px' }}>İstanbul Şehir Rehberi</h1>
          <p className="l2t-muted" style={{ fontSize: '1.2rem', maxWidth: '600px', margin: '0 auto' }}>
            Topluluğumuzun doğrulanmış deneyimleriyle keşfedin. Güvenli ve şeffaf rotaları tercih edin.
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

            {/* Yorumlar ve Deneyimler */}
            <h3 style={{ fontSize: '1.4rem', color: 'var(--l2t-ink)', margin: '0 0 16px' }}>Topluluk Deneyimleri</h3>
            <ReviewCard
              type="official"
              authorName="LetsGo2Travel"
              date="Sürekli Güncel"
              content={`${selectedRegion} bölgesi özellikle turistlerin yoğun bulunduğu bir alandır. Kalabalık saatlerde kişisel eşyalarınıza dikkat etmeniz önerilir.`}
            />
            <ReviewCard
              type="verified"
              authorName="Ahmet Y."
              date="2 gün önce"
              content="Kapalıçarşı döviz bürolarında havalimanına kıyasla çok daha iyi oranlar buldum. Ancak tabelada yazan rakamla işlem sırasında verilen kur bazen değişebiliyor. 'Şu anki kur nedir?' diye teyit etmeden paranızı uzatmayın."
            />
            <ReviewCard
              type="community"
              authorName="Sarah M."
              date="1 hafta önce"
              content="Taksim'de girdiğim bir restoranda menüde fiyatlar yazmıyordu. Hesap geldiğinde beklediğimin çok üzerinde bir tutar gördüm. Benim tavsiyem, sipariş öncesi fiyatı sormanız."
              isFlagged={true}
            />

            <CommentForm onSubmit={handleCommentSubmit} placeholder={`${selectedRegion} hakkındaki deneyimlerinizi paylaşın...`} />

          </div>
        </div>
      </div>
    </main>
  );
}
