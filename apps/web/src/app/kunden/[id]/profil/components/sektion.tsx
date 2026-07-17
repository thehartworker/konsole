"use client";

// Kollabierbare Sektion mit sichtbarem Zähler (Issue #50, Aufgabe B: "3
// Kernbotschaften, 1 vorläufig").

import { useState } from "react";

export function Sektion({
  titel,
  zaehlerText,
  defaultOffen = true,
  children,
}: {
  titel: string;
  zaehlerText: string;
  defaultOffen?: boolean;
  children: React.ReactNode;
}) {
  const [offen, setOffen] = useState(defaultOffen);
  const inhaltId = `sektion-inhalt-${titel.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <section className="rounded-lg border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOffen((bisherig) => !bisherig)}
        aria-expanded={offen}
        aria-controls={inhaltId}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-ink">{titel}</span>
        <span className="flex items-center gap-2 text-xs text-ink-muted">
          {zaehlerText}
          <span aria-hidden="true">{offen ? "▾" : "▸"}</span>
        </span>
      </button>
      {offen && (
        <div id={inhaltId} className="space-y-4 border-t border-border px-4 py-4">
          {children}
        </div>
      )}
    </section>
  );
}
