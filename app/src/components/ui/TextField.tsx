import type { InputHTMLAttributes } from "react";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function TextField({ label, className = "", id, ...props }: TextFieldProps) {
  const fieldId = id ?? label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="flex w-full flex-col gap-1.5">
      <label
        htmlFor={fieldId}
        className="text-[10px] font-medium uppercase tracking-wide text-text-tertiary"
      >
        {label}
      </label>
      <input
        id={fieldId}
        className={`h-11 w-full rounded-input border border-border-strong bg-bg px-4 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-brand ${className}`}
        {...props}
      />
    </div>
  );
}
