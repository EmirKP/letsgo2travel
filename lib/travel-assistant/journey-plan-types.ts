import type { JourneyDiscoveryPlace } from './journey-types';

export type JourneyPlanLocale = 'tr' | 'en' | 'sq' | 'ro';
export type JourneyPlanInterest = 'city' | 'culture' | 'food' | 'shopping' | 'nature' | 'sea' | 'adventure';
export type JourneyPlanDestination = { name: string; latitude: number; longitude: number; sourceUrl?: string };
export type JourneyPlanPreferences = {
  party: 'solo' | 'couple' | 'friends' | 'family';
  budget: 'economical' | 'moderate' | 'comfortable';
  pace: 'relaxed' | 'balanced' | 'busy';
  walking: 'light' | 'standard';
  interests: JourneyPlanInterest[];
  notes: string;
};
export type JourneyPlanRequest = JourneyPlanPreferences & {
  /** Opt in to beach/hiking POIs. Omitted by legacy native clients. */
  placeCategoryVersion?: 2;
  destination: JourneyPlanDestination; dayCount: number; startDate?: string | null; firstDayStartTime?: string | null; locale: JourneyPlanLocale;
};
export type JourneyPlanDay = {
  day: number; theme: string; explanation: string;
  stops: { place: JourneyDiscoveryPlace; reason: string; durationMinutes: number }[];
};
export type JourneyPlanResult = {
  destination: JourneyPlanDestination; dayCount: number; startDate: string | null; firstDayStartTime?: string | null;
  preferences: JourneyPlanPreferences; locale: JourneyPlanLocale; summary: string; days: JourneyPlanDay[];
  generatedBy: 'ai'; fetchedAt: string; attribution: string; limitations: string[];
};
export type JourneyPlanErrorCode = 'plan_invalid' | 'plan_unavailable' | 'plan_busy' | 'plan_daily_capacity' | 'plan_request_too_large' | 'plan_limit' | 'plan_destination_unavailable'
  | 'plan_places_unavailable' | 'plan_insufficient_places' | 'plan_failed' | 'plan_timeout';
