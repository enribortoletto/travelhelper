import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { acceptInvite } from "../../lib/trips";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"pending" | "error">("pending");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    acceptInvite(token)
      .then((member) => navigate(`/trips/${member.trip_id}`, { replace: true }))
      .catch((err) => {
        setStatus("error");
        setError(err instanceof Error ? err.message : "This invite could not be accepted.");
      });
  }, [token, navigate]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4">
      <Card>
        {status === "pending" ? (
          <p className="text-sm text-text-secondary">Joining trip…</p>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-accent">{error}</p>
            <Button onClick={() => navigate("/")}>Go to Your Trips</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
