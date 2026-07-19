"use client";

// Modus A: Weiterleitung einrichten (Issue #52, Aufgabe D).

import { useState } from "react";
import { richteWeiterleitungEinAction, testeKonsolenPostfachEintreffenAction } from "../actions";

export function ModusAFormular({ kundeId, onFertig }: { kundeId: string; onFertig: () => void }) {
  const [schritt, setSchritt] = useState<"start" | "adresse-erzeugt" | "testet" | "fehlgeschlagen">("start");
  const [konsolenAdresse, setKonsolenAdresse] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [ladend, setLadend] = useState(false);

  async function adresseErzeugen() {
    setLadend(true);
    setMeldung(null);
    const ergebnis = await richteWeiterleitungEinAction(kundeId);
    setLadend(false);
    if (ergebnis.status === "fehler") {
      setMeldung(ergebnis.meldung);
      setSchritt("fehlgeschlagen");
      return;
    }
    setKonsolenAdresse(ergebnis.konsolenAdresse);
    setSchritt("adresse-erzeugt");
  }

  async function verbindungTesten() {
    setLadend(true);
    setSchritt("testet");
    setMeldung(null);
    const testId = crypto.randomUUID();
    const ergebnis = await testeKonsolenPostfachEintreffenAction(kundeId, testId);
    setLadend(false);
    if (ergebnis.status === "fehler") {
      setMeldung(ergebnis.meldung);
      setSchritt("adresse-erzeugt");
      return;
    }
    onFertig();
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-ink">Weiterleitung einrichten (Modus A)</h2>
      <p className="text-sm text-ink-muted">
        Die Konsole erzeugt eine eindeutige Adresse. Richten Sie beim Kunden eine Weiterleitung von der bekannten Presse-Adresse auf
        diese Adresse ein.
      </p>

      {schritt === "start" && (
        <button
          type="button"
          onClick={adresseErzeugen}
          disabled={ladend}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {ladend ? "Erzeuge Adresse…" : "Adresse erzeugen"}
        </button>
      )}

      {konsolenAdresse && (
        <div className="rounded-md bg-surface-muted p-3">
          <p className="text-xs text-ink-muted">Weiterleitungs-Ziel:</p>
          <code className="text-sm text-ink">{konsolenAdresse}</code>
        </div>
      )}

      {(schritt === "adresse-erzeugt" || schritt === "testet") && (
        <div className="space-y-2">
          <p className="text-sm text-ink-muted">
            Nachdem die Weiterleitung beim Kunden eingerichtet ist: Verbindungstest starten (sendet eine Test-Mail, wartet bis zu 60
            Sekunden auf das Eintreffen im Konsolen-Postfach).
          </p>
          <button
            type="button"
            onClick={verbindungTesten}
            disabled={ladend}
            className="rounded-md border border-border px-3 py-2 text-sm font-medium text-ink disabled:opacity-50"
          >
            {schritt === "testet" ? "Teste Verbindung… (bis zu 60s)" : "Verbindung testen"}
          </button>
        </div>
      )}

      {meldung && (
        <p role="alert" className="text-sm text-red-600">
          {meldung}
        </p>
      )}
    </div>
  );
}
