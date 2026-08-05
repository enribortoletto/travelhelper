import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth-context";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { TextField } from "../../components/ui/TextField";
import { PasswordStrengthMeter } from "../../components/ui/PasswordStrengthMeter";
import { MIN_PASSWORD_LENGTH } from "../../lib/password-strength";

export default function ResetPasswordPage() {
  const { updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    const { error } = await updatePassword(password);
    setSubmitting(false);
    if (error) {
      setError(error);
      return;
    }
    navigate("/", { replace: true });
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-[32px] font-medium leading-tight tracking-tight">
          Set a New Password
        </h1>
        <p className="text-sm text-text-secondary">
          Choose a new password for your account.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-5">
        <Card>
          <div className="flex w-full flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <TextField
                label="New password"
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter value..."
              />
              <PasswordStrengthMeter password={password} />
            </div>
            <TextField
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Enter value..."
            />
          </div>
        </Card>

        {error && <p className="text-sm text-accent">{error}</p>}

        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save New Password"}
        </Button>
      </form>
    </div>
  );
}
