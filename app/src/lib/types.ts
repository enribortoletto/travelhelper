export type TripRole = "admin" | "editor" | "viewer";
export type PlanningStatus = "planned" | "optional";
export type EventStatus = "inactive" | "in_progress" | "skipped";
export type TravelMode = "driving" | "walking" | "transit";
export type DerivedKind = "transit" | "checkin" | "checkout";
export type FlightLeg = "departure" | "arrival";

export interface Trip {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  timezone: string;
  default_day_start: string;
  calendar_token: string;
  created_by: string;
  created_at: string;
}

export type WeeklyOpeningHours = Record<string, { open: string; close: string } | undefined>;

export interface TravelModeOverride {
  id: string;
  trip_id: string;
  place_id_a: string;
  place_id_b: string;
  mode: TravelMode;
  note: string | null;
}

export interface TripMember {
  trip_id: string;
  user_id: string;
  role: TripRole;
  is_owner: boolean;
  display_name: string;
  joined_at: string;
}

export interface Category {
  id: string;
  trip_id: string;
  name: string;
  color: string;
  icon: string;
  is_system: boolean;
}

export interface EventRow {
  id: string;
  trip_id: string;
  category_id: string;
  day: string | null;
  name: string;
  planning_status: PlanningStatus | null;
  is_skipped: boolean;
  status_runtime: EventStatus;
  start_time: string | null;
  end_time: string | null;
  start_time_label: string | null;
  end_time_label: string | null;
  description: string | null;
  price: string | null;
  visit_duration_minutes: number | null;
  maps_place_id: string | null;
  maps_link: string | null;
  opening_hours: WeeklyOpeningHours | null;
  kitchen_closing_time: string | null;
  check_in_window_start: string | null;
  check_in_window_end: string | null;
  checkout_deadline: string | null;
  is_derived: boolean;
  derived_kind: DerivedKind | null;
  transit_from_event_id: string | null;
  transit_to_event_id: string | null;
  checkin_for_event_id: string | null;
  checkout_for_event_id: string | null;
  flight_number: string | null;
  flight_leg: FlightLeg | null;
  delay_minutes: number;
}

export interface NotificationPrefs {
  recap: boolean;
  reminder_before_start: boolean;
  short_delay: boolean;
  long_delay: boolean;
  travel_time_variation: boolean;
}

export interface UserSettings {
  user_id: string;
  trip_id: string;
  daily_recap_time: string;
  quiet_hours_start: string;
  quiet_hours_end: string;
  push_subscription: object | null;
  notification_prefs: NotificationPrefs;
}

export interface NotificationLogRow {
  id: string;
  trip_id: string;
  user_id: string;
  notification_type: string;
  event_id: string | null;
  day: string | null;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export type AiPreviewStatus = "pending" | "confirmed" | "discarded";

export interface AiPreview {
  id: string;
  trip_id: string;
  day: string | null;
  proposed_changes: {
    flow: "add_stop" | "remove_stop" | "edit_time";
    day: string | null;
    summary: string;
    conflicts: { kind: string; message: string; eventId?: string }[];
    resolutionSuggestions?: { type: string; eventId: string; name: string }[];
    creates?: Record<string, unknown>[];
    updates?: { event_id: string; changes: Record<string, unknown>; old?: Record<string, unknown> }[];
    deletes?: { event_id: string; mode: "delete" | "skip" }[];
  };
  created_by: string;
  status: AiPreviewStatus;
  created_at: string;
}

export interface ItineraryChangeLogRow {
  id: string;
  trip_id: string;
  event_id: string | null;
  change_type: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  triggered_by_user: string | null;
  ai_preview_id: string | null;
  created_at: string;
}

export interface TripInvite {
  id: string;
  trip_id: string;
  role: TripRole;
  token: string;
  invited_email: string | null;
  created_by: string;
  created_at: string;
  expires_at: string | null;
}
