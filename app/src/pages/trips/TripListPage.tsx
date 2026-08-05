import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { useAuth } from "../../lib/auth-context";
import { listMyTrips, type TripWithMembership } from "../../lib/trips";
import { getTripPhase } from "../../lib/trip-phase";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";

const PHASE_LABEL: Record<string, string> = {
  planning: "Planning",
  active: "Active",
  completed: "Completed",
};

export default function TripListPage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [trips, setTrips] = useState<TripWithMembership[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listMyTrips()
      .then(setTrips)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Your Trips</h1>
        <button onClick={() => signOut()} className="text-sm text-text-secondary">
          Log out
        </button>
      </div>

      {error && <p className="text-sm text-accent">{error}</p>}

      {trips === null && !error && (
        <p className="text-sm text-text-secondary">Loading…</p>
      )}

      {trips?.length === 0 && (
        <Card>
          <p className="text-sm text-text-secondary">
            No trips yet — create your first one to get started.
          </p>
        </Card>
      )}

      <div className="flex flex-col gap-4">
        {trips?.map((trip) => {
          const phase = getTripPhase(trip);
          return (
            <button
              key={trip.id}
              onClick={() => navigate(`/trips/${trip.id}`)}
              className="text-left"
            >
              <Card className="flex flex-col gap-4">
                <div className="h-[120px] w-full rounded-card bg-gradient-to-br from-brand to-brand-tint" />
                <div className="flex flex-col gap-1.5">
                  <p className="text-base font-semibold tracking-tight">{trip.name}</p>
                  <p className="text-xs text-text-secondary">
                    {format(new Date(trip.start_date), "d MMM")} –{" "}
                    {format(new Date(trip.end_date), "d MMM yyyy")}
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[10px] font-medium capitalize text-text-primary">
                    {trip.member.role}
                    {trip.member.is_owner ? " · owner" : ""}
                  </span>
                  <span className="rounded-lg bg-surface-2 px-2.5 py-1 text-[10px] font-medium text-text-secondary">
                    {PHASE_LABEL[phase]}
                  </span>
                </div>
              </Card>
            </button>
          );
        })}
      </div>

      <Link to="/trips/new">
        <Button>Create New Trip</Button>
      </Link>
    </div>
  );
}
