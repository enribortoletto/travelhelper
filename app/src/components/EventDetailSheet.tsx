import { useState } from "react";
import {
  ChevronLeft,
  ExternalLink,
  Pencil,
  Trash2,
  Clock,
  CalendarDays,
  CloudSun,
  Phone,
  Globe,
  Share2,
  Star,
  Navigation,
} from "lucide-react";
import { CATEGORY_CONFIG } from "@/lib/categories";
import { formatDayLong, formatTime } from "@/lib/day";
import { buildDirectionsUrl } from "@/lib/maps-deeplink";
import { useToast } from "@/lib/toast-context";
import { usePlaceDetails } from "@/hooks/usePlaceDetails";
import { useDistanceFromMe } from "@/hooks/useDistanceFromMe";
import { useStubbedAiActions } from "@/hooks/useStubbedAiActions";
import { shareEvent } from "@/lib/share";
import type { EventRow } from "@/types/database";

interface EventDetailSheetProps {
  event: EventRow;
  onClose: () => void;
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={13}
          className={i < Math.round(rating) ? "fill-[var(--text)] text-[var(--text)]" : "text-[var(--border)]"}
        />
      ))}
    </span>
  );
}

export default function EventDetailSheet({ event, onClose }: EventDetailSheetProps) {
  const config = CATEGORY_CONFIG[event.category];
  const Icon = config.icon;
  const directionsUrl = buildDirectionsUrl(event);
  const ai = useStubbedAiActions();
  const { showToast } = useToast();

  const details = usePlaceDetails(event.maps_place_id);
  const { result: distance, status: distanceStatus } = useDistanceFromMe(event.maps_place_id);
  const [shareState, setShareState] = useState<"idle" | "sharing">("idle");
  // Descrizioni lunghe (es. da Places API) vengono troncate a 2 righe con un
  // link "Leggi tutto" per espanderle, come nel design Figma.
  const [descExpanded, setDescExpanded] = useState(false);
  const DESCRIPTION_TRUNCATE_LENGTH = 140;

  const start = formatTime(event.start_time) ?? event.start_time_label;
  const end = formatTime(event.end_time) ?? event.end_time_label;

  async function handleShare() {
    if (!directionsUrl) return;
    setShareState("sharing");
    const outcome = await shareEvent(event.name, directionsUrl, event.description ?? undefined);
    setShareState("idle");
    if (outcome === "copied") showToast("Link copiato negli appunti");
    if (outcome === "failed") showToast("Non sono riuscito a condividere");
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[var(--bg)]">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* hero-photo a piena larghezza con back/condividi in overlay e nome
            in basso, come nel Figma (niente più barra header separata). */}
        <div className="relative h-[280px] w-full shrink-0 bg-[var(--bg-elevated)]">
          {details?.photoUrl ? (
            <img src={details.photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center" style={{ background: config.color }}>
              <Icon size={56} className="text-white/70" strokeWidth={1.5} />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/60" />

          <button
            type="button"
            onClick={onClose}
            className="absolute top-[76px] left-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
            aria-label="Chiudi"
          >
            <ChevronLeft size={20} />
          </button>
          {directionsUrl && (
            <button
              type="button"
              onClick={handleShare}
              disabled={shareState === "sharing"}
              className="absolute top-[76px] right-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
              aria-label="Condividi"
            >
              <Share2 size={18} />
            </button>
          )}

          <p className="absolute right-16 bottom-3 left-4 truncate text-lg font-semibold text-white">
            {event.name}
          </p>
        </div>

        {/* category-rating-row */}
        <div className="flex items-center gap-2 px-5 pt-3 pb-4 text-xs">
          <span
            className="flex items-center gap-1.5 rounded-full bg-[var(--bg)] px-2.5 py-1 font-bold text-[11px] uppercase shadow-card"
            style={{ color: config.color }}
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: config.color }} />
            {config.label}
          </span>
          {details?.rating && (
            <span className="flex items-center gap-1.5 text-[13px] text-[var(--text-muted)]">
              <RatingStars rating={details.rating} />
              <span className="font-semibold text-[var(--text)]">{details.rating.toFixed(1)}</span>
              {details.userRatingCount && `(${details.userRatingCount})`}
            </span>
          )}
          {details?.isOpenNow !== null && details?.isOpenNow !== undefined && (
            <span
              className={details.isOpenNow ? "font-semibold text-[var(--text)]" : "font-medium text-[var(--text-muted)]"}
            >
              {details.isOpenNow ? "Aperto ora" : "Chiuso ora"}
            </span>
          )}
        </div>

        <dl className="space-y-4 px-5 py-3 text-sm">
          {/* core-info: colonna data/ora + colonna distanza, ognuna con
              l'icona in un cerchio (icon-wrap) come nel Figma. */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--bg-elevated)]">
                <CalendarDays size={18} className="text-[var(--text-muted)]" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[var(--text)] capitalize">
                  {event.day ? formatDayLong(event.day) : "Giorno da assegnare"}
                </p>
                <p className="truncate text-[var(--text-muted)]">
                  {start ?? "orario da definire"}
                  {end ? ` - ${end}` : ""}
                </p>
              </div>
            </div>

            {distanceStatus === "done" && distance && (
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--bg-elevated)]">
                  <Navigation size={18} className="text-[var(--text-muted)]" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[var(--text)]">{distance.distanceText} da qui</p>
                  <p className="truncate text-[var(--text-muted)]">{distance.durationText} in auto</p>
                </div>
              </div>
            )}
          </div>

          {event.delay_minutes > 0 && (
            <p className="font-medium text-[var(--cat-relax)]">
              Segnalato in ritardo di {event.delay_minutes} min
            </p>
          )}

          {event.description && (
            <div>
              <p className="text-pretty text-[var(--text)]">
                {descExpanded || event.description.length <= DESCRIPTION_TRUNCATE_LENGTH
                  ? event.description
                  : `${event.description.slice(0, DESCRIPTION_TRUNCATE_LENGTH).trimEnd()}…`}
              </p>
              {event.description.length > DESCRIPTION_TRUNCATE_LENGTH && (
                <button
                  type="button"
                  onClick={() => setDescExpanded((v) => !v)}
                  className="mt-1 text-sm font-medium text-[var(--primary)]"
                >
                  {descExpanded ? "Mostra meno" : "Leggi tutto"}
                </button>
              )}
            </div>
          )}

          {event.price && (
            <div className="flex items-center gap-3">
              <span className="w-[18px] shrink-0 text-center text-[var(--text-muted)]">€</span>
              <span className="text-[var(--text)]">{event.price}</span>
            </div>
          )}

          {event.opening_hours && "raw" in event.opening_hours && (
            <div className="flex items-start gap-3">
              <Clock size={18} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
              <span className="text-[var(--text)]">{String(event.opening_hours.raw)}</span>
            </div>
          )}

          {event.contact && (
            <div className="flex items-center gap-3">
              <Phone size={18} className="shrink-0 text-[var(--text-muted)]" />
              <a href={`tel:${event.contact}`} className="text-[var(--primary)] underline">
                {event.contact}
              </a>
            </div>
          )}

          {event.website && (
            <div className="flex items-center gap-3">
              <Globe size={18} className="shrink-0 text-[var(--text-muted)]" />
              <a
                href={event.website}
                target="_blank"
                rel="noreferrer"
                className="truncate text-[var(--primary)] underline"
              >
                {event.website}
              </a>
            </div>
          )}

          {event.weather_dependent && (
            <div className="flex items-center gap-3">
              <CloudSun size={18} className="shrink-0 text-[var(--text-muted)]" />
              <span className="text-[var(--text)]">Dipende dal meteo</span>
            </div>
          )}

          {event.status_plan === "facoltativo" && (
            <div className="flex items-center gap-2 text-xs">
              <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1 font-medium text-[var(--text-muted)]">
                Facoltativo
              </span>
              {event.priority && (
                <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1 font-medium text-[var(--text-muted)] capitalize">
                  Priorità {event.priority}
                </span>
              )}
            </div>
          )}
        </dl>
      </div>

      <div className="flex flex-col gap-2 border-t border-[var(--border)] p-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={ai.edit}
            aria-label="Modifica"
            title="Modifica"
            className="flex shrink-0 items-center justify-center rounded-[14px] border border-[var(--text)] p-3 text-[var(--text)] transition-colors hover:bg-[var(--border)]"
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            onClick={ai.markLate}
            aria-label="In ritardo"
            title="In ritardo"
            className="flex shrink-0 items-center justify-center rounded-[14px] border border-[var(--text)] p-3 text-[var(--text)] transition-colors hover:bg-[var(--border)]"
          >
            <Clock size={16} />
          </button>
          {directionsUrl && (
            <a
              href={directionsUrl}
              target="_blank"
              rel="noreferrer"
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] px-6 py-3 text-sm font-semibold text-white shadow-card transition-colors hover:brightness-110"
            >
              <ExternalLink size={16} /> Apri in Google Maps
            </a>
          )}
        </div>
        <button
          type="button"
          onClick={ai.remove}
          className="flex w-full items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-[var(--danger)] transition-colors hover:bg-[var(--border)]"
        >
          <Trash2 size={16} /> Elimina
        </button>
      </div>
    </div>
  );
}
