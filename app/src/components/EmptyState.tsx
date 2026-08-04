interface EmptyStateProps {
  variant?: "calendar" | "compass";
  title: string;
  description?: string;
}

/**
 * Illustrazione vettoriale leggera per gli stati vuoti (nessun evento nel
 * giorno, ecc.), al posto del solo testo. Disegnata a mano in SVG per
 * restare coerente con la palette dell'app senza dipendere da asset esterni.
 */
export default function EmptyState({ variant = "calendar", title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      {variant === "calendar" ? (
        <svg width="120" height="120" viewBox="0 0 120 120" fill="none" aria-hidden>
          <rect x="20" y="28" width="80" height="72" rx="10" fill="var(--bg-elevated)" stroke="var(--border)" strokeWidth="2" />
          <rect x="20" y="28" width="80" height="20" rx="10" fill="var(--text-muted)" opacity="0.15" />
          <line x1="20" y1="48" x2="100" y2="48" stroke="var(--border)" strokeWidth="2" />
          <line x1="38" y1="20" x2="38" y2="36" stroke="var(--text-muted)" strokeWidth="4" strokeLinecap="round" />
          <line x1="82" y1="20" x2="82" y2="36" stroke="var(--text-muted)" strokeWidth="4" strokeLinecap="round" />
          {[0, 1, 2].map((row) =>
            [0, 1, 2, 3].map((col) => (
              <rect
                key={`${row}-${col}`}
                x={32 + col * 15}
                y={60 + row * 13}
                width="9"
                height="9"
                rx="2"
                fill="var(--border)"
              />
            )),
          )}
          <circle cx="90" cy="90" r="18" fill="var(--bg)" stroke="var(--text-muted)" strokeWidth="2.5" />
          <path d="M90 82v8l6 5" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      ) : (
        <svg width="120" height="120" viewBox="0 0 120 120" fill="none" aria-hidden>
          <circle cx="60" cy="60" r="42" fill="var(--bg-elevated)" stroke="var(--border)" strokeWidth="2" />
          <circle cx="60" cy="60" r="30" fill="none" stroke="var(--text-muted)" strokeWidth="2" opacity="0.4" />
          <path d="M60 40 L70 55 L60 80 L50 55 Z" fill="var(--text-muted)" opacity="0.85" />
          <circle cx="60" cy="60" r="4" fill="var(--bg)" stroke="var(--text-muted)" strokeWidth="2" />
        </svg>
      )}
      <div>
        <p className="text-sm font-medium text-[var(--text)]">{title}</p>
        {description && <p className="mt-1 text-xs text-[var(--text-muted)]">{description}</p>}
      </div>
    </div>
  );
}
