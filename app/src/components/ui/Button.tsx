import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ArrowRight } from "lucide-react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "accent" | "brand" | "ghost";
  withArrow?: boolean;
  children: ReactNode;
}

const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  accent: "bg-accent text-text-primary",
  brand: "bg-brand text-bg",
  ghost: "bg-transparent text-text-secondary",
};

export function Button({
  variant = "accent",
  withArrow = false,
  className = "",
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`flex h-14 w-full items-center justify-center gap-3 rounded-full px-6 text-base font-semibold tracking-tight transition-opacity disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
      {withArrow && <ArrowRight className="size-6" />}
    </button>
  );
}
