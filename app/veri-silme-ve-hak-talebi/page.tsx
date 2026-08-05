'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase-client';

export default function KVKKRequestPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    username: '',
    requestType: 'Verilerimi görmek istiyorum',
    description: '',
    confirmed: false
  });
  
  const [status, setStatus] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [accountDeletionRequested, setAccountDeletionRequested] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const session = data.session;
      const isAccountDeletion = new URLSearchParams(window.location.search).get('request') === 'account_deletion';
      setAccountDeletionRequested(isAccountDeletion);
      setAccessToken(session?.access_token || '');
      if (session?.user) {
        const metadata = session.user.user_metadata || {};
        setFormData((current) => ({
          ...current,
          name: current.name || String(metadata.full_name || metadata.name || ''),
          email: session.user.email || '',
          username: current.username || String(metadata.username || ''),
          requestType: isAccountDeletion
            ? 'Hesabımı kapatmak istiyorum'
            : current.requestType,
        }));
      }
      setSessionReady(true);
    });
    return () => { active = false; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    if (!formData.confirmed) {
      setStatus({ type: 'error', message: 'Lütfen onay kutusunu işaretleyiniz.' });
      setLoading(false);
      return;
    }

    if (!accessToken) {
      setStatus({ type: 'error', message: 'Talep göndermek için hesabınıza giriş yapmalısınız.' });
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/kvkk-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(formData)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Bir hata oluştu.');
      }

      setStatus({ type: 'success', message: data.message });
      setFormData({
        name: '',
        email: '',
        username: '',
        requestType: 'Verilerimi görmek istiyorum',
        description: '',
        confirmed: false
      });
    } catch (err: unknown) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Talep gönderilemedi.' });
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
    <div className="l2t-page">
      <div className="l2t-wrap" style={{ maxWidth: '600px', margin: '0 auto', padding: '40px 20px' }}>
        <h1 style={{ color: 'var(--l2t-gold)', marginBottom: '16px', fontSize: '2.2rem', textAlign: 'center' }}>
          Veri Silme ve Hak Talebi
        </h1>
        <p style={{ textAlign: 'center', color: 'var(--l2t-muted)', marginBottom: '32px' }}>
          Kişisel verilerinizle ilgili taleplerinizi bu sayfa üzerinden iletebilirsiniz. Başvurunuzun değerlendirilebilmesi için giriş yapmış olmanız gereklidir.
        </p>

        {sessionReady && !accessToken && (
          <div className="l2t-card" style={{ padding: '18px', marginBottom: '20px', textAlign: 'center' }}>
            <p style={{ margin: '0 0 12px', color: 'var(--l2t-soft)' }}>Kimliğinizi doğrulayabilmemiz için önce hesabınıza giriş yapın.</p>
            <Link href={`/auth/login?next=${encodeURIComponent(accountDeletionRequested ? '/veri-silme-ve-hak-talebi?request=account_deletion&source=google-play' : '/veri-silme-ve-hak-talebi')}`} className="l2t-btn">Giriş yap</Link>
          </div>
        )}
        
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
              <label style={{ display: 'block', marginBottom: '8px', color: '#fff' }}>Ad Soyad *</label>
              <input 
                type="text" 
                name="name" 
                value={formData.name}
                onChange={handleChange}
                required
                className="l2t-input"
                style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: '#fff' }}>E-posta Adresiniz *</label>
              <input 
                type="email" 
                name="email" 
                value={formData.email}
                onChange={handleChange}
                required
                readOnly={Boolean(accessToken)}
                className="l2t-input"
                style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: '#fff' }}>Kullanıcı Adı (Varsa)</label>
              <input 
                type="text" 
                name="username" 
                value={formData.username}
                onChange={handleChange}
                className="l2t-input"
                style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: '#fff' }}>Talep Türü *</label>
              <select 
                name="requestType" 
                value={formData.requestType}
                onChange={handleChange}
                required
                className="l2t-input"
                style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
              >
                <option value="Verilerimi görmek istiyorum" style={{color: '#000'}}>Verilerimi görmek istiyorum</option>
                <option value="Verilerimi düzeltmek istiyorum" style={{color: '#000'}}>Verilerimi düzeltmek istiyorum</option>
                <option value="Verilerimin silinmesini istiyorum" style={{color: '#000'}}>Verilerimin silinmesini istiyorum</option>
                <option value="Doğrulama geçmişimin silinmesini istiyorum" style={{color: '#000'}}>Doğrulama geçmişimin silinmesini istiyorum</option>
                <option value="Açık rızamı geri çekmek istiyorum" style={{color: '#000'}}>Açık rızamı geri çekmek istiyorum</option>
                <option value="Hesabımı kapatmak istiyorum" style={{color: '#000'}}>Hesabımı kapatmak istiyorum</option>
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
                Bu talebin bana ait olduğunu ve verdiğim bilgilerin doğru olduğunu kabul ediyorum.
              </span>
            </label>

            <button 
              type="submit" 
              disabled={loading || !formData.confirmed || !accessToken}
              style={{
                background: formData.confirmed && accessToken && !loading ? 'var(--l2t-gold)' : 'rgba(255,255,255,0.1)',
                color: formData.confirmed && accessToken && !loading ? '#000' : 'rgba(255,255,255,0.4)',
                padding: '16px',
                borderRadius: '8px',
                border: 'none',
                fontWeight: 'bold',
                cursor: formData.confirmed && accessToken && !loading ? 'pointer' : 'not-allowed',
                marginTop: '16px',
                transition: 'all 0.2s ease'
              }}
            >
              {loading ? 'Gönderiliyor...' : 'Talebi Gönder'}
            </button>
            <p style={{fontSize: '0.8rem', color: 'var(--l2t-muted)', textAlign: 'center', marginTop: '8px'}}>
              Talep, yalnızca giriş yaptığınız hesabın doğrulanmış e-posta adresiyle eşleştirilir. Hesap silme işlemi yönetici onayı olmadan otomatik başlamaz.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
