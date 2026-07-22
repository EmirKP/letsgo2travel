export type ExplorerLevelKey =
  | "new"
  | "traveler"
  | "experienced"
  | "master"
  | "world";

export type ExplorerExportFormat = "story" | "post" | "square";

export interface ExplorerPrivacy {
  showName: boolean;
  showRanking: boolean;
  showCountryList: boolean;
}

export interface ExplorerAchievement {
  id: string;
  title: string;
  detail: string;
  progress?: number;
  target?: number;
}

export interface ExplorerCardData {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  profileUrl: string;
  level: {
    key: ExplorerLevelKey;
    label: string;
    number: number;
  };
  stats: {
    verifiedCountries: number;
    visaFreeDiscoveries: number;
    continents: number;
    explorerPoints: number;
    leaguePercentile: number;
  };
  documentedTraveler: boolean;
  verifiedCountryNames: string[];
  achievements: ExplorerAchievement[];
  privacy: ExplorerPrivacy;
}

export interface ExplorerCardSaveResult {
  ok: boolean;
  message?: string;
}
