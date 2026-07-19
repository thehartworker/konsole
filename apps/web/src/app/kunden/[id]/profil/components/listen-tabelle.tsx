"use client";

// Eine Listen-Sektion (z. B. "Kernbotschaften"): bestehende Zeilen mit
// Freigabe-Badge/Provenienz-Zeile/Bearbeiten/Entfernen, plus "+ Eintrag
// hinzufügen" (Issue #50, Aufgabe B). Optimistic UI mit Rollback, gleiches
// Prinzip wie kern-feld.tsx.

import { useState, useTransition } from "react";
import type { KundenProfilElementStatus } from "@konsole/persistence";
import { listenzeileProvenanceText } from "@/lib/kundenprofil-provenance";
import type { ListenTabellenKonfiguration } from "@/lib/kundenprofil-felder";
import { entferneListenzeileAction, gebeFeldFreiAction, speichereListenzeileAction } from "../actions";
import { FreigabeBadge } from "./freigabe-badge";
import { ListenZeileFormular } from "./listen-zeile-formular";
import { ProvenienzZeile } from "./provenienz-zeile";

export interface AnzeigeZeile {
  id: string;
  status: KundenProfilElementStatus;
  herkunft?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

function leereWerte(konfiguration: ListenTabellenKonfiguration): Record<string, unknown> {
  const werte: Record<string, unknown> = {};
  for (const feld of konfiguration.felder) {
    werte[feld.key] = feld.typ === "boolean" ? false : feld.typ === "number" ? 0 : "";
  }
  return werte;
}

export function ListenTabelle({
  kundeId,
  konfiguration,
  initialZeilen,
}: {
  kundeId: string;
  konfiguration: ListenTabellenKonfiguration;
  initialZeilen: AnzeigeZeile[];
}) {
  const [zeilen, setZeilen] = useState<AnzeigeZeile[]>(initialZeilen);
  const [bearbeiteId, setBearbeiteId] = useState<string | null>(null);
  const [neuOffen, setNeuOffen] = useState(false);
  const [fehlerProZeile, setFehlerProZeile] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  function fehlerSetzen(id: string, meldung: string) {
    setFehlerProZeile((bisherig) => ({ ...bisherig, [id]: meldung }));
  }

  function hinzufuegen(werte: Record<string, unknown>) {
    setNeuOffen(false);
    const temporaereId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimistischeZeile: AnzeigeZeile = {
      id: temporaereId,
      status: "freigegeben",
      herkunft: null,
      updated_at: new Date().toISOString(),
      ...werte,
    };
    setZeilen((bisherig) => [...bisherig, optimistischeZeile]);

    startTransition(async () => {
      const resultat = await speichereListenzeileAction(konfiguration.tabelle, werte, kundeId);
      if (resultat.status === "erfolg") {
        setZeilen((bisherig) => bisherig.map((zeile) => (zeile.id === temporaereId ? { ...zeile, id: resultat.id } : zeile)));
      } else {
        setZeilen((bisherig) => bisherig.filter((zeile) => zeile.id !== temporaereId));
        fehlerSetzen(temporaereId, resultat.meldung);
      }
    });
  }

  function aktualisieren(id: string, werte: Record<string, unknown>) {
    setBearbeiteId(null);
    const vorherigeZeile = zeilen.find((zeile) => zeile.id === id);
    setZeilen((bisherig) => bisherig.map((zeile) => (zeile.id === id ? { ...zeile, ...werte, status: "freigegeben" } : zeile)));

    startTransition(async () => {
      const resultat = await speichereListenzeileAction(konfiguration.tabelle, { ...werte, id }, kundeId);
      if (resultat.status === "fehler") {
        if (vorherigeZeile) setZeilen((bisherig) => bisherig.map((zeile) => (zeile.id === id ? vorherigeZeile : zeile)));
        fehlerSetzen(id, resultat.meldung);
      }
    });
  }

  function entfernen(id: string) {
    const vorherigeZeilen = zeilen;
    setZeilen((bisherig) => bisherig.filter((zeile) => zeile.id !== id));

    startTransition(async () => {
      const resultat = await entferneListenzeileAction(konfiguration.tabelle, id, kundeId);
      if (resultat.status === "fehler") {
        setZeilen(vorherigeZeilen);
        fehlerSetzen(id, resultat.meldung);
      }
    });
  }

  function freigeben(id: string) {
    const vorherigeZeilen = zeilen;
    setZeilen((bisherig) => bisherig.map((zeile) => (zeile.id === id ? { ...zeile, status: "freigegeben" } : zeile)));

    startTransition(async () => {
      const resultat = await gebeFeldFreiAction({ art: "liste", tabelle: konfiguration.tabelle, zeileId: id }, kundeId);
      if (resultat.status === "fehler") {
        setZeilen(vorherigeZeilen);
        fehlerSetzen(id, resultat.meldung);
      }
    });
  }

  return (
    <div>
      {zeilen.length === 0 && !neuOffen && <p className="text-xs text-ink-muted">Noch keine Einträge.</p>}

      <ul className="space-y-2">
        {zeilen.map((zeile) => (
          <li key={zeile.id} className="rounded-md border border-border p-2">
            {bearbeiteId === zeile.id ? (
              <ListenZeileFormular
                konfiguration={konfiguration}
                initialWerte={zeile}
                onSpeichern={(werte) => aktualisieren(zeile.id, werte)}
                onAbbrechen={() => setBearbeiteId(null)}
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-ink">{konfiguration.anzeige(zeile)}</span>
                  <FreigabeBadge status={zeile.status} />
                  {zeile.status !== "freigegeben" && (
                    <button type="button" onClick={() => freigeben(zeile.id)} className="text-xs text-primary underline">
                      Freigeben
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setBearbeiteId(zeile.id)}
                    aria-label={`${konfiguration.einzahl} bearbeiten: ${konfiguration.anzeige(zeile)}`}
                    className="text-xs text-ink-muted underline"
                  >
                    Bearbeiten
                  </button>
                  <button
                    type="button"
                    onClick={() => entfernen(zeile.id)}
                    aria-label={`${konfiguration.einzahl} entfernen: ${konfiguration.anzeige(zeile)}`}
                    className="text-xs text-ink-muted underline"
                  >
                    Entfernen
                  </button>
                </div>
                <ProvenienzZeile
                  text={listenzeileProvenanceText({ status: zeile.status, herkunft: zeile.herkunft, updated_at: zeile.updated_at })}
                />
                {fehlerProZeile[zeile.id] && (
                  <span role="alert" className="mt-1 block text-xs text-danger">
                    {fehlerProZeile[zeile.id]}
                  </span>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      {neuOffen ? (
        <div className="mt-2">
          <ListenZeileFormular
            konfiguration={konfiguration}
            initialWerte={leereWerte(konfiguration)}
            onSpeichern={hinzufuegen}
            onAbbrechen={() => setNeuOffen(false)}
          />
        </div>
      ) : (
        <button type="button" onClick={() => setNeuOffen(true)} className="mt-2 text-xs text-ink-muted underline">
          + {konfiguration.einzahl} hinzufügen
        </button>
      )}
    </div>
  );
}
