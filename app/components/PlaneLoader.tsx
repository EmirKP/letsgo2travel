"use client";

import { Compass, Plane, Sparkles, Activity } from "lucide-react";
import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const loadingTexts = [
  "Rota seçenekleri analiz ediliyor...",
  "Bütçe ve seyahat süresi eşleşiyor...",
  "Şehir önerileri hazırlanıyor...",
  "Plan kartların oluşturuluyor..."
];

const chips = [
  "Rota",
  "Bütçe",
  "Keşif"
];

export default function PlaneLoader({ 
  isLoading, 
  message 
}: { 
  isLoading: boolean;
  message?: string;
}) {
  const [show, setShow] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [textIndex, setTextIndex] = useState(0);
  const chips = ["Rota analizi", "Bütçe eşleşmesi", "Plan hazırlanıyor"];

  useEffect(() => {
    if (isLoading) {
      setShow(true);
      setIsFadingOut(false);
      setTextIndex(0);
    } else {
      if (show) {
        setIsFadingOut(true);
        const timer = setTimeout(() => {
          setShow(false);
          setIsFadingOut(false);
        }, 350);
        return () => clearTimeout(timer);
      }
    }
  }, [isLoading, show]);

  useEffect(() => {
    if (!show || isFadingOut) return;
    const interval = setInterval(() => {
      setTextIndex((prev) => (prev + 1) % loadingTexts.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [show, isFadingOut]);

  if (!show && !isFadingOut) return null;

  // Calculate chip progress based on text index
  const activeChipIndex = Math.min(Math.floor(textIndex / 2), chips.length - 1);

  return (
    <div className={`l2t-loader-overlay-new ${isFadingOut ? 'fade-out' : ''}`}>
      <div className="l2t-ai-loading-board">
        
        {/* Header Area */}
        <div className="l2t-board-header">
          <div className="l2t-board-brand">
            <div className="l2t-board-brand-row">
              <Compass size={22} color="#D9A441" strokeWidth={2} />
              <span className="l2t-board-brand-text">LetsGo2Travel</span>
              <Plane size={16} color="#0B1D35" style={{ marginLeft: 4, transform: 'rotate(45deg)' }} />
            </div>
            <span className="l2t-board-slogan">Istanbul to ✈ World</span>
          </div>

          <h1 className="l2t-board-title">Seyahat planın hazırlanıyor</h1>
          <p className="l2t-board-desc">
            Seçimlerine göre en uygun rotaları, bütçe ve süreyle eşleştiriyoruz.
          </p>
        </div>

        {/* Preview Cards Area */}
        <div className="l2t-ai-preview-grid">
          {[1, 2, 3].map((card, idx) => (
            <div key={`preview-${card}`} className="l2t-ai-preview-card">
              <div className="l2t-ai-preview-image">
                <div className="l2t-ai-scanning-overlay" />
                <div className="l2t-ai-image-content">
                  <Plane className="l2t-ai-flying-icon" size={28} color="rgba(217, 164, 65, 0.9)" />
                  <div className="l2t-ai-image-text">Bölge taranıyor...</div>
                </div>
              </div>
              <div className="l2t-ai-preview-body">
                <div className="l2t-ai-preview-line-group">
                  <div className="l2t-ai-mock-title">
                    <Sparkles size={14} color="#D9A441" className="l2t-pulse-sparkle" /> 
                    <div className="l2t-ai-preview-line-1" style={{ width: idx === 1 ? '85%' : '75%' }} />
                  </div>
                  <div className="l2t-ai-preview-line-2" style={{ width: idx === 0 ? '55%' : '45%' }} />
                  <div className="l2t-ai-preview-line-3" />
                </div>
                <div className="l2t-ai-preview-chips">
                  <div className="l2t-ai-preview-chip">
                    <Activity size={12} color="rgba(11, 29, 53, 0.4)" />
                  </div>
                  <div className="l2t-ai-preview-chip">
                    <Compass size={12} color="rgba(56, 189, 248, 0.6)" />
                  </div>
                  <div className="l2t-ai-preview-chip" style={{ width: '40px' }} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Stepper Area */}
        <div className="l2t-board-stepper">
          {chips.map((chip, idx) => (
            <React.Fragment key={chip}>
              <div className={`l2t-stepper-step ${idx <= activeChipIndex ? 'active' : ''}`}>
                <span className="l2t-stepper-dot" />
                <span>{chip}</span>
              </div>
              {idx < chips.length - 1 && <div className={`l2t-stepper-line ${idx < activeChipIndex ? 'active' : ''}`} />}
            </React.Fragment>
          ))}
        </div>

      </div>
    </div>
  );
}
