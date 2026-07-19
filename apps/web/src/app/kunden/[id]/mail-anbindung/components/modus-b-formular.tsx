"use client";

// Modus B: direktes Kunden-Postfach einrichten (Issue #52, Aufgabe D).

import { useState, type FormEvent } from "react";
import { richteImapKundenpostfachEinAction } from "../actions";

export function ModusBFormular({ kundeId, onFertig }: { kundeId: string; onFertig: () => void }) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("993");
  const [benutzername, setBenutzername] = useState("");
  const [passwort, setPasswort] = useState("");
  const [ladend, setLadend] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);

  async function absenden(event: FormEvent) {
    event.preventDefault();
    setLadend(true);
    setMeldung(null);

    const ergebnis = await richteImapKundenpostfachEinAction(kundeId, { host, port, benutzername, passwort });

    setLadend(false);
    if (ergebnis.status === "fehler") {
      setMeldung(ergebnis.meldung);
      return;
    }
    onFertig();
  }

  return (
    <form onSubmit={absenden} className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-ink">Direkt lesen (Modus B)</h2>
      <p className="text-sm text-ink-muted">
        Die Konsole liest das bestehende Kunden-Postfach direkt per IMAP, ohne den Posteingang anzurühren.
      </p>

      <div className="space-y-1">
        <label htmlFor="imap-host" className="text-xs font-medium text-ink-muted">
          IMAP-Host
        </label>
        <input
          id="imap-host"
          value={host}
          onChange={(event) => setHost(event.target.value)}
          required
          placeholder="imap.beispiel-provider.de"
          className="w-full rounded-md border border-border px-2 py-1.5 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="imap-port" className="text-xs font-medium text-ink-muted">
          Port
        </label>
        <input
          id="imap-port"
          type="number"
          value={port}
          onChange={(event) => setPort(event.target.value)}
          required
          min={1}
          max={65535}
          className="w-full rounded-md border border-border px-2 py-1.5 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="imap-benutzername" className="text-xs font-medium text-ink-muted">
          Benutzername
        </label>
        <input
          id="imap-benutzername"
          value={benutzername}
          onChange={(event) => setBenutzername(event.target.value)}
          required
          className="w-full rounded-md border border-border px-2 py-1.5 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="imap-passwort" className="text-xs font-medium text-ink-muted">
          Passwort (App-Passwort)
        </label>
        <input
          id="imap-passwort"
          type="password"
          value={passwort}
          onChange={(event) => setPasswort(event.target.value)}
          required
          className="w-full rounded-md border border-border px-2 py-1.5 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={ladend}
        className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {ladend ? "Teste Verbindung…" : "Verbindung testen und anlegen"}
      </button>

      {meldung && (
        <p role="alert" className="text-sm text-red-600">
          {meldung}
        </p>
      )}
    </form>
  );
}
