import { useState } from "react";
import { Card } from "../ui/Card";

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

/** §13: the public, unauthenticated calendar feed URL — subscribe once, stays live. */
export function CalendarExportCard({ calendarToken }: { calendarToken: string }) {
  const [copied, setCopied] = useState(false);
  const feedUrl = `${FUNCTIONS_URL}/calendar-feed?token=${calendarToken}`;
  const webcalUrl = feedUrl.replace(/^https?:\/\//, "webcal://");

  async function handleCopy() {
    await navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card size="sm" className="flex flex-col gap-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">Calendar feed</p>
      <p className="text-xs text-text-secondary">
        Subscribe once in Google/Apple/Outlook calendar and it stays up to date automatically as the itinerary
        changes.
      </p>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={feedUrl}
          onFocus={(e) => e.target.select()}
          className="h-10 flex-1 truncate rounded-input border border-border-strong bg-bg px-3 text-xs text-text-primary"
        />
        <button
          type="button"
          onClick={handleCopy}
          className="h-10 shrink-0 rounded-input bg-brand px-4 text-xs font-semibold text-bg"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <a href={webcalUrl} className="text-xs font-semibold text-brand">
        Open in default calendar app
      </a>
    </Card>
  );
}
