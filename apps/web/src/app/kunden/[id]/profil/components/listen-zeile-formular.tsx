"use client";

// Konfigurations-getriebenes Formular für EINE Listen-Zeile (neu oder
// bearbeitet), Issue #50, Aufgabe B: gleiche Tastatur-Semantik wie die
// Kern-Feld-Editoren (Cmd/Ctrl+Enter speichert, Escape verwirft) -- eine
// Zeile wird als Ganzes editiert, nicht Feld für Feld einzeln aktiviert
// (anders als die Kern-Felder), weil eine Listen-Zeile fachlich eine
// zusammengehörige Einheit ist (analog zum Zitat-Segment in
// pressemitteilung-editor.tsx).

import { useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { AutoGrowTextarea } from "@/app/vorgaenge/[id]/components/auto-grow-textarea";
import type { ListenTabellenKonfiguration } from "@/lib/kundenprofil-felder";

export function ListenZeileFormular({
  konfiguration,
  initialWerte,
  onSpeichern,
  onAbbrechen,
}: {
  konfiguration: ListenTabellenKonfiguration;
  initialWerte: Record<string, unknown>;
  onSpeichern: (werte: Record<string, unknown>) => void;
  onAbbrechen: () => void;
}) {
  const [werte, setWerte] = useState<Record<string, unknown>>(initialWerte);
  const geradeAbgebrochen = useRef(false);

  function abbrechen() {
    geradeAbgebrochen.current = true;
    onAbbrechen();
  }

  function speichern() {
    onSpeichern(werte);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      abbrechen();
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      speichern();
    }
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    if (geradeAbgebrochen.current) {
      geradeAbgebrochen.current = false;
      return;
    }
    speichern();
  }

  return (
    <div
      role="group"
      aria-label={`${konfiguration.einzahl} bearbeiten`}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      className="space-y-2 rounded-md border border-primary p-2"
    >
      {konfiguration.felder.map((feld, index) => (
        <div key={feld.key}>
          <label className="block text-xs text-ink-muted" htmlFor={`feld-${konfiguration.tabelle}-${feld.key}`}>
            {feld.label}
          </label>
          {feld.typ === "boolean" ? (
            <input
              id={`feld-${konfiguration.tabelle}-${feld.key}`}
              type="checkbox"
              autoFocus={index === 0}
              checked={Boolean(werte[feld.key])}
              onChange={(event) => setWerte((bisherig) => ({ ...bisherig, [feld.key]: event.target.checked }))}
              className="ml-1"
            />
          ) : feld.typ === "select" ? (
            <select
              id={`feld-${konfiguration.tabelle}-${feld.key}`}
              autoFocus={index === 0}
              value={String(werte[feld.key] ?? "")}
              onChange={(event) => setWerte((bisherig) => ({ ...bisherig, [feld.key]: event.target.value || null }))}
              className="w-full rounded-md border border-border bg-surface p-1 text-sm text-ink outline-none"
            >
              <option value="">— keine Angabe —</option>
              {feld.optionen?.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : feld.typ === "textarea" ? (
            <AutoGrowTextarea
              value={String(werte[feld.key] ?? "")}
              onChange={(wert) => setWerte((bisherig) => ({ ...bisherig, [feld.key]: wert }))}
              ariaLabel={feld.label}
              autoFocus={index === 0}
            />
          ) : feld.typ === "number" ? (
            <input
              id={`feld-${konfiguration.tabelle}-${feld.key}`}
              type="number"
              autoFocus={index === 0}
              value={String(werte[feld.key] ?? 0)}
              onChange={(event) => setWerte((bisherig) => ({ ...bisherig, [feld.key]: Number(event.target.value) }))}
              className="w-full rounded-md border border-border bg-surface p-1 text-sm text-ink outline-none"
            />
          ) : feld.typ === "date" ? (
            <input
              id={`feld-${konfiguration.tabelle}-${feld.key}`}
              type="date"
              autoFocus={index === 0}
              value={String(werte[feld.key] ?? "")}
              onChange={(event) => setWerte((bisherig) => ({ ...bisherig, [feld.key]: event.target.value }))}
              className="w-full rounded-md border border-border bg-surface p-1 text-sm text-ink outline-none"
            />
          ) : (
            <input
              id={`feld-${konfiguration.tabelle}-${feld.key}`}
              type="text"
              autoFocus={index === 0}
              value={String(werte[feld.key] ?? "")}
              onChange={(event) => setWerte((bisherig) => ({ ...bisherig, [feld.key]: event.target.value }))}
              className="w-full rounded-md border border-border bg-surface p-1 text-sm text-ink outline-none"
            />
          )}
        </div>
      ))}
      <div className="flex gap-3 pt-1">
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={speichern} className="text-xs text-primary underline">
          Speichern
        </button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={abbrechen} className="text-xs text-ink-muted underline">
          Abbrechen
        </button>
      </div>
    </div>
  );
}
