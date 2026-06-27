import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SavedTrip = {
  id: string;
  type: "flight" | "country" | "ai_plan";
  title: string;
  subtitle: string;
  url: string;
  savedAt: number;
};

type TripStore = {
  savedTrips: SavedTrip[];
  addTrip: (trip: Omit<SavedTrip, "id" | "savedAt">) => void;
  removeTrip: (id: string) => void;
};

export const useTripStore = create<TripStore>()(
  persist(
    (set) => ({
      savedTrips: [],
      addTrip: (trip) =>
        set((state) => ({
          savedTrips: [
            { ...trip, id: Math.random().toString(36).substr(2, 9), savedAt: Date.now() },
            ...state.savedTrips,
          ],
        })),
      removeTrip: (id) =>
        set((state) => ({
          savedTrips: state.savedTrips.filter((t) => t.id !== id),
        })),
    }),
    {
      name: "l2t-trip-storage",
    }
  )
);
