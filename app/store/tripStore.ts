import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SavedTrip = {
  id: string;
  type: "flight" | "country" | "ai_plan";
  title: string;
  subtitle: string;
  url: string;
  image?: string;
  savedAt: number;
};

type TripStore = {
  savedTrips: SavedTrip[];
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  addTrip: (trip: Omit<SavedTrip, "id" | "savedAt">) => void;
  removeTrip: (id: string) => void;
  clearTrips: () => void;
};

export const useTripStore = create<TripStore>()(
  persist(
    (set) => ({
      savedTrips: [],
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      addTrip: (trip) =>
        set((state) => {
          const existing = state.savedTrips.find((savedTrip) => savedTrip.url === trip.url && savedTrip.title === trip.title);
          if (existing) {
            return {
              savedTrips: [
                { ...existing, ...trip, savedAt: Date.now() },
                ...state.savedTrips.filter((savedTrip) => savedTrip.id !== existing.id),
              ],
            };
          }

          return {
            savedTrips: [
              {
                ...trip,
                id: globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 11),
                savedAt: Date.now(),
              },
              ...state.savedTrips,
            ],
          };
        }),
      removeTrip: (id) =>
        set((state) => ({
          savedTrips: state.savedTrips.filter((trip) => trip.id !== id),
        })),
      clearTrips: () => set({ savedTrips: [] }),
    }),
    {
      name: "l2t-trip-storage",
      version: 2,
      partialize: (state) => ({ savedTrips: state.savedTrips }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
