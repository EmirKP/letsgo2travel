"use client";

import { useEffect, useState } from "react";
import { Trophy, Medal, MapPin } from "lucide-react";
import styles from "./ExplorerLeaderboard.module.css";

interface Leader {
  username: string;
  visited_count: number;
  points: number;
  badges?: string[];
}

export default function ExplorerLeaderboard() {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchLeaderboard() {
      try {
        const res = await fetch('/api/leaderboard?limit=20');
        if (!res.ok) throw new Error("league_unavailable");
        const json = await res.json();
        if (json.data) setLeaders(json.data);
      } catch (err) {
        console.error(err); setError(true);
      } finally {
        setLoading(false);
      }
    }
    fetchLeaderboard();
  }, []);

  if (error) return <div className={styles.empty}>Sıralama yüklenemedi. Lütfen sayfayı yenileyerek tekrar dene.</div>;
  if (loading) return <div className={styles.loading}>Yükleniyor...</div>;

  return (
    <div className={styles.stack}>
      <div className={`l2t-legal-notice ${styles.notice}`}>
        <strong>Doğrulanmış keşifler:</strong> Onaylanan her farklı ülke ziyareti 10 puan kazandırır. Bekleyen ve yalnız işaretlenen ziyaretler puan kazandırmaz.
      </div>
      
      {leaders.map((leader, idx) => (
        <div key={`${leader.username}-${idx}`} className={`l2t-belgeli-gezgin-card ${styles.row}`}>
          <div className={styles.identity}>
            <div className={`${styles.rank} ${idx === 0 ? styles.first : idx === 1 ? styles.second : idx === 2 ? styles.third : ''}`}>
              {idx + 1}
            </div>
            <div>
              <div className={styles.name}>
                {leader.username}
                {idx === 0 && <Trophy />}
              </div>
              <div className={styles.meta}>
                <span><MapPin /> {leader.visited_count} Onaylı ülke</span>
                <span><Medal /> Puan: {leader.points}</span>
              </div>
            </div>
          </div>
          
          <div className={styles.badges}>
            {leader.badges && leader.badges.slice(0, 3).map((badge: string, bIdx: number) => (
              <span key={bIdx} className={`l2t-badge ${styles.badge}`}>
                {badge.replace('_', ' ').toUpperCase()}
              </span>
            ))}
            {leader.badges && leader.badges.length > 3 && (
              <span className={`l2t-badge ${styles.badge}`}>+{leader.badges.length - 3}</span>
            )}
          </div>
        </div>
      ))}

      {leaders.length === 0 && (
        <div className={styles.empty}>
          İlk ülke ziyaretini belgeyle doğrula, onaydan sonra ligdeki yerini al.
        </div>
      )}
    </div>
  );
}
