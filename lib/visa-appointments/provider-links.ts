import { getProviderPlatform } from "./providers";

export function getProviderActionUrl(providerCode: string | null | undefined) {
  return getProviderPlatform(providerCode)?.officialUrl || null;
}
