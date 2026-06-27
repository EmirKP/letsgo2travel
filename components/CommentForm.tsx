"use client";

import React, { useState } from "react";
import { AlertTriangle, Send } from "lucide-react";

interface CommentFormProps {
  onSubmit: (content: string) => Promise<void>;
  placeholder?: string;
}

const BANNED_WORDS = [
  "dolandırıcı", "hırsız", "sahtekâr", "kazıkçı", "soyguncu", 
  "dolandırıyor", "hırsızlık yapıyor", "kesin suç işliyor", "soyulursun"
];

export default function CommentForm({ onSubmit, placeholder = "Deneyiminizi paylaşın..." }: CommentFormProps) {
  const [content, setContent] = useState("");
  const [responsibilityAccepted, setResponsibilityAccepted] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [forceSubmit, setForceSubmit] = useState(false);

  const checkBannedWords = (text: string) => {
    const lowerText = text.toLowerCase();
    for (const word of BANNED_WORDS) {
      if (lowerText.includes(word)) {
        return word;
      }
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!content.trim()) {
      setError("Lütfen bir yorum yazın.");
      return;
    }

    if (!responsibilityAccepted) {
      setError("İçerik sorumluluğunu kabul etmelisiniz.");
      return;
    }

    const detectedWord = checkBannedWords(content);
    if (detectedWord && !forceSubmit) {
      setError(`Yorumunuzda "${detectedWord}" gibi riskli bir ifade tespit edildi. Lütfen doğrudan suçlama yapmak yerine kişisel deneyiminizi ("Beklediğimden düşük kur aldım" gibi) nötr bir dille ifade edin. Düzenlemeden göndermek isterseniz yorumunuz moderasyon onayından geçecektir.`);
      setForceSubmit(true);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(content);
      setContent("");
      setResponsibilityAccepted(false);
      setForceSubmit(false);
    } catch (err: any) {
      setError(err.message || "Bir hata oluştu.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      background: 'rgba(10, 25, 48, 0.4)',
      border: '1px solid var(--l2t-border)',
      borderRadius: '12px',
      padding: '24px',
      marginTop: '24px'
    }}>
      <h3 style={{ margin: '0 0 16px', color: 'var(--l2t-ink)', fontSize: '1.1rem' }}>Yorum Bırak</h3>
      
      <form onSubmit={handleSubmit}>
        <textarea
          value={content}
          onChange={(e) => { setContent(e.target.value); setForceSubmit(false); setError(""); }}
          placeholder={placeholder}
          rows={4}
          style={{
            width: '100%',
            background: 'rgba(0, 0, 0, 0.2)',
            border: '1px solid var(--l2t-border)',
            borderRadius: '8px',
            padding: '16px',
            color: '#fff',
            resize: 'vertical',
            outline: 'none',
            fontFamily: 'inherit',
            marginBottom: '16px'
          }}
          onFocus={(e) => { e.target.style.borderColor = 'var(--l2t-gold)' }}
          onBlur={(e) => { e.target.style.borderColor = 'var(--l2t-border)' }}
        />

        <div style={{ marginBottom: '20px', padding: '16px', background: 'rgba(10, 25, 48, 0.6)', borderRadius: '8px', border: '1px solid var(--l2t-border)' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={responsibilityAccepted}
              onChange={(e) => setResponsibilityAccepted(e.target.checked)}
              style={{ marginTop: '4px', width: '18px', height: '18px' }}
            />
            <span style={{ fontSize: '0.85rem', color: 'var(--l2t-soft)', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--l2t-ink)' }}>Kullanıcı Sorumluluğu Kabulü:</strong> LetsGo2Travel&apos;da paylaştığım tüm yorum, bilgi, öneri ve deneyimden bizzat ben sorumluyum. Paylaştığım içeriğin doğru, hukuka uygun, hakaret/iftira içermeyen ve üçüncü kişilerin haklarını ihlal etmeyen nitelikte olduğunu kabul ederim.
            </span>
          </label>
        </div>

        {error && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: '#ef4444', marginBottom: '16px', fontSize: '0.9rem', background: 'rgba(239, 68, 68, 0.1)', padding: '12px', borderRadius: '8px' }}>
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{error}</span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button 
            type="submit" 
            disabled={isSubmitting || !responsibilityAccepted}
            className="l2t-btn"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: forceSubmit ? '#ef4444' : '' }}
          >
            <Send size={16} />
            {isSubmitting ? "Gönderiliyor..." : (forceSubmit ? "İncelemeye Gönder" : "Yorumu Gönder")}
          </button>
        </div>
      </form>
    </div>
  );
}
