import Link from "next/link";
import { ArrowLeft, User, MapPin, MessageSquare, AlertCircle } from "lucide-react";
import ForumReplyForm from "@/components/ForumReplyForm";
import ForumReportButton from "@/components/ForumReportModal";
import { supabase } from "@/lib/supabase-client";
import { notFound } from "next/navigation";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  return {
    title: `Forum Konusu ${resolvedParams.id} | Letsgo2Travel`,
  };
}

export default async function ForumTopicPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  
  // Fetch Topic
  const { data: topic, error: topicError } = await supabase
    .from("forum_topics")
    .select("*")
    .eq("id", resolvedParams.id)
    .single();

  if (!topic || topic.status !== "published") {
    return notFound();
  }

  // Fetch Replies
  const { data: repliesData } = await supabase
    .from("forum_replies")
    .select("*")
    .eq("topic_id", resolvedParams.id)
    .eq("status", "published")
    .order("created_at", { ascending: true });

  const replies = repliesData || [];

  return (
    <div className="l2t-page" style={{ minHeight: "80vh", background: "#f8fafc", paddingBottom: "80px" }}>
      
      {/* Hero / Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "40px 20px" }}>
        <div className="l2t-wrap" style={{ maxWidth: "800px", margin: "0 auto" }}>
          <Link href="/forum" style={{ color: "#64748B", display: "inline-flex", alignItems: "center", gap: "8px", textDecoration: "none", marginBottom: "24px", fontSize: "0.95rem", fontWeight: "500" }}>
            <ArrowLeft size={16} /> Foruma Dön
          </Link>
          
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
            <span style={{ background: "#F1F5F9", color: "#475569", padding: "6px 12px", borderRadius: "100px", fontSize: "0.85rem", fontWeight: "600" }}>
              {topic.category}
            </span>
            <Link href={`/forum/ulke/${(topic.country_slug || "genel").toLowerCase()}`} style={{ background: "#ECFDF5", color: "#059669", padding: "6px 12px", borderRadius: "100px", fontSize: "0.85rem", fontWeight: "600", display: "flex", alignItems: "center", gap: "4px", textDecoration: "none" }}>
              <MapPin size={14} /> {topic.country_slug || "Genel"}
            </Link>
          </div>

          <h1 style={{ fontSize: "2.2rem", color: "var(--l2t-navy)", fontWeight: "800", margin: "0 0 16px", lineHeight: "1.3" }}>
            {topic.title}
          </h1>
        </div>
      </div>

      <div className="l2t-wrap" style={{ maxWidth: "800px", margin: "40px auto 0", padding: "0 20px" }}>
        
        {/* Uyarı */}
        <div style={{ background: "#FFFBEB", borderLeft: "4px solid #F59E0B", padding: "16px 20px", borderRadius: "0 12px 12px 0", marginBottom: "32px", display: "flex", gap: "12px" }}>
          <AlertCircle size={20} color="#D97706" style={{ flexShrink: 0, marginTop: "2px" }} />
          <p style={{ margin: 0, color: "#B45309", fontSize: "0.9rem", lineHeight: "1.6" }}>
            Bu konudaki mesajlar kullanıcı deneyimidir. Resmi işlemleriniz (vize, pasaport vb.) için her zaman konsoloslukların güncel duyurularını dikkate alınız.
          </p>
        </div>

        {/* Ana Konu Gönderisi */}
        <div style={{ background: "#fff", padding: "32px", borderRadius: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.03)", marginBottom: "32px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px", paddingBottom: "24px", borderBottom: "1px solid #f1f5f9" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ width: "48px", height: "48px", background: "#EFF6FF", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--l2t-blue)" }}>
                <User size={24} />
              </div>
              <div>
                <h4 style={{ margin: "0 0 4px", color: "var(--l2t-navy)", fontWeight: "700", fontSize: "1.05rem" }}>{topic.author_name || "Gizli Kullanıcı"}</h4>
                <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>{new Date(topic.created_at).toLocaleDateString("tr-TR", { year: 'numeric', month: 'short', day: 'numeric' })}</span>
              </div>
            </div>
            <ForumReportButton targetId={topic.id.toString()} targetType="topic" />
          </div>
          <div style={{ color: "#334155", fontSize: "1.05rem", lineHeight: "1.8", whiteSpace: "pre-wrap" }}>
            {topic.content}
          </div>
        </div>

        {/* Cevaplar */}
        <h3 style={{ fontSize: "1.3rem", color: "var(--l2t-navy)", fontWeight: "700", marginBottom: "24px", display: "flex", alignItems: "center", gap: "8px" }}>
          <MessageSquare size={20} color="#64748B" /> {replies.length} Cevap
        </h3>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "40px" }}>
          {replies.map((reply: any) => (
            <div key={reply.id} style={{ background: "#fff", padding: "24px", borderRadius: "16px", border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "36px", height: "36px", background: "#F1F5F9", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B" }}>
                    <User size={18} />
                  </div>
                  <div>
                    <h4 style={{ margin: "0 0 2px", color: "var(--l2t-navy)", fontWeight: "600", fontSize: "0.95rem" }}>{reply.author_name || "Gizli Kullanıcı"}</h4>
                    <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>{new Date(reply.created_at).toLocaleDateString("tr-TR", { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                  </div>
                </div>
                <ForumReportButton targetId={reply.id.toString()} targetType="reply" />
              </div>
              <div style={{ color: "#475569", fontSize: "1rem", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>
                {reply.content}
              </div>
            </div>
          ))}
        </div>

        {/* Cevap Yazma Alanı (Interactive) */}
        <ForumReplyForm topicId={topic.id.toString()} topicTitle={topic.title} />

      </div>
    </div>
  );
}
