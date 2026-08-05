import { getTodayString, isPast } from "../../lib/status";
import { StopCard } from "../../components/stops/StopCard";
import { Card } from "../../components/ui/Card";
import type { Category, EventRow, Trip } from "../../lib/types";

export function TodayView({
  trip,
  stops,
  categories,
  onEdit,
  onDelete,
  onToggleSkip,
  onStartNow,
  onDelay,
}: {
  trip: Trip;
  stops: EventRow[];
  categories: Category[];
  onEdit: (stop: EventRow) => void;
  onDelete: (stop: EventRow) => void;
  onToggleSkip: (stop: EventRow) => void;
  onStartNow: (stop: EventRow) => void;
  onDelay: (stop: EventRow) => void;
}) {
  const todayStr = getTodayString(trip.timezone);
  const todays = stops.filter((s) => !s.is_derived && s.day === todayStr);

  const current = todays.filter((s) => s.status_runtime === "in_progress");
  const upcoming = todays
    .filter(
      (s) =>
        s.status_runtime === "inactive" &&
        !s.is_skipped &&
        !isPast({ day: s.day, startTime: s.start_time, endTime: s.end_time, timezone: trip.timezone }),
    )
    .sort((a, b) => (a.start_time ?? "99:99:99").localeCompare(b.start_time ?? "99:99:99"));
  const earlier = todays.filter((s) => s.is_skipped || (s.status_runtime === "inactive" && !upcoming.includes(s)));

  function categoryFor(stop: EventRow) {
    return categories.find((c) => c.id === stop.category_id);
  }

  const cardProps = (stop: EventRow) => ({
    stop,
    trip,
    category: categoryFor(stop),
    onEdit: () => onEdit(stop),
    onDelete: () => onDelete(stop),
    onToggleSkip: () => onToggleSkip(stop),
    onStartNow: () => onStartNow(stop),
    onDelay: () => onDelay(stop),
  });

  return (
    <div className="flex flex-col gap-4">
      {todays.length === 0 && (
        <Card>
          <p className="text-sm text-text-secondary">Nothing scheduled today.</p>
        </Card>
      )}

      {current.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
            Happening now
          </p>
          {current.map((stop) => (
            <StopCard key={stop.id} {...cardProps(stop)} />
          ))}
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
            Up next
          </p>
          {upcoming.map((stop) => (
            <StopCard key={stop.id} {...cardProps(stop)} />
          ))}
        </div>
      )}

      {earlier.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
            Earlier today
          </p>
          {earlier.map((stop) => (
            <StopCard key={stop.id} {...cardProps(stop)} />
          ))}
        </div>
      )}
    </div>
  );
}
