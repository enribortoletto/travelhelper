import { Car, Footprints, Bus, type LucideIcon } from "lucide-react";
import type { TravelMode } from "@/hooks/useDrivingTime";

export const TRAVEL_MODE_ICON: Record<TravelMode, LucideIcon> = {
  driving: Car,
  walking: Footprints,
  transit: Bus,
};

export const TRAVEL_MODE_LABEL: Record<TravelMode, string> = {
  driving: "di guida",
  walking: "a piedi",
  transit: "con mezzi pubblici",
};
