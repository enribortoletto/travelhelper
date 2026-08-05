export type PasswordStrength = 0 | 1 | 2 | 3 | 4;

const LABELS: Record<PasswordStrength, string> = {
  0: "Too short",
  1: "Weak password",
  2: "Fair password",
  3: "Good password",
  4: "Strong password",
};

export function scorePassword(password: string): PasswordStrength {
  if (password.length < 8) return 0;

  let variety = 0;
  if (/[a-z]/.test(password)) variety++;
  if (/[A-Z]/.test(password)) variety++;
  if (/[0-9]/.test(password)) variety++;
  if (/[^a-zA-Z0-9]/.test(password)) variety++;

  const lengthBonus = password.length >= 12 ? 1 : 0;
  const score = Math.min(4, variety + lengthBonus - 1);
  return Math.max(1, score) as PasswordStrength;
}

export function passwordStrengthLabel(score: PasswordStrength): string {
  return LABELS[score];
}

export const MIN_PASSWORD_LENGTH = 8;
