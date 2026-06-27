"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Send, Plane, MapPin, Wallet, Info } from "lucide-react";

type SearchResponse = {
  answer: string;
  url: string;
  intent?: { destination?: string; destinationCode?: string; originCode?: string; visaPreference?: string; month?: string };
  planPreview?: {
    destination: string;
    score: number;
    budgetText: string;
    tags: string[];
    tips: string[];
  };
};

const examplePrompts = [
  "3 günlük vizesiz Balkan rotası öner",
  "10 bin TL altı kimlikle gidilecek yer",
  "Yaz için deniz tatili ve ucuz uçak bileti",
];

export default function AISearchBox() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResponse | null>(null);

  async function onSubmit(event?: React.FormEvent<HTMLFormElement>) {
    if (event) event.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/arama", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = (await response.json()) as SearchResponse;
      // Simulate slight delay for dramatic "thinking" effect
      setTimeout(() => {
        setResult(data);
        setLoading(false);
      }, 600);
    } catch {
      setResult({ answer: "Arama hazırlanamadı. Biraz sonra tekrar deneyebilirsin.", url: "/kampanyalar" });
      setLoading(false);
    }
  }

  return (
    <div className="ai-chat-container">
      {/* Çıktı Ekranı */}
      <AnimatePresence mode="wait">
        {!result && !loading ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="ai-empty-state"
          >
            <Sparkles size={32} className="ai-sparkle-icon" />
            <h3>Nereye gitmek istiyorsun?</h3>
            <p>Bütçeni, vize durumunu veya hayalindeki tatili yaz.</p>
            <div className="ai-suggestions">
              {examplePrompts.map((prompt) => (
                <button key={prompt} onClick={() => { setQuery(prompt); }} type="button">
                  {prompt}
                </button>
              ))}
            </div>
          </motion.div>
        ) : loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="ai-loading-state"
          >
            <div className="ai-loader-pulse"></div>
            <span>Yapay zeka rotanı planlıyor...</span>
          </motion.div>
        ) : result ? (
          <motion.div
            key="result"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="ai-result-panel"
          >
            <div className="ai-answer-text">
              <Sparkles size={18} />
              <p>{result.answer}</p>
            </div>

            {result.planPreview && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="ai-bento-grid"
              >
                <div className="ai-bento-card score-card">
                  <span className="bento-label">Uyum Skoru</span>
                  <strong className="bento-value">%{result.planPreview.score}</strong>
                </div>
                <div className="ai-bento-card dest-card">
                  <span className="bento-label"><MapPin size={14} /> Öneri</span>
                  <strong className="bento-value">{result.planPreview.destination}</strong>
                </div>
                <div className="ai-bento-card budget-card">
                  <span className="bento-label"><Wallet size={14} /> Bütçe</span>
                  <strong className="bento-value">{result.planPreview.budgetText}</strong>
                </div>
              </motion.div>
            )}

            {result.planPreview?.tags?.length && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="ai-tags-row"
              >
                {result.planPreview.tags.map((tag) => <span key={tag}>{tag}</span>)}
              </motion.div>
            )}

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="ai-action-row"
            >
              <a href={result.url} target="_blank" rel="noreferrer" className="l2t-btn ai-cta-btn">
                <Plane size={18} /> Canlı Bilet Ara
              </a>
              <button className="ai-reset-btn" onClick={() => setResult(null)}>
                Yeni Arama
              </button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Girdi Alanı */}
      <form onSubmit={onSubmit} className="ai-input-form">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Örn: Hafta sonu vizesiz deniz tatili..."
          disabled={loading}
        />
        <button type="submit" disabled={loading || !query.trim()} className="ai-send-btn">
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
