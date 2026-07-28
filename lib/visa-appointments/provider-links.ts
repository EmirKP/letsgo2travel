export const PROVIDER_ACTION_URLS: Record<string, string> = {
  idata: "https://de-tr-appointment.idata.com.tr/tr",
};

export function getProviderActionUrl(providerCode: string | null | undefined) {
  if (!providerCode) return null;
  return PROVIDER_ACTION_URLS[providerCode] || null;
}
