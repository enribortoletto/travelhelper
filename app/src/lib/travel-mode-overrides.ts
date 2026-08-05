import { supabase } from "./supabase";
import type { TravelMode, TravelModeOverride } from "./types";

export async function listTravelModeOverrides(tripId: string): Promise<TravelModeOverride[]> {
  const { data, error } = await supabase.from("travel_mode_overrides").select("*").eq("trip_id", tripId);
  if (error) throw error;
  return data ?? [];
}

export async function createTravelModeOverride(
  tripId: string,
  input: { placeIdA: string; placeIdB: string; mode: TravelMode; note?: string },
): Promise<TravelModeOverride> {
  const { data, error } = await supabase
    .from("travel_mode_overrides")
    .insert({ trip_id: tripId, place_id_a: input.placeIdA, place_id_b: input.placeIdB, mode: input.mode, note: input.note ?? null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTravelModeOverride(id: string): Promise<void> {
  const { error } = await supabase.from("travel_mode_overrides").delete().eq("id", id);
  if (error) throw error;
}
