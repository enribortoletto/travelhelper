import { NavLink } from "react-router-dom";
import { Home, Map, CalendarDays, Settings } from "lucide-react";
import clsx from "clsx";

const TABS = [
  { to: "/", label: "Oggi", icon: Home },
  { to: "/viaggio", label: "Viaggio", icon: Map },
  { to: "/calendario", label: "Calendario", icon: CalendarDays },
  { to: "/impostazioni", label: "Impostazioni", icon: Settings },
];

// Pillola flottante senza etichette testuali (component Figma "bottom-nav",
// node 55:10654: absolute, bottom-[12px], w-[343px], h-[56px], rounded-[32px],
// bg rgba(245,245,247,0.2) + blur — un vero overlay in vetro smerigliato sopra
// il contenuto che scorre sotto, non una barra in-flow. L'icona attiva si
// colora di verde primario, le altre restano nel colore testo).
export default function BottomNav() {
  return (
    <nav
      className="fixed inset-x-4 flex h-14 items-center rounded-[32px] bg-[var(--bg-elevated)]/20 shadow-card backdrop-blur-lg"
      style={{ bottom: "calc(12px + env(safe-area-inset-bottom))", zIndex: 30 }}
    >
      {TABS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          aria-label={label}
          className={({ isActive }) =>
            clsx(
              "flex h-full flex-1 items-center justify-center transition-colors",
              isActive ? "text-[var(--primary)]" : "text-[var(--text)]",
            )
          }
        >
          <Icon size={22} strokeWidth={1.75} />
        </NavLink>
      ))}
    </nav>
  );
}
