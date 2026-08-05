import { supabase } from "./supabase";
import type { Category, EventRow, Trip, TripInvite, TripMember, TripRole } from "./types";

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
