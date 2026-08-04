import { useDrivingTime } from "@/hooks/useDrivingTime";
import { TRAVEL_MODE_ICON, TRAVEL_MODE_LABEL } from "@/lib/travel-mode";

interface DrivingTimeConnectorProps {
  fromPlaceId: string | null;
  toPlaceId: string | null;
}

export default function DrivingTimeConnector({ fromPlaceId, toPlaceId }: DrivingTimeConnectorProps) {
  const result = useDrivingTime(fromPlaceId, toPlaceId);
  if (!result) return null;
  const Icon = TRAVEL_MODE_ICON[result.mode];

  return (
    <div className="flex items-center gap-2 py-0.5 pl-4 text-xs text-[var(--text-muted)]">
      <Icon size={13} className="shrink-0" />
      {result.text} {TRAVEL_MODE_LABEL[result.mode]}
    </div>
  );
}
