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

  useEffect(() => {
    async function fetchLeaderboard() {
      try {
        const res = await fetch('/api/leaderboard?limit=20');
        const json = await res.json();
        if (json.data) setLeaders(json.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchLeaderboard();
  }, []);

  if (loading) return <div className={styles.loading}>Yükleniyor...</div>;

  return (
    <div className={styles.stack}>
      <div className={`l2t-legal-notice ${styles.notice}`}>
        <strong>Ödül Bilgisi:</strong> LetsGo2Travel’de faydalı bilgi paylaşan gezginler dönemsel küçük ödüller kazanabilir. Ödüller kampanya dönemine göre değişebilir.
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
                <span><MapPin /> {leader.visited_count} Ülke</span>
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
          Henüz sıralamada kimse yok. İlk giren sen ol!
        </div>
      )}
    </div>
  );
}
