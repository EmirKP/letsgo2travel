import type { AdminRole } from "./admin-session";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MODERATION_ROLES = ["moderator", "admin", "super_admin"] as const;

export const MODERATION_TARGET_TABLES = {
  question: "country_questions",
  answer: "country_answers",
  comment: "country_experience_comments",
  warning: "country_warnings",
} as const;

export const MODERATION_STATUS_BY_ACTION = {
  hide: "hidden",
  remove: "removed",
  restore: "visible",
} as const;

type ModerationTarget = keyof typeof MODERATION_TARGET_TABLES;
type ModerationStatusAction = keyof typeof MODERATION_STATUS_BY_ACTION;
type ModerationAction = ModerationStatusAction | "close";

export type ModerationActionInput = {
  reportId: string | null;
  targetType: ModerationTarget;
  targetId: string;
  action: ModerationAction;
  reason: string | null;
};

export function canResetManagedPassword(actorRole: AdminRole, targetRole: unknown) {
  if (actorRole !== "admin" && actorRole !== "super_admin") return false;
  if (targetRole === "admin" || targetRole === "super_admin") {
    return actorRole === "super_admin";
  }
  return true;
}

export function parseModerationActionInput(value: unknown):
  | { ok: true; value: ModerationActionInput }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Geçersiz istek." };
  }

  const input = value as Record<string, unknown>;
  const targetType = typeof input.targetType === "string" ? input.targetType : "";
  const targetId = typeof input.targetId === "string" ? input.targetId.trim() : "";
  const action = typeof input.action === "string" ? input.action : "";
  const reportId = typeof input.reportId === "string" ? input.reportId.trim() : "";
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";

  if (!Object.hasOwn(MODERATION_TARGET_TABLES, targetType)) {
    return { ok: false, error: "Geçersiz hedef türü." };
  }
  if (!UUID_PATTERN.test(targetId)) {
    return { ok: false, error: "Geçersiz hedef kimliği." };
  }
  if (action !== "close" && !Object.hasOwn(MODERATION_STATUS_BY_ACTION, action)) {
    return { ok: false, error: "Geçersiz moderasyon işlemi." };
  }
  if (reportId && !UUID_PATTERN.test(reportId)) {
    return { ok: false, error: "Geçersiz rapor kimliği." };
  }
  if (action === "close" && !reportId) {
    return { ok: false, error: "Rapor kapatma işlemi için rapor kimliği gerekli." };
  }
  if (reason.length > 1000) {
    return { ok: false, error: "Açıklama en fazla 1000 karakter olabilir." };
  }

  return {
    ok: true,
    value: {
      reportId: reportId || null,
      targetType: targetType as ModerationTarget,
      targetId,
      action: action as ModerationAction,
      reason: reason || null,
    },
  };
}
