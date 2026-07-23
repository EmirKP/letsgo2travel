export interface ForumReplyView {
  id: string;
  topic_id: string;
  author_name: string | null;
  content: string;
  created_at: string;
}

export interface ForumPaywallStateRow {
  total_replies: number | string | null;
  visible_replies: number | string | null;
  hidden_replies: number | string | null;
  is_paywalled: boolean | null;
  has_unlocked: boolean | null;
}
