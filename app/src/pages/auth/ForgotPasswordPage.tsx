import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/auth-context";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { TextField } from "../../components/ui/TextField";

export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await requestPasswordReset(email);
    setSubmitting(false);
    if (error) {
      setError(error);
      return;
    }
    setSent(true);
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-[32px] font-medium leading-tight tracking-tight">Reset Password</h1>
        <p className="text-sm text-text-secondary">
          Enter your email address and we'll send you a link to reset your password.
        </p>
      </div>

      {sent ? (
        <Card>
          <p className="text-sm text-text-primary">
            If an account exists for <strong>{email}</strong>, a reset link is on its way.
          </p>
        </Card>
      ) : (
        <form onSubmit={handleSubmit} className="flex w-full flex-col gap-5">
          <Card>
            <TextField
              label="Email address"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter value..."
            />
          </Card>

          {error && <p className="text-sm text-accent">{error}</p>}

          <Button type="submit" disabled={submitting}>
            {submitting ? "Sending…" : "Send Reset Link"}
          </Button>
        </form>
      )}

      <Link to="/login" className="text-center text-sm font-semibold text-brand">
        Back to Log In
      </Link>
    </div>
  );
}
