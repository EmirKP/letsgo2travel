'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function BusinessObjectionPage() {
  const [formData, setFormData] = useState({
    businessName: '',
    authorizedPerson: '',
    email: '',
    phone: '',
    contentUrl: '',
    objectionType: 'Bilgi düzeltme',
    description: '',
    confirmed: false
  });
  
  const [status, setStatus] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    if (!formData.confirmed) {
      setStatus({ type: 'error', message: 'Lütfen yetkili kişi onay kutusunu işaretleyiniz.' });
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/business-objections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Bir hata oluştu.');
      }

      setStatus({ type: 'success', message: data.message });
      setFormData({
        businessName: '',
        authorizedPerson: '',
        email: '',
        phone: '',
        contentUrl: '',
        objectionType: 'Bilgi düzeltme',
        description: '',
        confirmed: false
      });
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  return (
    <main className="l2t-page">
      <div className="l2t-wrap" style={{ maxWidth: '600px', margin: '0 auto', padding: '40px 20px' }}>
        <h1 style={{ color: 'var(--l2t-gold)', marginBottom: '16px', fontSize: '2.2rem', textAlign: 'center' }}>
          İşletme İtiraz ve Bilgi Düzeltme Talebi
        </h1>
        <p style={{ textAlign: 'center', color: 'var(--l2t-muted)', marginBottom: '32px' }}>
          İşletmeler, LetsGo2Travel üzerinde yer alan kendileriyle ilgili içerikler için bilgi düzeltme, cevap hakkı veya içerik inceleme talebi oluşturabilir.
        </p>
        
        <div className="l2t-card" style={{ padding: '32px' }}>
          {status && (
            <div style={{
              padding: '16px',
              marginBottom: '24px',
              borderRadius: '8px',
              background: status.type === 'success' ? 'rgba(0,200,83,0.1)' : 'rgba(255,68,68,0.1)',
              border: `1px solid ${status.type === 'success' ? 'rgba(0,200,83,0.3)' : 'rgba(255,68,68,0.3)'}`,
              color: status.type === 'success' ? '#00c853' : '#ff4444'
            }}>
              {status.message}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: '#fff' }}>İşletme Adı *</label>
              <input 
                type="text" 
                name="businessName" 
                value={formData.businessName}
                onChange={handleChange}
                required
                className="l2t-input"
                style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: '#fff' }}>Yetkili Kişi Adı *</label>
              <input 
                type="text" 
                name="authorizedPerson" 
                value={formData.authorizedPerson}
                onChange={handleChange}
                required
                className="l2t-input"
                style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
              />
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', color: '#fff' }}>E-posta Adresi *</label>
                <input 
                  type="email" 
                  name="email" 
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="l2t-input"
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', color: '#fff' }}>Telefon Numarası</label>
                <input 
                  type="tel" 
                  name="phone" 
                  value={formData.phone}
                  onChange={handleChange}
                  className="l2t-input"
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: '#fff' }}>İtiraz Edilen İçerik Bağlantısı (URL) *</label>
              <input 
                type="url" 
                name="contentUrl" 
                value={formData.contentUrl}
                onChange={handleChange}
                required
                placeholder="https://letsgo2travel.com/..."
                className="l2t-input"
                style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: '#fff' }}>Talep Türü *</label>
              <select 
                name="objectionType" 
                value={formData.objectionType}
                onChange={handleChange}
                required
                className="l2t-input"
                style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
              >
                <option value="Bilgi düzeltme" style={{color: '#000'}}>Bilgi düzeltme</option>
                <option value="İçerik kaldırma talebi" style={{color: '#000'}}>İçerik kaldırma talebi</option>
                <option value="Cevap hakkı" style={{color: '#000'}}>Cevap hakkı</option>
                <option value="Marka/isim hakkı itirazı" style={{color: '#000'}}>Marka/isim hakkı itirazı</option>
                <option value="Diğer" style={{color: '#000'}}>Diğer</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: '#fff' }}>Açıklama *</label>
              <textarea 
                name="description" 
                value={formData.description}
                onChange={handleChange}
                required
                rows={5}
                className="l2t-input"
                style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', resize: 'vertical' }}
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer', marginTop: '8px' }}>
              <input 
                type="checkbox" 
                name="confirmed"
                checked={formData.confirmed}
                onChange={handleChange}
                required
                style={{ width: '20px', height: '20px', marginTop: '2px', accentColor: 'var(--l2t-gold)' }} 
              />
              <span style={{ fontSize: '0.9rem', color: 'var(--l2t-soft)', lineHeight: '1.5' }}>
                Bu talebi yetkili kişi olarak oluşturduğumu kabul ediyorum.
              </span>
            </label>

            <button 
              type="submit" 
              disabled={loading || !formData.confirmed}
              style={{
                background: formData.confirmed ? 'var(--l2t-gold)' : 'rgba(255,255,255,0.1)',
                color: formData.confirmed ? '#000' : 'rgba(255,255,255,0.4)',
                padding: '16px',
                borderRadius: '8px',
                border: 'none',
                fontWeight: 'bold',
                cursor: formData.confirmed && !loading ? 'pointer' : 'not-allowed',
                marginTop: '16px',
                transition: 'all 0.2s ease'
              }}
            >
              {loading ? 'Gönderiliyor...' : 'Talebi Gönder'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
