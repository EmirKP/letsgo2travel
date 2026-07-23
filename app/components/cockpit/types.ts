export type TripStatus = "upcoming" | "active" | "completed" | "cancelled";

export type ChecklistCategory =
  | "documents"
  | "health"
  | "technology"
  | "luggage"
  | "other";

export interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  category: ChecklistCategory;
  createdAt: string;
}

export interface Trip {
  id: string;
  userId: string;
  destinationCountry: string;
  destinationCode: string;
  destinationCity: string | null;
  startDate: string;
  endDate: string;
  departureAt: string | null;
  flightPnr: string | null;
  checklistItems: ChecklistItem[];
  status: TripStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTripInput {
  destinationCountry: string;
  destinationCode: string;
  destinationCity?: string;
  startDate: string;
  endDate: string;
  departureTime?: string;
  flightPnr?: string;
}

export interface DestinationInfo {
  countryCode: string;
  countryName: string;
  currencyCode: string;
  currencyLabel: string;
  mockRateText: string;
  plugTypes: string[];
  voltage: string;
  emergency: {
    general: string;
    police?: string;
    ambulance?: string;
  };
  timezone: string;
  language: string;
  quickTip: string;
}
