"use client";

// Orchestriert die Mail-Anbindungs-Ansicht (Issue #52, Aufgabe D): keine
// Anbindung -> Modus-Wahl, laufende Einrichtung -> jeweiliges Formular,
// vorhandene Anbindung -> Verwaltungs-Ansicht.

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MailAnbindung } from "@/lib/mail-anbindung";
import { BestehendeAnbindung } from "./bestehende-anbindung";
import { ModusAFormular } from "./modus-a-formular";
import { ModusBFormular } from "./modus-b-formular";

export function MailAnbindungEditor({ kundeId, initialAnbindung }: { kundeId: string; initialAnbindung: MailAnbindung | null }) {
  const [modus, setModus] = useState<"keine" | "a" | "b">("keine");
  const router = useRouter();

  function nachEinrichtungFertig() {
    setModus("keine");
    router.refresh();
  }

  if (initialAnbindung) {
    return <BestehendeAnbindung kundeId={kundeId} anbindung={initialAnbindung} />;
  }

  if (modus === "a") {
    return <ModusAFormular kundeId={kundeId} onFertig={nachEinrichtungFertig} />;
  }
  if (modus === "b") {
    return <ModusBFormular kundeId={kundeId} onFertig={nachEinrichtungFertig} />;
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-ink">Keine Mail-Anbindung eingerichtet</h2>
      <p className="text-sm text-ink-muted">
        <strong>Modus A (Weiterleitung):</strong> passt für neue Kunden ohne Bestand -- die Konsole erzeugt eine Adresse, der Kunde
        richtet eine Weiterleitung ein.
        <br />
        <strong>Modus B (Direkter Zugriff):</strong> passt für bestehende Postfach-Setups, die niemand anfassen will -- die Konsole
        liest per IMAP-Zugangsdaten direkt mit.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setModus("a")}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white"
        >
          Weiterleitung einrichten (Modus A)
        </button>
        <button
          type="button"
          onClick={() => setModus("b")}
          className="rounded-md border border-border px-3 py-2 text-sm font-medium text-ink"
        >
          Direkt lesen (Modus B)
        </button>
      </div>
    </div>
  );
}
