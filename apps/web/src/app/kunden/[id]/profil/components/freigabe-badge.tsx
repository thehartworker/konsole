// Freigabe-Zustands-Anzeige (Issue #50, Aufgabe B): 'vorlaeufig' und
// 'abgeleitet' sehen ABSICHTLICH gleich aus -- beide brauchen dieselbe
// Aktion (menschliche Bestätigung), der einzige Unterschied ist die
// zusätzliche Herkunfts-Zeile bei 'abgeleitet' (siehe provenienz-zeile.tsx),
// nicht die Badge-Farbe selbst.

import type { KundenProfilElementStatus } from "@konsole/persistence";

const LABEL: Record<KundenProfilElementStatus, string> = {
  freigegeben: "freigegeben",
  vorlaeufig: "vorläufig",
  abgeleitet: "vorläufig",
};

export function FreigabeBadge({ status }: { status: KundenProfilElementStatus }) {
  if (status === "freigegeben") return null;

  return (
    <span className="rounded-full bg-warning-bg px-2 py-0.5 text-xs text-warning" title="Wartet auf Freigabe">
      {LABEL[status]}
    </span>
  );
}
