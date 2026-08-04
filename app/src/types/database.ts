export type EventCategory =
  | "alloggio"
  | "tappa"
  | "attivita"
  | "relax"
  | "trasporto"
  | "nota";

export type StatusPlan = "nel_piano" | "facoltativo";

export type Priority = "alta" | "media" | "bassa";

export type EventStatusRuntime = "non_attivo" | "in_corso" | "saltato";

/** Quale tratta del volo rappresenta l'evento (arrivo o partenza) — usato dalla edge function flight-status. */
export type FlightLeg = "departure" | "arrival";

export interface OpeningHours {
  // testo libero descrittivo (es. "09:00-17:00 (tutti i giorni)"), non un
  // oggetto strutturato per giorno: così è effettivamente popolato a DB.
  raw: string;
}

export interface EventRow {
  id: string;
  trip_id: string;
  day: string | null; // date, ISO yyyy-mm-dd
  category: EventCategory;
  name: string;
  status_plan: StatusPlan;
  start_time: string | null; // time, HH:MM:SS
  start_time_label: string | null;
  end_time: string | null;
  end_time_label: string | null;
  maps_place_id: string | null;
  maps_link: string | null;
  website: string | null;
  price: string | null;
  opening_hours: OpeningHours | null;
  description: string | null;
  contact: string | null;
  weather_dependent: boolean;
  priority: Priority | null;
  is_skipped: boolean;
  delay_minutes: number;
  // Tracciamento voli in tempo reale (edge function flight-status): valorizzati
  // solo per gli eventi-volo che vogliamo monitorare, es. "LH964" + "arrival".
  flight_number: string | null;
  flight_leg: FlightLeg | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TripRow {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  created_at: string;
}

export interface TripMemberRow {
  id: string;
  trip_id: string;
  user_id: string;
  display_name: string;
  joined_at: string;
}

export interface TripInviteRow {
  id: string;
  trip_id: string;
  email: string;
  invited_by: string | null;
  created_at: string;
}

export interface TripDayRow {
  trip_id: string;
  day: string;
  overnight_stay_event_id: string | null;
  summary: string | null;
}

export type ChangeType =
  | "aggiunta"
  | "rimozione"
  | "spostamento_orario"
  | "ritardo"
  | "altro";

export interface ItineraryChangeLogRow {
  id: string;
  trip_id: string;
  event_id: string | null;
  change_type: ChangeType;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  triggered_by_user: string | null;
  ai_preview_id: string | null;
  created_at: string;
}

export type AiPreviewStatus = "pending" | "confirmed" | "cancelled" | "expired";

export interface AiPreviewRow {
  id: string;
  trip_id: string;
  day: string | null;
  status: AiPreviewStatus;
  proposed_changes: Record<string, unknown>;
  summary: string | null;
  created_by: string | null;
  created_at: string;
  expires_at: string;
}

export interface NotificationPrefs {
  recap: boolean;
  promemoria_30: boolean;
  ritardo_5: boolean;
  ritardo_30: boolean;
  variazione_percorrenza: boolean;
}

export interface UserSettingsRow {
  user_id: string;
  trip_id: string;
  daily_recap_time: string;
  quiet_hours_start: string;
  quiet_hours_end: string;
  push_subscription: Record<string, unknown> | null;
  notification_prefs: NotificationPrefs;
  updated_at: string;
}

// Minimal Supabase Database shape used by the typed client.
export interface Database {
  public: {
    Tables: {
      trips: { Row: TripRow; Insert: Partial<TripRow>; Update: Partial<TripRow> };
      trip_members: {
        Row: TripMemberRow;
        Insert: Partial<TripMemberRow>;
        Update: Partial<TripMemberRow>;
      };
      trip_invites: {
        Row: TripInviteRow;
        Insert: Partial<TripInviteRow>;
        Update: Partial<TripInviteRow>;
      };
      events: { Row: EventRow; Insert: Partial<EventRow>; Update: Partial<EventRow> };
      trip_days: {
        Row: TripDayRow;
        Insert: Partial<TripDayRow>;
        Update: Partial<TripDayRow>;
      };
      itinerary_change_log: {
        Row: ItineraryChangeLogRow;
        Insert: Partial<ItineraryChangeLogRow>;
        Update: Partial<ItineraryChangeLogRow>;
      };
      ai_previews: {
        Row: AiPreviewRow;
        Insert: Partial<AiPreviewRow>;
        Update: Partial<AiPreviewRow>;
      };
      user_settings: {
        Row: UserSettingsRow;
        Insert: Partial<UserSettingsRow>;
        Update: Partial<UserSettingsRow>;
      };
    };
  };
}
