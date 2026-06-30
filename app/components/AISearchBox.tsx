"use client";

import { useState } from "react";
import { Sparkles, Send, Plane, MapPin, Wallet } from "lucide-react";

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
      <div>
        {!result && !loading ? (
          <div className="ai-empty-state l2t-ai-fade">
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
          </div>
        ) : loading ? (
          <div className="ai-loading-state l2t-ai-fade">
            <div className="ai-loader-pulse"></div>
            <span>Yapay zeka rotanı planlıyor...</span>
          </div>
        ) : result ? (
          <div className="ai-result-panel l2t-ai-fade">
            <div className="ai-answer-text">
              <Sparkles size={18} />
              <p>{result.answer}</p>
            </div>

            {result.planPreview && (
<div className="ai-bento-grid l2t-ai-fade">
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
              </div>
            )}

            {result.planPreview?.tags?.length && (
              <div className="ai-tags-row l2t-ai-fade">
                {result.planPreview.tags.map((tag) => <span key={tag}>{tag}</span>)}
              </div>
            )}

            <div className="ai-action-row l2t-ai-fade">
              <a href={result.url} target="_blank" rel="nofollow sponsored noreferrer" className="l2t-btn ai-cta-btn">
                <Plane size={18} /> Canlı Bilet Ara
              </a>
              <button className="ai-reset-btn" onClick={() => setResult(null)}>
                Yeni Arama
              </button>
            </div>
          </div>
        ) : null}
      </div>

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
