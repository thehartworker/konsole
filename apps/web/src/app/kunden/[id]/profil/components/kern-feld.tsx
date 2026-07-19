"use client";

// Inline-Editor für ein einzelnes Kern-Feld (kunden_profil-Spalte), Issue
// #50, Aufgabe B: "Klick aktiviert Inline-Editor, exakt wie in Block 2"
// (siehe apps/web/src/app/vorgaenge/[id]/components/pressemitteilung-editor.tsx
// als Vorlage) -- Cmd/Ctrl+Enter speichert, Escape verwirft, Optimistic UI
// mit Rollback und "Erneut versuchen" bei Fehler. Jedes Feld ist bewusst
// eigenständig (kein zentraler Dokument-State wie bei der Pressemitteilung):
// jedes Kern-Feld ist unabhängig speicherbar, ein zentraler Reducer über elf
// Felder wäre hier unnötige Kopplung.

import { useRef, useState, useTransition, type KeyboardEvent } from "react";
import type { KundenProfilFeldStatusEintrag } from "@konsole/persistence";
import { AutoGrowTextarea } from "@/app/vorgaenge/[id]/components/auto-grow-textarea";
import { kernFeldProvenanceText } from "@/lib/kundenprofil-provenance";
import type { KernFeldKonfiguration } from "@/lib/kundenprofil-felder";
import { gebeFeldFreiAction, speichereKopfFeldAction } from "../actions";
import { FreigabeBadge } from "./freigabe-badge";
import { ProvenienzZeile } from "./provenienz-zeile";

function wertZuEntwurf(wert: unknown, typ: KernFeldKonfiguration["typ"]): string {
  if (wert === null || wert === undefined) return "";
  if (typ === "json") return JSON.stringify(wert, null, 2);
  return String(wert);
}

export function KernFeld({
  kundeId,
  konfiguration,
  initialWert,
  initialStatus,
}: {
  kundeId: string;
  konfiguration: KernFeldKonfiguration;
  initialWert: unknown;
  initialStatus: KundenProfilFeldStatusEintrag | undefined;
}) {
  const [wert, setWert] = useState<unknown>(initialWert);
  const [statusEintrag, setStatusEintrag] = useState(initialStatus);
  const [bearbeiten, setBearbeiten] = useState(false);
  const [entwurf, setEntwurf] = useState(() => wertZuEntwurf(initialWert, konfiguration.typ));
  const [letzterVersuch, setLetzterVersuch] = useState<unknown>(undefined);
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const geradeAbgebrochen = useRef(false);

  const status = statusEintrag?.status ?? "freigegeben";
  const provenance = kernFeldProvenanceText(statusEintrag);

  function aktivieren() {
    setEntwurf(wertZuEntwurf(wert, konfiguration.typ));
    setFehler(null);
    setBearbeiten(true);
  }

  function abbrechen() {
    geradeAbgebrochen.current = true;
    setBearbeiten(false);
  }

  function commit(neuerWert: unknown) {
    setBearbeiten(false);
    const vorherigerWert = wert;
    const vorherigerStatus = statusEintrag;
    setWert(neuerWert);
    setStatusEintrag({ status: "freigegeben", stand: new Date().toISOString().slice(0, 10), quelle: null });
    setLetzterVersuch(neuerWert);
    setSpeichert(true);
    setFehler(null);

    startTransition(async () => {
      const resultat = await speichereKopfFeldAction(kundeId, konfiguration.key, neuerWert);
      setSpeichert(false);
      if (resultat.status === "fehler") {
        setWert(vorherigerWert);
        setStatusEintrag(vorherigerStatus);
        setFehler(resultat.meldung);
      }
    });
  }

  function speichernFallsGeaendert() {
    if (konfiguration.typ === "json") {
      let geparst: unknown;
      try {
        geparst = entwurf.trim() === "" ? {} : JSON.parse(entwurf);
      } catch {
        setFehler("Ungültiges JSON.");
        return;
      }
      commit(geparst);
      return;
    }
    const getrimmt = entwurf.trim();
    commit(getrimmt === "" ? null : getrimmt);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      abbrechen();
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      speichernFallsGeaendert();
    }
  }

  function handleBlur() {
    if (geradeAbgebrochen.current) {
      geradeAbgebrochen.current = false;
      return;
    }
    speichernFallsGeaendert();
  }

  function freigeben() {
    const vorherigerStatus = statusEintrag;
    setStatusEintrag((bisherig) => (bisherig ? { ...bisherig, status: "freigegeben" } : { status: "freigegeben" }));
    startTransition(async () => {
      const resultat = await gebeFeldFreiAction({ art: "kern", feldname: konfiguration.key }, kundeId);
      if (resultat.status === "fehler") {
        setStatusEintrag(vorherigerStatus);
        setFehler(resultat.meldung);
      }
    });
  }

  return (
    <div className="py-2" data-feld={konfiguration.key}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-ink-muted">{konfiguration.label}</span>
        <FreigabeBadge status={status} />
        {status !== "freigegeben" && (
          <button type="button" onClick={freigeben} className="text-xs text-primary underline">
            Freigeben
          </button>
        )}
      </div>

      {bearbeiten ? (
        konfiguration.typ === "select" ? (
          <select
            autoFocus
            aria-label={konfiguration.label}
            value={entwurf}
            onChange={(event) => setEntwurf(event.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            className="w-full rounded-md border border-primary bg-surface p-1 text-sm text-ink outline-none"
          >
            <option value="">— keine Angabe —</option>
            {konfiguration.optionen?.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : konfiguration.typ === "textarea" || konfiguration.typ === "json" ? (
          <AutoGrowTextarea
            value={entwurf}
            onChange={setEntwurf}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            ariaLabel={konfiguration.label}
            autoFocus
          />
        ) : (
          <input
            type="text"
            autoFocus
            aria-label={konfiguration.label}
            value={entwurf}
            onChange={(event) => setEntwurf(event.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            className="w-full rounded-md border border-primary bg-surface p-1 text-sm text-ink outline-none"
          />
        )
      ) : (
        <div
          role="button"
          tabIndex={0}
          aria-label={`${konfiguration.label}. Enter zum Bearbeiten.`}
          onClick={aktivieren}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              aktivieren();
            }
          }}
          className="cursor-text rounded-md p-1 text-sm text-ink hover:bg-surface-subtle"
        >
          {wert === null || wert === undefined || wert === "" ? (
            <span className="text-xs text-ink-muted underline">+ {konfiguration.label.toLowerCase()} hinzufügen</span>
          ) : konfiguration.typ === "json" ? (
            <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(wert, null, 2)}</pre>
          ) : (
            <span>{String(wert)}</span>
          )}
        </div>
      )}

      {speichert && (
        <span className="text-xs text-ink-muted" aria-live="polite">
          Speichert…
        </span>
      )}
      {fehler && (
        <span role="alert" className="mt-1 block text-xs text-danger">
          {fehler}{" "}
          <button type="button" onClick={() => commit(letzterVersuch)} className="underline">
            Erneut versuchen
          </button>
        </span>
      )}
      <ProvenienzZeile text={provenance} />
    </div>
  );
}
