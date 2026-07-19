"use client";

// Anzeige/Verwaltung einer bestehenden Anbindung (Issue #52, Aufgabe D):
// Modus, Zieladresse (A) bzw. maskierte Zugangsdaten (B, Passwort nie),
// Status, letzter Mail-Empfang, deaktivieren/löschen.

import { useState } from "react";
import type { MailAnbindung } from "@/lib/mail-anbindung";
import { aktiviereAnbindungAction, deaktiviereAnbindungAction, loeschAnbindungAction } from "../actions";

function formatiereZeitpunkt(iso: string | null): string {
  if (!iso) return "noch keine Mail empfangen";
  return new Date(iso).toLocaleString("de-DE");
}

export function BestehendeAnbindung({ kundeId, anbindung }: { kundeId: string; anbindung: MailAnbindung }) {
  const [meldung, setMeldung] = useState<string | null>(null);
  const [ladend, setLadend] = useState(false);
  const [loeschenBestaetigen, setLoeschenBestaetigen] = useState(false);

  async function statusUmschalten() {
    setLadend(true);
    setMeldung(null);
    const aktion = anbindung.aktiv ? deaktiviereAnbindungAction : aktiviereAnbindungAction;
    const ergebnis = await aktion(anbindung.id, kundeId);
    setLadend(false);
    if (ergebnis.status === "fehler") setMeldung(ergebnis.meldung);
  }

  async function loeschen() {
    setLadend(true);
    setMeldung(null);
    const ergebnis = await loeschAnbindungAction(anbindung.id, kundeId);
    setLadend(false);
    if (ergebnis.status === "fehler") setMeldung(ergebnis.meldung);
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">
          {anbindung.anbindungsTyp === "weiterleitung" ? "Weiterleitung (Modus A)" : "Direktes Postfach (Modus B)"}
        </h2>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${anbindung.aktiv ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}
        >
          {anbindung.aktiv ? "aktiv" : "inaktiv"}
        </span>
      </div>

      {anbindung.anbindungsTyp === "weiterleitung" ? (
        <p className="text-sm text-ink-muted">
          Zieladresse: <code className="text-ink">{anbindung.konsolenAdresse}</code>
        </p>
      ) : (
        <p className="text-sm text-ink-muted">
          Host: <code className="text-ink">{anbindung.imapHost}</code>, Benutzername:{" "}
          <code className="text-ink">{anbindung.imapBenutzername}</code> (Passwort verschlüsselt gespeichert, nie anzeigbar)
        </p>
      )}

      <p className="text-xs text-ink-muted">Letzter Mail-Empfang: {formatiereZeitpunkt(anbindung.letzterMailEmpfangAt)}</p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={statusUmschalten}
          disabled={ladend}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink disabled:opacity-50"
        >
          {anbindung.aktiv ? "Deaktivieren" : "Aktivieren"}
        </button>

        {!loeschenBestaetigen ? (
          <button
            type="button"
            onClick={() => setLoeschenBestaetigen(true)}
            className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700"
          >
            Löschen
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-muted">Wirklich löschen? Bereits angelegte Vorgänge bleiben bestehen.</span>
            <button
              type="button"
              onClick={loeschen}
              disabled={ladend}
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              Ja, löschen
            </button>
            <button type="button" onClick={() => setLoeschenBestaetigen(false)} className="text-xs text-ink-muted underline">
              Abbrechen
            </button>
          </div>
        )}
      </div>

      {meldung && (
        <p role="alert" className="text-sm text-red-600">
          {meldung}
        </p>
      )}
    </div>
  );
}
