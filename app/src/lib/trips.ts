import { supabase } from "./supabase";
import { deriveRuntimeStatus, fallbackEndTime, getTodayString, shiftTime } from "./status";
import type { Category, EventRow, Trip, TripInvite, TripMember, TripRole, WeeklyOpeningHours } from "./types";

export interface TripWithMembership extends Trip {
  member: Pick<TripMember, "role" | "is_owner">;
}

export async function listMyTrips(): Promise<TripWithMembership[]> {
  const { data, error } = await supabase
    .from("trip_members")
    .select("role, is_owner, trips(*)")
    .order("joined_at", { ascending: false });

  if (error) throw error;

  return (data ?? [])
    .filter((row) => row.trips)
    .map((row) => ({
      ...(row.trips as unknown as Trip),
      member: { role: row.role, is_owner: row.is_owner },
    }));
}

export async function createTripWithOwner(params: {
  name: string;
  startDate: string;
  endDate: string;
  timezone: string;
  displayName: string;
}): Promise<Trip> {
  const { data, error } = await supabase.rpc("create_trip_with_owner", {
    p_name: params.name,
    p_start_date: params.startDate,
    p_end_date: params.endDate,
    p_timezone: params.timezone,
    p_display_name: params.displayName,
  });

  if (error) throw error;
  return data as Trip;
}

export async function listCategories(tripId: string): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("trip_id", tripId)
    .order("is_system", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export interface NewStopInput {
  trip_id: string;
  category_id: string;
  name: string;
  day: string | null;
  start_time: string | null;
  start_time_label: string | null;
  planning_status: "planned" | "optional";
  description?: string | null;
  price?: string | null;
  maps_link?: string | null;
  maps_place_id?: string | null;
  visit_duration_minutes?: number | null;
  opening_hours?: WeeklyOpeningHours | null;
  kitchen_closing_time?: string | null;
  check_in_window_start?: string | null;
  check_in_window_end?: string | null;
  checkout_deadline?: string | null;
}

export async function createStop(input: NewStopInput): Promise<EventRow> {
  const { data, error } = await supabase
    .from("events")
    .insert({ ...input, is_derived: false })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function listStops(tripId: string): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("trip_id", tripId)
    .order("day", { ascending: true, nullsFirst: false })
    .order("start_time", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return data ?? [];
}

export interface StopEditInput {
  category_id: string;
  name: string;
  day: string | null;
  start_time: string | null;
  end_time: string | null;
  start_time_label: string | null;
  planning_status: "planned" | "optional";
  price?: string | null;
  description?: string | null;
  website?: string | null;
  contact?: string | null;
  maps_link?: string | null;
  maps_place_id?: string | null;
  visit_duration_minutes?: number | null;
  opening_hours?: WeeklyOpeningHours | null;
  kitchen_closing_time?: string | null;
  check_in_window_start?: string | null;
  check_in_window_end?: string | null;
  checkout_deadline?: string | null;
}

export async function updateStop(stopId: string, input: Partial<StopEditInput>): Promise<EventRow> {
  const { data, error } = await supabase
    .from("events")
    .update(input)
    .eq("id", stopId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteStop(stopId: string): Promise<void> {
  const { error } = await supabase.from("events").delete().eq("id", stopId);
  if (error) throw error;
}

export async function setStopSkipped(stopId: string, isSkipped: boolean): Promise<EventRow> {
  return updateStop(stopId, { is_skipped: isSkipped } as Partial<StopEditInput>);
}

/**
 * §2 "start now": promotes an inactive stop to in_progress by writing real
 * day/start_time/end_time values (today, now, now + known duration or the
 * +1h fallback, clamped) — not a separate override flag.
 */
export async function startStopNow(
  stop: EventRow,
  timezone: string,
  visitDurationMinutes?: number | null,
): Promise<EventRow> {
  const now = new Date();
  const zonedNow = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
  const day = getTodayString(timezone, now);
  const startTime = `${String(zonedNow.getHours()).padStart(2, "0")}:${String(zonedNow.getMinutes()).padStart(2, "0")}:00`;

  let endTime: string;
  if (visitDurationMinutes) {
    const totalMinutes = zonedNow.getHours() * 60 + zonedNow.getMinutes() + visitDurationMinutes;
    const clamped = Math.min(totalMinutes, 24 * 60 - 1);
    endTime = `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}:00`;
  } else {
    endTime = fallbackEndTime(startTime);
  }

  return updateStop(stop.id, { day, start_time: startTime, end_time: endTime } as Partial<StopEditInput>);
}

/**
 * Manual "mark as delayed" quick action for the live status view (A4) —
 * shifts a timed stop's start/end forward by a fixed increment. This is a
 * stand-in for §11's real delay detection (live routing estimate vs. plan)
 * and the §14 cascade it would normally trigger on the stops after it —
 * both land in later build steps; for now it's a plain, direct time edit,
 * same shape as any other manual retime.
 */
export async function delayStop(stop: EventRow, minutes: number): Promise<EventRow> {
  if (!stop.start_time) throw new Error("Only stops with a set time can be marked delayed.");
  const start_time = shiftTime(stop.start_time, minutes);
  const end_time = stop.end_time ? shiftTime(stop.end_time, minutes) : fallbackEndTime(start_time);
  return updateStop(stop.id, { start_time, end_time } as Partial<StopEditInput>);
}

/**
 * §2: status must always be persisted, never recomputed only client-side.
 * Recompute each stop's status against "now" and write back only the ones
 * that actually changed (deduplicated — no write when nothing changed).
 */
export async function syncStopStatuses(stops: EventRow[], timezone: string): Promise<void> {
  const stale = stops.filter((stop) => {
    const computed = deriveRuntimeStatus({
      day: stop.day,
      startTime: stop.start_time,
      endTime: stop.end_time,
      isSkipped: stop.is_skipped,
      timezone,
    });
    return computed !== stop.status_runtime;
  });

  await Promise.all(
    stale.map((stop) =>
      supabase
        .from("events")
        .update({
          status_runtime: deriveRuntimeStatus({
            day: stop.day,
            startTime: stop.start_time,
            endTime: stop.end_time,
            isSkipped: stop.is_skipped,
            timezone,
          }),
        })
        .eq("id", stop.id),
    ),
  );
}

export async function createCategory(
  tripId: string,
  input: { name: string; color: string; icon?: string },
): Promise<Category> {
  const { data, error } = await supabase
    .from("categories")
    .insert({ trip_id: tripId, name: input.name, color: input.color, icon: input.icon ?? "map-pin" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateCategory(
  categoryId: string,
  input: Partial<Pick<Category, "name" | "color" | "icon">>,
): Promise<Category> {
  const { data, error } = await supabase
    .from("categories")
    .update(input)
    .eq("id", categoryId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteCategory(categoryId: string): Promise<void> {
  const { error } = await supabase.from("categories").delete().eq("id", categoryId);
  if (error) throw error;
}

export async function listTripMembers(tripId: string): Promise<TripMember[]> {
  const { data, error } = await supabase
    .from("trip_members")
    .select("*")
    .eq("trip_id", tripId);

  if (error) throw error;
  return data ?? [];
}

export async function createInvite(
  tripId: string,
  role: TripRole,
  invitedEmail?: string,
): Promise<TripInvite> {
  const { data, error } = await supabase
    .from("trip_invites")
    .insert({ trip_id: tripId, role, invited_email: invitedEmail ?? null })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function acceptInvite(token: string): Promise<TripMember> {
  const { data, error } = await supabase.rpc("accept_trip_invite", { p_token: token });
  if (error) throw error;
  return data as TripMember;
}
