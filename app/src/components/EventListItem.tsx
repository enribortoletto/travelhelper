import clsx from "clsx";
import { Check } from "lucide-react";
import { CATEGORY_CONFIG, categoryBadgeStyle } from "@/lib/categories";
import { formatTime } from "@/lib/day";
import { computeEventStatus, isEventPast } from "@/lib/event-status";
import type { EventRow } from "@/types/database";

interface EventListItemProps {
  event: EventRow;
  now: Date;
  onClick: () => void;
}

export default function EventListItem({ event, now, onClick }: EventListItemProps) {
  const config = CATEGORY_CONFIG[event.category];
  const Icon = config.icon;
  const status = computeEventStatus(event, now);
  const time = formatTime(event.start_time) ?? event.start_time_label;
  const showMiniInfo = event.category === "attivita" || event.category === "relax";
  const past = status !== "saltato" && isEventPast(event, now);
  const miniInfo =
    (showMiniInfo && event.price) ||
    (showMiniInfo && event.opening_hours && "raw" in event.opening_hours
      ? String(event.opening_hours.raw)
      : null);

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-3.5 rounded-[20px] border bg-[var(--bg-elevated)] p-4 text-left shadow-card transition-colors",
        status === "in_corso" ? "border-transparent ring-2 ring-offset-0" : "border-[var(--border)]",
        event.status_plan === "facoltativo" && "opacity-70",
        status === "saltato" && "opacity-60",
      )}
      style={status === "in_corso" ? ({ "--tw-ring-color": config.color } as React.CSSProperties) : undefined}
    >
      <span className="relative shrink-0">
        <span
          className={clsx(
            "flex h-10 w-10 items-center justify-center rounded-[14px] bg-[var(--bg)] transition-opacity",
            past && "opacity-50",
          )}
        >
          <Icon size={20} style={{ color: config.color }} strokeWidth={2.2} />
        </span>
        {past && (
          <span
            className="absolute -right-1 -bottom-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-[var(--bg-elevated)] bg-[var(--primary)]"
            aria-label="Vissuta"
            title="Vissuta"
          >
            <Check size={9} strokeWidth={3.5} className="text-white" />
          </span>
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span
          className="block truncate text-xs font-bold whitespace-nowrap"
          style={{ color: config.color }}
        >
          {config.label}
          {time && ` · ${time}`}
          {event.delay_minutes > 0 && (
            <span className="font-semibold text-[var(--text)]"> · +{event.delay_minutes} min</span>
          )}
        </span>
        <span
          className={clsx(
            "block truncate text-sm font-semibold text-[var(--text)]",
            status === "saltato" && "line-through",
          )}
        >
          {event.name}
        </span>
        {miniInfo && (
          <span className="block truncate text-xs text-[var(--text-muted)]">{miniInfo}</span>
        )}
      </span>

      {status === "in_corso" ? (
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap"
          style={categoryBadgeStyle(event.category)}
        >
          In corso
        </span>
      ) : (
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: config.color }}
          aria-hidden
        />
      )}
    </button>
  );
}
