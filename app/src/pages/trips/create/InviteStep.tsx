import { useEffect, useState, type FormEvent } from "react";
import { WizardHeader } from "../../../components/ui/WizardHeader";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { TextField } from "../../../components/ui/TextField";
import { createInvite, listTripMembers } from "../../../lib/trips";
import type { Trip, TripMember, TripRole } from "../../../lib/types";

export function InviteStep({ trip, onFinish }: { trip: Trip; onFinish: () => void }) {
  const [members, setMembers] = useState<TripMember[]>([]);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TripRole>("editor");
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTripMembers(trip.id).then(setMembers).catch(() => {});
    createInvite(trip.id, "editor")
      .then((invite) => setLinkToken(invite.token))
      .catch((err) => setError(err.message));
  }, [trip.id]);

  const inviteUrl = linkToken ? `${window.location.origin}/invite/${linkToken}` : "";

  async function handleCopy() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleEmailInvite(event: FormEvent) {
    event.preventDefault();
    if (!email) return;
    setError(null);
    try {
      await createInvite(trip.id, role, email);
      setEmailSent(true);
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create invite.");
    }
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <WizardHeader
        step={3}
        totalSteps={3}
        title="Invite Your Group"
        subtitle="Co-plan with friends and family"
      />

      <Card size="sm" className="flex flex-col gap-1.5">
        <p className="text-base font-semibold text-text-primary">Plan Together in Real-Time</p>
        <p className="text-xs text-text-secondary">
          Everyone you invite can view the trip. Give them Editor access to let them add stops,
          or Viewer to keep them updated.
        </p>
      </Card>

      <Card size="sm" className="flex flex-col gap-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
          Invite link
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1 truncate rounded-input bg-surface-2 px-3 py-2 text-xs text-text-primary">
            {inviteUrl || "Generating…"}
          </div>
          <button
            onClick={handleCopy}
            disabled={!inviteUrl}
            className="shrink-0 rounded-input bg-brand px-4 py-2 text-[10px] font-semibold text-bg"
          >
            {copied ? "Copied!" : "Copy Link"}
          </button>
        </div>
      </Card>

      <Card size="sm" className="flex flex-col gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
          Email invite
        </p>
        <form onSubmit={handleEmailInvite} className="flex items-end gap-2">
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter value..."
            className="flex-1"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as TripRole)}
            className="h-11 shrink-0 rounded-input bg-surface-2 px-3 text-[10px] font-semibold text-text-primary"
          >
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
          </select>
          <button
            type="submit"
            className="h-11 shrink-0 rounded-input bg-brand px-4 text-xs font-semibold text-bg"
          >
            Send
          </button>
        </form>
        {emailSent && <p className="text-xs text-brand">Invite created — share the link above or resend later from trip settings.</p>}
      </Card>

      <div className="flex flex-col gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
          Trip members ({members.length})
        </p>
        {members.map((member) => (
          <div
            key={member.user_id}
            className="flex items-center justify-between rounded-card bg-surface-1 px-4 py-2.5"
          >
            <p className="text-sm font-semibold text-text-primary">{member.display_name}</p>
            <p className="text-xs text-text-secondary capitalize">
              {member.is_owner ? "Owner" : member.role}
            </p>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-accent">{error}</p>}

      <button onClick={onFinish} className="p-2 text-center text-sm font-semibold text-text-secondary">
        Skip for Now
      </button>

      <Button withArrow onClick={onFinish}>
        Finish Setup
      </Button>
    </div>
  );
}
