"use client";

// KI-Befüllung als transaktionale Aktion (Issue #50, Aufgabe D): zwei
// explizit gestartete Aktionen ("Aus Dokument befüllen", "Aus Website
// befüllen"), kein automatischer Hintergrund-Lauf. Während der (einen)
// Server-Action-Anfrage zeigt die UI eine ruhige, mehrphasige
// Fortschritts-Anzeige -- die Phasen sind eine feste Erzähl-Sequenz
// während der EINEN awaited Anfrage (kein echtes Server-Streaming in
// diesem Stack), nicht einzeln vom Server bestätigte Schritte.

import { useEffect, useRef, useState, type DragEvent } from "react";
import { starteDokumentExtraktionAction, starteWebsiteExtraktionAction, type ExtraktionsResultat } from "../actions";
import type { Vorschlag } from "@/lib/profil-vorschlaege";

const DOKUMENT_PHASEN = ["Dokument wird geladen", "Text wird extrahiert", "Vorschläge werden erstellt"];
const WEBSITE_PHASEN = ["Website wird abgerufen (robots.txt-konform)", "Relevante Seiten werden ausgewählt", "Vorschläge werden erstellt"];
const PHASE_INTERVALL_MS = 1600;

function useFortschrittsPhasen(phasen: string[], aktiv: boolean): string | null {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!aktiv) {
      setIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setIndex((bisherig) => Math.min(bisherig + 1, phasen.length - 1));
    }, PHASE_INTERVALL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktiv]);

  return aktiv ? phasen[index] : null;
}

export function ExtraktionsAktionen({
  kundeId,
  onErgebnis,
}: {
  kundeId: string;
  onErgebnis: (ergebnis: { vorschlaege: Vorschlag[]; quelleBezeichnung: string; erstelltAm: string; unklareHinweise: string[] }) => void;
}) {
  const [dokumentDialogOffen, setDokumentDialogOffen] = useState(false);
  const [websiteDialogOffen, setWebsiteDialogOffen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [dragAktiv, setDragAktiv] = useState(false);
  const dateiInputRef = useRef<HTMLInputElement>(null);

  const dokumentPhase = useFortschrittsPhasen(DOKUMENT_PHASEN, laeuft && dokumentDialogOffen);
  const websitePhase = useFortschrittsPhasen(WEBSITE_PHASEN, laeuft && websiteDialogOffen);

  function ergebnisVerarbeiten(resultat: ExtraktionsResultat) {
    setLaeuft(false);
    if (resultat.status === "fehler") {
      setFehler(resultat.meldung);
      return;
    }
    setDokumentDialogOffen(false);
    setWebsiteDialogOffen(false);
    setFehler(null);
    onErgebnis({
      vorschlaege: resultat.vorschlaege,
      quelleBezeichnung: resultat.quelleBezeichnung,
      erstelltAm: new Date().toLocaleDateString("de-DE"),
      unklareHinweise: resultat.unklareHinweise,
    });
  }

  async function dateiHochladen(datei: File) {
    setFehler(null);
    setLaeuft(true);
    const formData = new FormData();
    formData.set("datei", datei);
    const resultat = await starteDokumentExtraktionAction(kundeId, formData);
    ergebnisVerarbeiten(resultat);
  }

  async function websiteAbrufen() {
    setFehler(null);
    setLaeuft(true);
    const resultat = await starteWebsiteExtraktionAction(kundeId, url);
    ergebnisVerarbeiten(resultat);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragAktiv(false);
    const datei = event.dataTransfer.files?.[0];
    if (datei) void dateiHochladen(datei);
  }

  return (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        onClick={() => {
          setFehler(null);
          setDokumentDialogOffen(true);
        }}
        className="rounded-md border border-primary px-3 py-1.5 text-sm text-primary hover:bg-primary hover:text-white"
      >
        Aus Dokument befüllen
      </button>
      <button
        type="button"
        onClick={() => {
          setFehler(null);
          setWebsiteDialogOffen(true);
        }}
        className="rounded-md border border-primary px-3 py-1.5 text-sm text-primary hover:bg-primary hover:text-white"
      >
        Aus Website befüllen
      </button>

      {dokumentDialogOffen && (
        <div role="dialog" aria-label="Aus Dokument befüllen" className="w-full rounded-md border border-border bg-surface p-4">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragAktiv(true);
            }}
            onDragLeave={() => setDragAktiv(false)}
            onDrop={handleDrop}
            className={`rounded-md border-2 border-dashed p-6 text-center text-sm ${dragAktiv ? "border-primary bg-surface-subtle" : "border-border"}`}
          >
            <p className="text-ink-muted">PDF, DOCX oder TXT hierher ziehen oder</p>
            <button type="button" onClick={() => dateiInputRef.current?.click()} className="mt-2 text-primary underline">
              Datei auswählen
            </button>
            <input
              ref={dateiInputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              aria-label="Dokument auswählen"
              className="sr-only"
              onChange={(event) => {
                const datei = event.target.files?.[0];
                if (datei) void dateiHochladen(datei);
              }}
            />
          </div>

          {laeuft && (
            <p role="status" aria-live="polite" className="mt-3 text-sm text-ink-muted">
              {dokumentPhase}…
            </p>
          )}
          {fehler && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {fehler}
            </p>
          )}

          <button type="button" onClick={() => setDokumentDialogOffen(false)} className="mt-3 text-xs text-ink-muted underline">
            Schließen
          </button>
        </div>
      )}

      {websiteDialogOffen && (
        <div role="dialog" aria-label="Aus Website befüllen" className="w-full rounded-md border border-border bg-surface p-4">
          <label htmlFor="website-url" className="block text-xs text-ink-muted">
            Website-URL
          </label>
          <input
            id="website-url"
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://kunde.example"
            className="mt-1 w-full rounded-md border border-border bg-surface p-1.5 text-sm text-ink outline-none"
          />
          <button
            type="button"
            onClick={websiteAbrufen}
            disabled={laeuft || url.trim() === ""}
            className="mt-3 rounded-md bg-primary px-3 py-1.5 text-sm text-white hover:bg-primary-hover disabled:opacity-50"
          >
            Vorschläge erstellen
          </button>

          {laeuft && (
            <p role="status" aria-live="polite" className="mt-3 text-sm text-ink-muted">
              {websitePhase}…
            </p>
          )}
          {fehler && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {fehler}
            </p>
          )}

          <button type="button" onClick={() => setWebsiteDialogOffen(false)} className="mt-3 block text-xs text-ink-muted underline">
            Schließen
          </button>
        </div>
      )}
    </div>
  );
}
