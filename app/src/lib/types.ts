export type TripRole = "admin" | "editor" | "viewer";
export type PlanningStatus = "planned" | "optional";
export type EventStatus = "inactive" | "in_progress" | "skipped";

export interface Trip {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  timezone: string;
  created_by: string;
  created_at: string;
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
  is_derived: boolean;
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
