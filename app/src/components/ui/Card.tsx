import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "lg";
  children: ReactNode;
}

export function Card({ size = "lg", className = "", children, ...props }: CardProps) {
  const radius = size === "lg" ? "rounded-card-lg" : "rounded-card";
  const padding = size === "lg" ? "p-6" : "p-4";
  return (
    <div className={`w-full ${radius} ${padding} bg-surface-1 ${className}`} {...props}>
      {children}
    </div>
  );
}
