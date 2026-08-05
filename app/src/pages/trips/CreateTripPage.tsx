import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth-context";
import { createTripWithOwner, listCategories } from "../../lib/trips";
import type { Category, Trip } from "../../lib/types";
import { TripBasicsStep, type TripBasics } from "./create/TripBasicsStep";
import { AddStopsStep } from "./create/AddStopsStep";
import { InviteStep } from "./create/InviteStep";

type WizardStep =
  | { name: "basics" }
  | { name: "stops"; trip: Trip; categories: Category[] }
  | { name: "invite"; trip: Trip };

export default function CreateTripPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<WizardStep>({ name: "basics" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBasics(basics: TripBasics) {
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      const displayName =
        (user.user_metadata?.display_name as string | undefined) ?? user.email ?? "Trip creator";
      const trip = await createTripWithOwner({
        name: basics.name,
        startDate: basics.startDate,
        endDate: basics.endDate,
        timezone: basics.timezone,
        displayName,
      });
      const categories = await listCategories(trip.id);
      setStep({ name: "stops", trip, categories });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the trip.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-3 py-8">
      {error && <p className="text-sm text-accent">{error}</p>}

      {step.name === "basics" && <TripBasicsStep onNext={handleBasics} submitting={submitting} />}

      {step.name === "stops" && (
        <AddStopsStep
          trip={step.trip}
          categories={step.categories}
          onNext={() => setStep({ name: "invite", trip: step.trip })}
        />
      )}

      {step.name === "invite" && (
        <InviteStep trip={step.trip} onFinish={() => navigate(`/trips/${step.trip.id}`)} />
      )}
    </div>
  );
}
