import type { StravaAthlete } from "../stravaClient";

export interface GearListItem {
  id: string;
  type: "shoe" | "bike";
  name: string;
  nickname: string | null;
  distanceMeters: number;
  primary: boolean;
  retired: boolean;
}

type RawGear = {
  id: string;
  name: string;
  nickname?: string | null;
  primary: boolean;
  retired?: boolean;
  distance: number;
};

function mapGear(raw: RawGear, type: "shoe" | "bike"): GearListItem {
  return {
    id: raw.id,
    type,
    name: raw.name,
    nickname: raw.nickname ?? null,
    distanceMeters: raw.distance,
    primary: raw.primary,
    retired: raw.retired ?? false,
  };
}

/**
 * Flattens the shoes/bikes arrays from a detailed athlete profile into a
 * single typed gear list usable for display and gear assignment.
 */
export function projectAthleteGear(athlete: StravaAthlete): GearListItem[] {
  const shoes = (athlete.shoes ?? []).map((g) => mapGear(g as RawGear, "shoe"));
  const bikes = (athlete.bikes ?? []).map((g) => mapGear(g as RawGear, "bike"));
  return [...shoes, ...bikes];
}
