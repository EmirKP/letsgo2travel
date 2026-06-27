"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { CheckCircle, ShieldAlert, UploadCloud, X, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function DogrulamaPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [file, setFile] = useState<File | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [countryCode, setCountryCode] = useState("");
  const [citySlug, setCitySlug] = useState("");
  const [verificationType, setVerificationType] = useState("flight_ticket");
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [rects, setRects] = useState<{x: number, y: number, w: number, h: number}[]>([]);
  const [currentRect, setCurrentRect] = useState<{x: number, y: number, w: number, h: number} | null>(null);
  const [startPos, setStartPos] = useState<{x: number, y: number} | null>(null);

  const [aydinlatmaAccepted, setAydinlatmaAccepted] = useState(false);
  const [acikRizaAccepted, setAcikRizaAccepted] = useState(false);
  const [sorumlulukAccepted, setSorumlulukAccepted] = useState(false);
  const [kullanimSartlariAccepted, setKullanimSartlariAccepted] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const isBetaEnabled = process.env.NEXT_PUBLIC_ENABLE_BETA_FEATURES === 'true';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      setRects([]);
      const reader = new FileReader();
      reader.onload = (event) => {
        setImageSrc(event.target?.result as string);
      };
      reader.readAsDataURL(selected);
    }
  };

  useEffect(() => {
    if (imageSrc && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        
        // Draw saved rects
        ctx.fillStyle = "black";
        rects.forEach(r => {
          ctx.fillRect(r.x, r.y, r.w, r.h);
        });

        // Draw current rect
        if (currentRect) {
          ctx.fillRect(currentRect.x, currentRect.y, currentRect.w, currentRect.h);
        }
      };
      img.src = imageSrc;
    }
  }, [imageSrc, rects, currentRect]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    
    // Calculate scale factor (canvas might be styled smaller than its actual resolution)
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    setIsDrawing(true);
    setStartPos({ x, y });
    setCurrentRect({ x, y, w: 0, h: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPos || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;

    const currentX = (e.clientX - rect.left) * scaleX;
    const currentY = (e.clientY - rect.top) * scaleY;
    
    setCurrentRect({
      x: Math.min(startPos.x, currentX),
      y: Math.min(startPos.y, currentY),
      w: Math.abs(currentX - startPos.x),
      h: Math.abs(currentY - startPos.y)
    });
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
    if (currentRect && currentRect.w > 5 && currentRect.h > 5) {
      setRects([...rects, currentRect]);
    }
    setCurrentRect(null);
  };

  const resetCanvas = () => {
    setRects([]);
    setCurrentRect(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aydinlatmaAccepted || !acikRizaAccepted || !sorumlulukAccepted || !kullanimSartlariAccepted) {
      setError("Lütfen tüm onay kutularını işaretleyin.");
      return;
    }
    if (!canvasRef.current || !countryCode || !verificationType) {
      setError("Lütfen gerekli tüm alanları doldurun ve belge yükleyin.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      // Get black-boxed image as base64
      const finalImageBase64 = canvasRef.current.toDataURL("image/jpeg", 0.8);

      const res = await fetch("/api/verify-travel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countryCode,
          citySlug,
          verificationType,
          image: finalImageBase64,
          aydinlatma_metni_okundu: aydinlatmaAccepted,
          acik_riza_verildi: acikRizaAccepted,
          kullanici_sorumlulugu_kabul: sorumlulukAccepted,
          kullanim_sartlari_topluluk_kurallari_kabul: kullanimSartlariAccepted
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bir hata oluştu");

      setSuccess(true);
      setTimeout(() => {
        router.push("/profil");
      }, 3000);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isBetaEnabled) {
    return (
      <main className="l2t-page" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="l2t-wrap" style={{ textAlign: 'center', maxWidth: '600px' }}>
          <h1 style={{ color: 'var(--l2t-gold)', marginBottom: '16px' }}>Bu Özellik Kapalı Beta Aşamasındadır</h1>
          <p style={{ color: 'var(--l2t-soft)', lineHeight: 1.6, fontSize: '1.1rem' }}>
            Topluluk yorum ve belge doğrulama sistemimiz şu an hukuki inceleme aşamasındadır. Yasal metinlerimiz (KVKK, Gizlilik vb.) avukatlarımız tarafından onaylandıktan sonra bu özellik genel erişime açılacaktır. Anlayışınız için teşekkür ederiz.
          </p>
        </div>
      </main>
    );
  }

  if (success) {
    return (
      <main className="l2t-page">
        <div className="l2t-wrap" style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          <div className="l2t-card" style={{ padding: '40px' }}>
            <CheckCircle size={64} color="#F5B81B" style={{ margin: '0 auto 24px' }} />
            <h1 style={{ fontSize: '2rem', marginBottom: '16px' }}>Talebiniz Alındı</h1>
            <p className="l2t-muted">
              Doğrulama belgeniz başarıyla iletilmiş ve güvenlik amacıyla <strong>sunucularımızda saklanmadan silinmiştir</strong>. 
              Moderatörlerimiz en kısa sürede kaydınızı inceleyecektir.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="l2t-page">
      <div className="l2t-wrap" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ marginBottom: '24px' }}>
          <Link href="/profil" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--l2t-soft)' }}>
            <ArrowLeft size={16} /> Profile Dön
          </Link>
        </div>

        <div className="l2t-card" style={{ padding: '32px' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Doğrulanmış Gezgin Başvurusu</h1>
          <p className="l2t-muted" style={{ marginBottom: '32px' }}>
            Topluluğumuza güvenilir deneyimler sunmak için seyahat geçmişinizi doğrulayın.
          </p>

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: 'var(--l2t-ink)' }}>Ülke Kodu (Örn: TR, FR)</label>
                <input 
                  type="text" 
                  className="l2t-admin-form"
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(10,25,48,0.5)', border: '1px solid var(--l2t-border)', color: '#fff' }}
                  value={countryCode} 
                  onChange={e => setCountryCode(e.target.value)} 
                  maxLength={2}
                  required 
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: 'var(--l2t-ink)' }}>Şehir (Opsiyonel)</label>
                <input 
                  type="text" 
                  className="l2t-admin-form"
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(10,25,48,0.5)', border: '1px solid var(--l2t-border)', color: '#fff' }}
                  value={citySlug} 
                  onChange={e => setCitySlug(e.target.value)} 
                />
              </div>
            </div>

            <div style={{ marginBottom: '32px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: 'var(--l2t-ink)' }}>Belge Türü</label>
              <select 
                style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(10,25,48,0.5)', border: '1px solid var(--l2t-border)', color: '#fff' }}
                value={verificationType}
                onChange={e => setVerificationType(e.target.value)}
              >
                <option value="flight_ticket">Uçak Bileti / Biniş Kartı</option>
                <option value="hotel_reservation">Otel Rezervasyonu</option>
                <option value="museum_ticket">Müze / Etkinlik Bileti</option>
                <option value="train_ticket">Tren / Otobüs Bileti</option>
              </select>
            </div>

            <div style={{ marginBottom: '32px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '16px', background: 'rgba(245, 184, 27, 0.1)', borderRadius: '8px', border: '1px solid rgba(245, 184, 27, 0.2)' }}>
                <ShieldAlert color="var(--l2t-gold)" size={24} style={{ flexShrink: 0 }} />
                <div>
                  <h4 style={{ margin: '0 0 4px', color: 'var(--l2t-gold)' }}>Hassas Verileri Gizleyin</h4>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--l2t-soft)', lineHeight: 1.5 }}>
                    Lütfen doğrulama için gerekli olmayan kişisel bilgileri kapatın. Pasaport numarası, T.C. kimlik numarası, PNR kodu, QR kod, barkod, açık adres ve ödeme bilgilerini aşağıdaki <strong>siyah kutu aracıyla</strong> gizleyerek yükleyin.
                  </p>
                </div>
              </div>
            </div>

            {!imageSrc ? (
              <div style={{ border: '2px dashed var(--l2t-border)', borderRadius: '12px', padding: '48px 24px', textAlign: 'center', marginBottom: '32px', cursor: 'pointer' }} onClick={() => document.getElementById('file-upload')?.click()}>
                <UploadCloud size={48} color="var(--l2t-soft)" style={{ margin: '0 auto 16px' }} />
                <h3 style={{ margin: '0 0 8px', color: 'var(--l2t-ink)' }}>Belge Yükle</h3>
                <p style={{ margin: 0, color: 'var(--l2t-muted)', fontSize: '0.9rem' }}>JPEG, PNG veya WebP formatında dosya seçin</p>
                <input type="file" id="file-upload" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
              </div>
            ) : (
              <div style={{ marginBottom: '32px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '0.9rem', color: 'var(--l2t-muted)' }}>Gizlemek istediğiniz alanın üzerine farenizle çizim yapın.</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="button" onClick={resetCanvas} style={{ padding: '6px 12px', background: 'transparent', border: '1px solid var(--l2t-border)', color: 'var(--l2t-soft)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>Temizle</button>
                    <button type="button" onClick={() => setImageSrc(null)} style={{ padding: '6px 12px', background: 'transparent', border: '1px solid var(--l2t-border)', color: '#ef4444', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>Yeni Belge</button>
                  </div>
                </div>
                <div style={{ border: '1px solid var(--l2t-border)', borderRadius: '8px', overflow: 'hidden', background: '#000' }}>
                  <canvas 
                    ref={canvasRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    style={{ display: 'block', maxWidth: '100%', height: 'auto', maxHeight: '500px', margin: '0 auto', cursor: 'crosshair' }}
                  />
                </div>
              </div>
            )}

            {/* KVKK ve Onaylar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px', padding: '24px', background: 'rgba(10, 25, 48, 0.4)', borderRadius: '12px', border: '1px solid var(--l2t-border)' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer' }}>
                <input type="checkbox" checked={aydinlatmaAccepted} onChange={e => setAydinlatmaAccepted(e.target.checked)} style={{ marginTop: '4px', width: '20px', height: '20px' }} />
                <span style={{ fontSize: '0.95rem', color: 'var(--l2t-soft)', lineHeight: 1.5 }}>
                  <Link href="/kvkk-aydinlatma-metni" target="_blank" style={{color: 'var(--l2t-gold)', textDecoration: 'underline'}}>KVKK Aydınlatma Metni</Link>'ni okudum.
                </span>
              </label>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer' }}>
                <input type="checkbox" checked={acikRizaAccepted} onChange={e => setAcikRizaAccepted(e.target.checked)} style={{ marginTop: '4px', width: '20px', height: '20px' }} />
                <span style={{ fontSize: '0.95rem', color: 'var(--l2t-soft)', lineHeight: 1.5 }}>
                  <Link href="/acik-riza-metni" target="_blank" style={{color: 'var(--l2t-gold)', textDecoration: 'underline'}}>Açık Rıza Metni</Link> kapsamında doğrulama belgemin geçici olarak işlenmesine açık rıza veriyorum.
                </span>
              </label>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer' }}>
                <input type="checkbox" checked={sorumlulukAccepted} onChange={e => setSorumlulukAccepted(e.target.checked)} style={{ marginTop: '4px', width: '20px', height: '20px' }} />
                <span style={{ fontSize: '0.95rem', color: 'var(--l2t-soft)', lineHeight: 1.5 }}>
                  Paylaştığım içerik ve belgelerden kendimin sorumlu olduğunu kabul ediyorum.
                </span>
              </label>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer' }}>
                <input type="checkbox" checked={kullanimSartlariAccepted} onChange={e => setKullanimSartlariAccepted(e.target.checked)} style={{ marginTop: '4px', width: '20px', height: '20px' }} />
                <span style={{ fontSize: '0.95rem', color: 'var(--l2t-soft)', lineHeight: 1.5 }}>
                  <Link href="/kullanim-sartlari" target="_blank" style={{color: 'var(--l2t-gold)', textDecoration: 'underline'}}>Kullanım Şartları</Link> ve <Link href="/topluluk-kurallari" target="_blank" style={{color: 'var(--l2t-gold)', textDecoration: 'underline'}}>Topluluk Kuralları</Link>'nı kabul ediyorum.
                </span>
              </label>
            </div>

            {error && <div style={{ color: '#ef4444', marginBottom: '16px', fontSize: '0.95rem' }}>{error}</div>}

            <button type="submit" className="l2t-btn l2t-btn-wide" disabled={isSubmitting || !aydinlatmaAccepted || !acikRizaAccepted || !sorumlulukAccepted || !kullanimSartlariAccepted || !imageSrc}>
              {isSubmitting ? "İşleniyor..." : "Doğrulamayı Gönder"}
            </button>
          </form>

        </div>
      </div>
    </main>
  );
}
