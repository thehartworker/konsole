"use client";

// Vorschlags-Karten (Issue #50, Aufgabe C): eigene UI-Schicht getrennt vom
// Feld-Editor (siehe docs/decisions/2026-07-17_konsole-block3-profil-editor.md,
// Abschnitt 2). "Übernehmen" schreibt den Vorschlag als 'abgeleitet' ins
// Profil, "Ablehnen" verwirft ihn client-seitig (nie persistiert). Beide
// Aktionen landen für 15 Sekunden im Undo-Stack (maximal die letzten fünf
// Aktionen, nicht sitzungsübergreifend).

import { useEffect, useRef, useState } from "react";
import { uebernehmeVorschlagAction, verwerfeVorschlagAction } from "../actions";
import { SEKTIONS_LABEL, type Vorschlag } from "@/lib/profil-vorschlaege";

const UNDO_FRIST_MS = 15_000;
const UNDO_MAX_EINTRAEGE = 5;

interface UndoEintrag {
  id: string;
  beschreibung: string;
  ablaufAm: number;
  rueckgaengig: () => void;
}

function quelleLabel(quelle: Vorschlag["quelle"]): string {
  return quelle === "dokument-upload" ? "dem Dokument" : "der Website";
}

export function VorschlaegePanel({
  kundeId,
  vorschlaege,
  quelleBezeichnung,
  erstelltAm,
  unklareHinweise,
  onVorschlaegeGeaendert,
  onUebernommen,
  onUebernahmeRueckgaengig,
}: {
  kundeId: string;
  vorschlaege: Vorschlag[];
  quelleBezeichnung: string;
  erstelltAm: string;
  unklareHinweise: string[];
  onVorschlaegeGeaendert: (neu: Vorschlag[] | ((bisherig: Vorschlag[]) => Vorschlag[])) => void;
  onUebernommen: (vorschlag: Vorschlag, eingefuegteId?: string) => void;
  onUebernahmeRueckgaengig: (vorschlag: Vorschlag) => void;
}) {
  const [wirdVerarbeitet, setWirdVerarbeitet] = useState<Set<string>>(new Set());
  const [undoStack, setUndoStack] = useState<UndoEintrag[]>([]);
  const [sammelDialog, setSammelDialog] = useState<"uebernehmen" | "ablehnen" | null>(null);
  const [uebernommenAnzahl, setUebernommenAnzahl] = useState(0);
  const [abgelehntAnzahl, setAbgelehntAnzahl] = useState(0);
  const timerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const timers = timerRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  function undoHinzufuegen(eintrag: Omit<UndoEintrag, "ablaufAm">) {
    const vollstaendig: UndoEintrag = { ...eintrag, ablaufAm: Date.now() + UNDO_FRIST_MS };
    setUndoStack((bisherig) => [...bisherig, vollstaendig].slice(-UNDO_MAX_EINTRAEGE));
    const timer = setTimeout(() => {
      setUndoStack((bisherig) => bisherig.filter((e) => e.id !== eintrag.id));
      timerRef.current.delete(eintrag.id);
    }, UNDO_FRIST_MS);
    timerRef.current.set(eintrag.id, timer);
  }

  function undoAusfuehren(id: string) {
    const eintrag = undoStack.find((e) => e.id === id);
    if (!eintrag) return;
    const timer = timerRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timerRef.current.delete(id);
    }
    setUndoStack((bisherig) => bisherig.filter((e) => e.id !== id));
    eintrag.rueckgaengig();
  }

  function markiereVerarbeitung(vorschlagId: string, verarbeitet: boolean) {
    setWirdVerarbeitet((bisherig) => {
      const kopie = new Set(bisherig);
      if (verarbeitet) kopie.add(vorschlagId);
      else kopie.delete(vorschlagId);
      return kopie;
    });
  }

  async function ablehnen(vorschlag: Vorschlag) {
    onVorschlaegeGeaendert(vorschlaege.filter((v) => v.id !== vorschlag.id));
    setAbgelehntAnzahl((n) => n + 1);
    await verwerfeVorschlagAction(vorschlag.id);
    undoHinzufuegen({
      id: `ablehnen-${vorschlag.id}-${Date.now()}`,
      beschreibung: `"${vorschlag.feldLabel}" abgelehnt`,
      rueckgaengig: () => {
        setAbgelehntAnzahl((n) => Math.max(0, n - 1));
        onVorschlaegeGeaendert((bisherig) => [...bisherig, vorschlag]);
      },
    });
  }

  /** Übernimmt EINEN Vorschlag serverseitig, ohne die Vorschlags-Liste selbst zu verändern (das macht der Aufrufer). */
  async function uebernehmenEinzeln(vorschlag: Vorschlag): Promise<boolean> {
    markiereVerarbeitung(vorschlag.id, true);
    const resultat = await uebernehmeVorschlagAction(vorschlag, kundeId);
    markiereVerarbeitung(vorschlag.id, false);

    if (resultat.status === "fehler") {
      window.alert(`Übernehmen fehlgeschlagen: ${resultat.meldung}`);
      return false;
    }

    onUebernommen(vorschlag, resultat.id);
    setUebernommenAnzahl((n) => n + 1);
    return true;
  }

  async function uebernehmen(vorschlag: Vorschlag) {
    const erfolgreich = await uebernehmenEinzeln(vorschlag);
    if (!erfolgreich) return;

    onVorschlaegeGeaendert(vorschlaege.filter((v) => v.id !== vorschlag.id));
    undoHinzufuegen({
      id: `uebernehmen-${vorschlag.id}-${Date.now()}`,
      beschreibung: `"${vorschlag.feldLabel}" übernommen`,
      rueckgaengig: () => {
        setUebernommenAnzahl((n) => Math.max(0, n - 1));
        onVorschlaegeGeaendert((bisherig) => [...bisherig, vorschlag]);
        onUebernahmeRueckgaengig(vorschlag);
      },
    });
  }

  async function alleUebernehmen() {
    setSammelDialog(null);
    const alle = [...vorschlaege];
    onVorschlaegeGeaendert([]);
    for (const vorschlag of alle) {
      await uebernehmenEinzeln(vorschlag);
    }
    undoHinzufuegen({
      id: `alle-uebernehmen-${Date.now()}`,
      beschreibung: `${alle.length} Vorschläge übernommen`,
      rueckgaengig: () => {
        setUebernommenAnzahl((n) => Math.max(0, n - alle.length));
        onVorschlaegeGeaendert(alle);
        alle.forEach((vorschlag) => onUebernahmeRueckgaengig(vorschlag));
      },
    });
  }

  async function alleAblehnen() {
    setSammelDialog(null);
    const alle = [...vorschlaege];
    onVorschlaegeGeaendert([]);
    setAbgelehntAnzahl((n) => n + alle.length);
    for (const vorschlag of alle) {
      await verwerfeVorschlagAction(vorschlag.id);
    }
    undoHinzufuegen({
      id: `alle-ablehnen-${Date.now()}`,
      beschreibung: `${alle.length} Vorschläge abgelehnt`,
      rueckgaengig: () => {
        setAbgelehntAnzahl((n) => Math.max(0, n - alle.length));
        onVorschlaegeGeaendert(alle);
      },
    });
  }

  if (vorschlaege.length === 0 && undoStack.length === 0) return null;

  return (
    <section
      aria-label="Neue Vorschläge aus KI-Extraktion"
      className="rounded-lg border border-primary bg-surface p-4"
    >
      {vorschlaege.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink">
              Neue Vorschläge aus {quelleLabel(vorschlaege[0].quelle)} „{quelleBezeichnung}“, erstellt am {erstelltAm}
            </h2>
            <p className="text-xs text-ink-muted">
              {vorschlaege.length + uebernommenAnzahl + abgelehntAnzahl} Vorschläge, {uebernommenAnzahl} übernommen,{" "}
              {abgelehntAnzahl} abgelehnt, {vorschlaege.length} offen
            </p>
          </div>

          {unklareHinweise.length > 0 && (
            <p className="mt-2 text-xs text-ink-muted">
              {unklareHinweise.length} unklare Hinweise im Text gefunden (nicht sicher genug für einen Vorschlag), werden nicht angezeigt.
            </p>
          )}

          <div className="mt-3 flex gap-3">
            <button type="button" onClick={() => setSammelDialog("uebernehmen")} className="text-xs text-primary underline">
              Alle übernehmen
            </button>
            <button type="button" onClick={() => setSammelDialog("ablehnen")} className="text-xs text-ink-muted underline">
              Alle ablehnen
            </button>
          </div>

          {sammelDialog && (
            <div role="alertdialog" aria-label="Sammel-Aktion bestätigen" className="mt-3 rounded-md border border-warning-border bg-warning-bg p-3 text-xs text-warning">
              <p>
                Sicher? {vorschlaege.length} Vorschläge werden auf einmal {sammelDialog === "uebernehmen" ? "übernommen" : "abgelehnt"}.
              </p>
              <div className="mt-2 flex gap-3">
                <button
                  type="button"
                  onClick={sammelDialog === "uebernehmen" ? alleUebernehmen : alleAblehnen}
                  className="underline"
                >
                  Bestätigen
                </button>
                <button type="button" onClick={() => setSammelDialog(null)} className="underline">
                  Abbrechen
                </button>
              </div>
            </div>
          )}

          <ul className="mt-4 space-y-2">
            {vorschlaege.map((vorschlag) => (
              <li
                key={vorschlag.id}
                tabIndex={0}
                role="group"
                aria-label={`Vorschlag für ${vorschlag.feldLabel}: ${vorschlag.wertAnzeige}. Taste u übernimmt, Taste a lehnt ab.`}
                onKeyDown={(event) => {
                  if (wirdVerarbeitet.has(vorschlag.id)) return;
                  if (event.key === "u" || event.key === "U") {
                    event.preventDefault();
                    void uebernehmen(vorschlag);
                  } else if (event.key === "a" || event.key === "A") {
                    event.preventDefault();
                    void ablehnen(vorschlag);
                  }
                }}
                className="rounded-md border border-border bg-surface-subtle p-3 focus:outline focus:outline-2 focus:outline-primary"
              >
                <p className="text-xs font-medium text-ink-muted">
                  {SEKTIONS_LABEL[vorschlag.sektion]} · {vorschlag.feldLabel}
                </p>
                <p className="mt-1 text-sm text-ink">{vorschlag.wertAnzeige}</p>
                <p className="mt-1 text-xs italic text-ink-muted">
                  abgeleitet aus {quelleLabel(vorschlag.quelle)} „{vorschlag.quelleBezeichnung}“, extrahiert am {vorschlag.stand}
                </p>
                <div className="mt-2 flex gap-3">
                  <button
                    type="button"
                    disabled={wirdVerarbeitet.has(vorschlag.id)}
                    onClick={() => uebernehmen(vorschlag)}
                    aria-label={`Vorschlag übernehmen: ${vorschlag.feldLabel}`}
                    className="text-xs text-primary underline disabled:opacity-50"
                  >
                    Übernehmen <span aria-hidden="true">(u)</span>
                  </button>
                  <button
                    type="button"
                    disabled={wirdVerarbeitet.has(vorschlag.id)}
                    onClick={() => ablehnen(vorschlag)}
                    aria-label={`Vorschlag ablehnen: ${vorschlag.feldLabel}`}
                    className="text-xs text-ink-muted underline disabled:opacity-50"
                  >
                    Ablehnen <span aria-hidden="true">(a)</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {undoStack.length > 0 && (
        <ul aria-label="Rückgängig machen" className="mt-4 space-y-1 border-t border-border pt-3">
          {undoStack.map((eintrag) => (
            <li key={eintrag.id} className="flex items-center gap-2 text-xs text-ink-muted">
              <span>{eintrag.beschreibung}.</span>
              <button type="button" onClick={() => undoAusfuehren(eintrag.id)} className="text-primary underline">
                Rückgängig
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
