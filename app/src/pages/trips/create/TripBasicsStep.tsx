import { useMemo, useState, type FormEvent } from "react";
import { WizardHeader } from "../../../components/ui/WizardHeader";
import { TextField } from "../../../components/ui/TextField";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";

export interface TripBasics {
  name: string;
  startDate: string;
  endDate: string;
  timezone: string;
}

const TIMEZONES: string[] =
  typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"];

export function TripBasicsStep({
  onNext,
  submitting,
}: {
  onNext: (basics: TripBasics) => void;
  submitting: boolean;
}) {
  const defaultTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [timezone, setTimezone] = useState(defaultTz);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name || !startDate || !endDate) return;
    if (endDate < startDate) {
      setError("End date must be on or after the start date.");
      return;
    }
    setError(null);
    onNext({ name, startDate, endDate, timezone });
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <WizardHeader
        step={1}
        totalSteps={3}
        title="Create Your Trip"
        subtitle="Let's build your next adventure together."
      />

      <Card size="sm" className="flex flex-col gap-3">
        <TextField
          label="Trip name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Scotland Highland Road Trip"
        />
        <div className="flex gap-3">
          <TextField
            label="Start date"
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <TextField
            label="End date"
            type="date"
            required
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <div className="flex w-full flex-col gap-1.5">
          <label className="text-[10px] font-medium uppercase tracking-wide text-text-tertiary">
            Timezone
          </label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="h-11 w-full rounded-input border border-border-strong bg-bg px-4 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {error && <p className="text-sm text-accent">{error}</p>}

      <Button type="submit" withArrow disabled={submitting}>
        {submitting ? "Creating…" : "Next: Add Your First Stops"}
      </Button>
    </form>
  );
}
