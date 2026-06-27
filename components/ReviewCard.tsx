"use client";

import { ShieldCheck, Info, Users, AlertTriangle } from "lucide-react";
import React from "react";

export type ReviewType = "official" | "verified" | "community";

interface ReviewCardProps {
  type: ReviewType;
  authorName: string;
  date: string;
  content: string;
  businessReply?: string;
  isFlagged?: boolean; // Turist tuzağı vb riskli yorumlar
}

export default function ReviewCard({ type, authorName, date, content, businessReply, isFlagged }: ReviewCardProps) {
  let badge = null;
  let borderColor = "var(--l2t-border)";

  switch (type) {
    case "official":
      badge = (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '4px 8px', borderRadius: '4px', fontWeight: 700 }}>
          <Info size={14} /> Resmî Bilgi
        </span>
      );
      borderColor = "rgba(16, 185, 129, 0.4)";
      break;
    case "verified":
      badge = (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', color: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)', padding: '4px 8px', borderRadius: '4px', fontWeight: 700 }}>
          <ShieldCheck size={14} /> Doğrulanmış Gezgin Deneyimi
        </span>
      );
      borderColor = "rgba(59, 130, 246, 0.4)";
      break;
    case "community":
    default:
      badge = (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', color: 'var(--l2t-gold)', background: 'rgba(245, 184, 27, 0.1)', padding: '4px 8px', borderRadius: '4px', fontWeight: 700 }}>
          <Users size={14} /> Topluluk Yorumu
        </span>
      );
      break;
  }

  return (
    <div style={{
      background: 'rgba(10, 25, 48, 0.65)',
      backdropFilter: 'blur(16px)',
      border: `1px solid ${borderColor}`,
      borderRadius: '12px',
      padding: '20px',
      marginBottom: '16px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Decorative Glow */}
      <div style={{ position: 'absolute', top: -50, left: -50, width: 100, height: 100, background: borderColor, filter: 'blur(60px)', opacity: 0.3, pointerEvents: 'none' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--l2t-sky)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#fff' }}>
            {authorName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--l2t-ink)', fontSize: '0.95rem' }}>{authorName}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--l2t-muted)' }}>{date}</div>
          </div>
        </div>
        {badge}
      </div>

      <div style={{ color: 'var(--l2t-soft)', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '16px' }}>
        {content}
      </div>

      {isFlagged && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '10px 14px', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '16px' }}>
          <AlertTriangle size={16} /> 
          <strong>Uyarı:</strong> Bu konum hakkında dikkatli olunması önerilir (Karışık kullanıcı deneyimleri).
        </div>
      )}

      {businessReply && (
        <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(0,0,0,0.2)', borderLeft: '3px solid var(--l2t-gold)', borderRadius: '0 8px 8px 0' }}>
          <strong style={{ display: 'block', fontSize: '0.85rem', color: 'var(--l2t-gold)', marginBottom: '4px' }}>İşletme Yanıtı:</strong>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--l2t-soft)' }}>{businessReply}</p>
        </div>
      )}

      {/* Zorunlu Feragatname */}
      {type !== "official" && (
        <div style={{ marginTop: '20px', paddingTop: '12px', borderTop: '1px solid var(--l2t-border)', fontSize: '0.75rem', color: 'var(--l2t-muted)', lineHeight: 1.5 }}>
          Bu içerik kullanıcı deneyimine dayalıdır. Resmî bilgi niteliği taşımaz. LetsGo2Travel, kullanıcılar tarafından paylaşılan içeriklerin doğruluğunu ve güncelliğini garanti etmez. İşlem yapmadan önce güncel bilgileri teyit etmeniz önerilir.
        </div>
      )}
    </div>
  );
}
