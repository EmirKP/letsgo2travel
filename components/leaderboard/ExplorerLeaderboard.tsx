"use client";

import { useEffect, useState } from "react";
import { Trophy, Medal, MapPin } from "lucide-react";

export default function ExplorerLeaderboard() {
  const [leaders, setLeaders] = useState<any[]>([]);
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

  if (loading) return <div className="text-center py-8 text-gray-400">Yükleniyor...</div>;

  return (
    <div className="space-y-4">
      <div className="l2t-legal-notice !mt-0 !mb-6 bg-gradient-to-r from-[rgba(245,184,27,0.1)] to-transparent border-l-[#F5B81B]">
        <strong>Ödül Bilgisi:</strong> LetsGo2Travel’de faydalı bilgi paylaşan gezginler dönemsel küçük ödüller kazanabilir. Ödüller kampanya dönemine göre değişebilir.
      </div>
      
      {leaders.map((leader, idx) => (
        <div key={idx} className="l2t-belgeli-gezgin-card flex flex-col md:flex-row items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg
              ${idx === 0 ? 'bg-[#F5B81B] text-black' : 
                idx === 1 ? 'bg-gray-300 text-black' : 
                idx === 2 ? 'bg-[#CD7F32] text-white' : 
                'bg-[rgba(255,255,255,0.1)] text-white'}`}>
              {idx + 1}
            </div>
            <div>
              <div className="font-bold text-white text-lg flex items-center gap-2">
                {leader.username}
                {idx === 0 && <Trophy className="w-4 h-4 text-[#F5B81B]" />}
              </div>
              <div className="text-sm text-gray-400 flex items-center gap-3 mt-1">
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/> {leader.visited_count} Ülke</span>
                <span className="flex items-center gap-1"><Medal className="w-3 h-3"/> Puan: {leader.points}</span>
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2 justify-end">
            {leader.badges && leader.badges.slice(0, 3).map((badge: string, bIdx: number) => (
              <span key={bIdx} className="l2t-badge text-xs">
                {badge.replace('_', ' ').toUpperCase()}
              </span>
            ))}
            {leader.badges && leader.badges.length > 3 && (
              <span className="l2t-badge text-xs">+{leader.badges.length - 3}</span>
            )}
          </div>
        </div>
      ))}

      {leaders.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          Henüz sıralamada kimse yok. İlk giren sen ol!
        </div>
      )}
    </div>
  );
}
