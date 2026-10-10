type PriceAlertPreferences = { email: boolean; push: boolean };

/** Cache per cron run, not across users or runs. A missing row means defaults;
 * only a not-yet-deployed table may fall back during a staged rollout. */
export function priceAlertPreferenceReader(supabase: any) {
  const cache = new Map<string, Promise<PriceAlertPreferences>>();
  return (userId: string | null | undefined): Promise<PriceAlertPreferences> => {
    if (!userId) return Promise.resolve({ email: true, push: true });
    let result = cache.get(userId);
    if (!result) {
      result = (async () => {
        const { data, error } = await supabase.from("community_notification_preferences")
          .select("price_alert_email, price_alert_push").eq("user_id", userId).limit(1);
        if (error) {
          if (["42P01", "PGRST205"].includes(error.code)) return { email: true, push: true };
          // A transient failure must not bypass an existing opt-out.
          return { email: false, push: false };
        }
        const preferences = data?.[0];
        return { email: preferences?.price_alert_email !== false, push: preferences?.price_alert_push !== false };
      })();
      cache.set(userId, result);
    }
    return result;
  };
}
