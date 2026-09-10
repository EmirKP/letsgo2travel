export type SupportDraft = { email: string; subject: string; body: string };
export type MailDraftResult = "handoff" | "unavailable";

export function createSupportDraft(email: string, appVersion: string, buildNumber: string, locale: "tr" | "en"): SupportDraft {
  return {
    email,
    subject: locale === "tr" ? "LetsGo2Travel destek talebi" : "LetsGo2Travel support request",
    body: locale === "tr"
      ? `Yaşadığım sorun:\n\n\nUygulama: ${appVersion}\nBuild: ${buildNumber}`
      : `The problem I am experiencing:\n\n\nApp: ${appVersion}\nBuild: ${buildNumber}`,
  };
}

export function supportMailto(draft: SupportDraft): string {
  // Only one plain address is accepted; URI/header syntax cannot add recipients.
  const email = draft.email.trim();
  if (!/^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return "";
  const subject = draft.subject.replace(/[\r\n]/g, " ").slice(0, 180);
  const body = draft.body.slice(0, 6000);
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function supportDraftText(draft: SupportDraft): string {
  return `${draft.email}\n${draft.subject}\n\n${draft.body}`;
}

/** A system handoff cannot confirm that a mail account is installed or a message was sent. */
export function handoffMailDraft(draft: SupportDraft, navigate: (url: string) => void): MailDraftResult {
  const url = supportMailto(draft);
  if (!url) return "unavailable";
  try {
    navigate(url);
    return "handoff";
  } catch {
    return "unavailable";
  }
}
