import { passwordStrengthLabel, scorePassword } from "../../lib/password-strength";

export function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const score = scorePassword(password);

  return (
    <div className="flex w-full flex-col gap-1">
      <div className="flex w-full gap-1">
        {[1, 2, 3, 4].map((bar) => (
          <div
            key={bar}
            className={`h-1 flex-1 rounded-full ${bar <= score ? "bg-brand" : "bg-surface-2"}`}
          />
        ))}
      </div>
      <p className="text-[10px] font-semibold text-brand">{passwordStrengthLabel(score)}</p>
    </div>
  );
}
