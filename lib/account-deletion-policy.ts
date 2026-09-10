export const ACCOUNT_DELETION_TYPE = "Hesabımı kapatmak istiyorum";
export const ACCOUNT_DELETION_DAYS = 30;
export type DeletionRequestSummary = {
  id: string; status: string; createdAt: string; targetCompletionAt: string;
  completedAt: string | null; notificationStatus: "pending" | "sent" | null;
};

export function deletionDeadline(createdAt: string) {
  return new Date(Date.parse(createdAt) + ACCOUNT_DELETION_DAYS * 86_400_000).toISOString();
}

export function deletionSummary(row: Record<string, unknown>): DeletionRequestSummary {
  return {
    id: String(row.id), status: String(row.status), createdAt: String(row.created_at),
    targetCompletionAt: String(row.target_completion_at || deletionDeadline(String(row.created_at))),
    completedAt: typeof row.processed_at === "string" ? row.processed_at : null,
    notificationStatus: row.completion_notification_status === "sent" ? "sent" : row.completion_notification_status === "pending" ? "pending" : null,
  };
}
