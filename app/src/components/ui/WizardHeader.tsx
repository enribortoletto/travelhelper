interface WizardHeaderProps {
  step: number;
  totalSteps: number;
  title: string;
  subtitle: string;
}

export function WizardHeader({ step, totalSteps, title, subtitle }: WizardHeaderProps) {
  return (
    <div className="flex w-full flex-col gap-2 rounded-card-lg bg-brand p-5 text-bg">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
          Trip Creation
        </p>
        <span className="rounded-xl bg-brand-tint px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide">
          Step {step}/{totalSteps}
        </span>
      </div>
      <p className="text-[32px] font-medium leading-tight tracking-tight">{title}</p>
      <p className="text-sm opacity-80">{subtitle}</p>
    </div>
  );
}
