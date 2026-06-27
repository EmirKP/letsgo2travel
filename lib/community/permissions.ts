import { SupabaseClient } from "@supabase/supabase-js";

export interface CountryPermissions {
  canAnswer: boolean;
  canComment: boolean;
  canCreateWarning: boolean;
}

export async function getCountryPermission(
  supabase: SupabaseClient,
  userId: string,
  countryCode: string
): Promise<CountryPermissions> {
  if (!userId || !countryCode) {
    return { canAnswer: false, canComment: false, canCreateWarning: false };
  }

  const { data, error } = await supabase
    .from('country_experience_permissions')
    .select('can_answer, can_comment, can_create_warning')
    .eq('user_id', userId)
    .eq('country_code', countryCode)
    .maybeSingle();

  if (error || !data) {
    return { canAnswer: false, canComment: false, canCreateWarning: false };
  }

  return {
    canAnswer: data.can_answer || false,
    canComment: data.can_comment || false,
    canCreateWarning: data.can_create_warning || false
  };
}
