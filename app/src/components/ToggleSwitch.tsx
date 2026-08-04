interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}

/**
 * Switch pillola stile Figma (component "toggle-switch": track color/primary/500,
 * thumb bianco che scorre) al posto della checkbox nativa del browser usata
 * finora — stesso comportamento, solo aspetto.
 */
export default function ToggleSwitch({ checked, onChange, label }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors"
      style={{ background: checked ? "var(--primary)" : "var(--border)" }}
    >
      <span
        className="block h-5 w-5 rounded-full bg-white shadow-[0px_1px_2px_0px_rgba(0,0,0,0.1)] transition-transform"
        style={{ transform: checked ? "translateX(20px)" : "translateX(0)" }}
      />
    </button>
  );
}
