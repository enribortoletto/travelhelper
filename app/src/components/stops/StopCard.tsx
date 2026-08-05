import { format } from "date-fns";
import { isPast } from "../../lib/status";
import type { Category, EventRow, Trip } from "../../lib/types";
import { Card } from "../ui/Card";

const STATUS_STYLE: Record<string, string> = {
  skipped: "bg-surface-2 text-text-secondary",
  in_progress: "bg-brand text-bg",
  done: "bg-surface-2 text-text-secondary",
  inactive: "bg-surface-2 text-text-secondary",
};

const STATUS_LABEL: Record<string, string> = {
  skipped: "Skipped",
  in_progress: "In Progress",
  done: "Done",
  inactive: "Inactive",
};

export function StopCard({
  stop,
  category,
  trip,
  onEdit,
  onDelete,
  onToggleSkip,
  onStartNow,
  onDelay,
}: {
  stop: EventRow;
  category?: Category;
  trip: Trip;
  onEdit: () => void;
  onDelete: () => void;
  onToggleSkip: () => void;
  onStartNow: () => void;
  onDelay?: () => void;
}) {
  // Conflict-resolution rule (06): Figma's 4th visual state, "done", is a
  // display-layer mapping of inactive + the past flag, not a stored status.
  const past = isPast({
    day: stop.day,
    startTime: stop.start_time,
    endTime: stop.end_time,
    timezone: trip.timezone,
  });
  const displayStatus = stop.status_runtime === "inactive" && past ? "done" : stop.status_runtime;

  return (
    <Card size="sm" className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="text-sm font-semibold text-text-primary">{stop.name}</p>
          <p className="text-xs text-text-secondary capitalize">
            {category?.name}
            {stop.day ? ` • ${format(new Date(stop.day), "d MMM")}` : ""}
            {stop.start_time ? ` • ${stop.start_time.slice(0, 5)}` : ""}
            {stop.start_time_label ? ` • ${stop.start_time_label}` : ""}
            {stop.planning_status === "optional" ? " • Optional" : ""}
          </p>
        </div>
        <span className={`shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-medium ${STATUS_STYLE[displayStatus]}`}>
          {STATUS_LABEL[displayStatus]}
        </span>
      </div>

      <div className="flex flex-wrap gap-3 text-xs font-semibold">
        <button onClick={onEdit} className="text-brand">
          Edit
        </button>
        <button onClick={onToggleSkip} className="text-text-secondary">
          {stop.is_skipped ? "Unskip" : "Skip"}
        </button>
        {stop.status_runtime === "inactive" && !stop.is_skipped && (
          <button onClick={onStartNow} className="text-text-secondary">
            Start Now
          </button>
        )}
        {onDelay && !stop.is_skipped && stop.start_time && (
          <button onClick={onDelay} className="text-text-secondary">
            Delay +15m
          </button>
        )}
        {stop.maps_link && (
          <a href={stop.maps_link} target="_blank" rel="noreferrer" className="text-brand">
            Navigate
          </a>
        )}
        <button onClick={onDelete} className="text-accent">
          Delete
        </button>
      </div>
    </Card>
  );
}
