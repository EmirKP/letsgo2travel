import type { ReactNode } from "react";
import type { AppLocale } from "../lib/locale";
import { ForumTranslation } from "./ForumTranslation";
import { useI18n } from "../lib/i18n";
import { localizeQuotedJourneyInterests } from "../../../lib/travel-assistant/journey-plan-labels";

/** Display only: never replace saved prose or editable notes with a translation. */
export function RouteTranslation({ text, sourceLocale, accessToken = "", children }: {
  text: string; sourceLocale?: AppLocale; accessToken?: string; children?: (display: string) => ReactNode;
}) {
  const { locale } = useI18n();
  if (!text) return null;
  return <ForumTranslation text={localizeQuotedJourneyInterests(text, sourceLocale || locale)} sourceLocale={sourceLocale} accessToken={accessToken} inline>{children}</ForumTranslation>;
}
