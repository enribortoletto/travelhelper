import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth-context";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { TextField } from "../../components/ui/TextField";
import { PasswordStrengthMeter } from "../../components/ui/PasswordStrengthMeter";
import { MIN_PASSWORD_LENGTH } from "../../lib/password-strength";

export default function SignUpPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
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
    const { error } = await signUp(email, password, displayName);
    setSubmitting(false);
    if (error) {
      setError(error);
      return;
    }
    navigate("/", { replace: true });
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-[32px] font-medium leading-tight tracking-tight">Create Account</h1>
        <p className="text-sm text-text-secondary">Plan and coordinate trips with friends.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-5">
        <Card>
          <div className="flex w-full flex-col gap-3">
            <TextField
              label="Display name"
              autoComplete="name"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter value..."
            />
            <TextField
              label="Email address"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter value..."
            />
            <div className="flex flex-col gap-1.5">
              <TextField
                label="Password"
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
          {submitting ? "Creating account…" : "Create Account"}
        </Button>

        <p className="text-center text-xs text-text-secondary">
          By signing up, you agree to our Terms of Service and Privacy Policy.
        </p>
      </form>

      <p className="flex justify-center gap-1 text-sm text-text-secondary">
        Already have an account?{" "}
        <Link to="/login" className="font-semibold text-accent">
          Log In
        </Link>
      </p>
    </div>
  );
}
