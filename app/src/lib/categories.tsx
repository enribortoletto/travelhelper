import {
  BedDouble,
  MapPin,
  Compass,
  Coffee,
  Car,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import type { EventCategory } from "@/types/database";

interface CategoryConfig {
  label: string;
  color: string; // CSS var, per lo stile dell'app
  hex: string; // stesso colore in hex, per i marker della mappa (Google Maps non legge le CSS var)
  icon: LucideIcon;
}

export const CATEGORY_CONFIG: Record<EventCategory, CategoryConfig> = {
  alloggio: { label: "Alloggio", color: "var(--cat-alloggio)", hex: "#ae2012", icon: BedDouble },
  tappa: { label: "Tappa", color: "var(--cat-tappa)", hex: "#378268", icon: MapPin },
  attivita: { label: "Attività", color: "var(--cat-attivita)", hex: "#a26900", icon: Compass },
  relax: { label: "Relax", color: "var(--cat-relax)", hex: "#8c7123", icon: Coffee },
  trasporto: { label: "Trasporto", color: "var(--cat-trasporto)", hex: "#098083", icon: Car },
  nota: { label: "Nota", color: "var(--cat-nota)", hex: "#001219", icon: StickyNote },
};

export const CATEGORY_ORDER: EventCategory[] = [
  "alloggio",
  "tappa",
  "attivita",
  "relax",
  "trasporto",
  "nota",
];

/**
 * Stile "badge pill" in stile HyperUI (sfondo pastello + testo colorato)
 * derivato dal colore solido della categoria invece di curare manualmente
 * una tinta pastello per ognuna.
 */
export function categoryBadgeStyle(category: EventCategory): CSSProperties {
  const { color } = CATEGORY_CONFIG[category];
  return { background: `color-mix(in srgb, ${color} 12%, transparent)`, color };
}
