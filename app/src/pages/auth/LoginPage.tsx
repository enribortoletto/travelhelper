import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth-context";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { TextField } from "../../components/ui/TextField";

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? "/";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) {
      setError(error);
      return;
    }
    navigate(from, { replace: true });
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-[32px] font-medium leading-tight tracking-tight">Welcome Back</h1>
        <p className="text-sm text-text-secondary">Log in to continue your adventure.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-5">
        <Card>
          <div className="flex w-full flex-col gap-4">
            <TextField
              label="Email address"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter value..."
            />
            <TextField
              label="Password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter value..."
            />
            <div className="flex w-full justify-end">
              <Link to="/forgot-password" className="text-xs font-medium text-brand">
                Forgot password?
              </Link>
            </div>
          </div>
        </Card>

        {error && <p className="text-sm text-accent">{error}</p>}

        <Button type="submit" withArrow disabled={submitting}>
          {submitting ? "Logging in…" : "Log In"}
        </Button>
      </form>

      <p className="flex justify-center gap-1 text-sm text-text-secondary">
        Don't have an account?{" "}
        <Link to="/signup" className="font-semibold text-accent">
          Sign Up
        </Link>
      </p>
    </div>
  );
}
