import { supabase } from "./supabase";
import type { AiPreview, ItineraryChangeLogRow } from "./types";

interface PreviewResponse {
  preview: AiPreview;
  conflicts: AiPreview["proposed_changes"]["conflicts"];
  summary: string;
  resolutionSuggestions?: AiPreview["proposed_changes"]["resolutionSuggestions"];
  error?: string;
}

async function callAiPreview(body: Record<string, unknown>): Promise<AiPreview> {
  const { data, error } = await supabase.functions.invoke<PreviewResponse>("ai-preview", { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  if (!data?.preview) throw new Error("No preview returned.");
  return data.preview;
}

/** §14 Flow 1: propose adding a stop found via place lookup. */
export async function requestAddStopPreview(params: {
  tripId: string;
  query?: string;
  placeId?: string;
  day?: string | null;
  planningStatus?: "planned" | "optional";
}): Promise<AiPreview> {
  return callAiPreview({ ...params, action: "add_stop" });
}

/** §14 Flow 2: propose removing/skipping a stop, with cascade conflict checks. */
export async function requestRemoveStopPreview(params: {
  tripId: string;
  eventId: string;
  mode?: "delete" | "skip";
}): Promise<AiPreview> {
  return callAiPreview({ ...params, action: "remove_stop" });
}

/** §14 Flow 3: propose retiming a stop, with cascade conflict checks. */
export async function requestEditTimePreview(params: {
  tripId: string;
  eventId: string;
  newDay?: string;
  newStartTime?: string;
  confirmAccommodationChange?: boolean;
}): Promise<AiPreview> {
  return callAiPreview({ ...params, action: "edit_time" });
}

/** Applies a pending preview — the actual event writes happen via the ai_previews_apply_on_confirm trigger. */
export async function confirmPreview(previewId: string): Promise<void> {
  const { error } = await supabase.from("ai_previews").update({ status: "confirmed" }).eq("id", previewId);
  if (error) throw error;
}

export async function discardPreview(previewId: string): Promise<void> {
  const { error } = await supabase.from("ai_previews").update({ status: "discarded" }).eq("id", previewId);
  if (error) throw error;
}

export async function listPendingPreviews(tripId: string): Promise<AiPreview[]> {
  const { data, error } = await supabase
    .from("ai_previews")
    .select("*")
    .eq("trip_id", tripId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listChangeHistory(tripId: string): Promise<ItineraryChangeLogRow[]> {
  const { data, error } = await supabase
    .from("itinerary_change_log")
    .select("*")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}
