"use client";

// Editierbare Variante von PressemitteilungAnsicht (Issue #45, Konsole
// Block 2). PressemitteilungAnsicht bleibt als reine, zustandslose
// Darstellungs-Komponente erhalten (für Read-Only-Kontexte); dieser Editor
// re-implementiert dieselbe Struktur mit denselben data-segment-Markern,
// weil "auf Klick wird das Segment zum Editor" ein grundlegend anderes
// Render-Verhalten pro Feld braucht als ein DOM-Overlay über eine fremde
// Komponente. Siehe docs/decisions/2026-07-13_konsole-block2-editing-und-export.md,
// Abschnitt 7.
//
// Optimistic UI: jede Änderung wird sofort im lokalen State angezeigt, die
// Server-Action läuft im Hintergrund. Bei Fehler rollt der ANGEZEIGTE Wert
// zurück, der fehlgeschlagene Patch bleibt aber im State erhalten und ist
// über "Erneut versuchen" ohne erneute Eingabe sendbar (Abschnitt 8 der
// Decision -- kein Datenverlust trotz Rollback).
//
// Nur `import type` von @konsole/handlers: ein Laufzeit-Import würde
// pdfkit/docx (Node-only, aus w1/export.ts) in den Browser-Bundle ziehen.

import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from "react";
import type { W1Output } from "@konsole/handlers";
import { pressemitteilungBearbeitenAction } from "../actions";
import { pressemitteilungPatchAnwenden, type PressemitteilungPatch } from "@/lib/pressemitteilung-patch";
import { AutoGrowTextarea } from "./auto-grow-textarea";

interface FehlgeschlagenerPatch {
  patch: PressemitteilungPatch;
  meldung: string;
}

type Zitat = { text: string; sprecher_name: string; sprecher_rolle: string };

// ============================================================
// Generische Segment-Hülle: Klick/Enter aktiviert, Tab bewegt zwischen
// Segmenten (natürliche DOM-Tab-Reihenfolge über tabIndex=0), zeigt
// Speichert-/Fehler-Zustand dezent an.
// ============================================================

function SegmentContainer({
  segmentKey,
  ariaLabel,
  isEditing,
  onActivate,
  isSaving,
  fehler,
  onRetry,
  children,
  className,
}: {
  segmentKey: string;
  ariaLabel: string;
  isEditing: boolean;
  onActivate: () => void;
  isSaving: boolean;
  fehler?: FehlgeschlagenerPatch;
  onRetry: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-segment={segmentKey}
      className={`group rounded-md ${!isEditing ? "cursor-text hover:bg-surface-subtle" : ""} ${className ?? ""}`}
      role={isEditing ? undefined : "button"}
      tabIndex={isEditing ? -1 : 0}
      aria-label={isEditing ? undefined : ariaLabel}
      onClick={isEditing ? undefined : onActivate}
      onKeyDown={
        isEditing
          ? undefined
          : (event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onActivate();
              }
            }
      }
    >
      {children}
      {isSaving && (
        <span className="ml-2 text-xs text-ink-muted" aria-live="polite">
          Speichert…
        </span>
      )}
      {fehler && (
        <span role="alert" className="ml-2 text-xs text-danger">
          {fehler.meldung}{" "}
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.stopPropagation();
              onRetry();
            }}
            className="underline"
          >
            Erneut versuchen
          </button>
        </span>
      )}
    </div>
  );
}

// ============================================================
// Einzelfeld-Editor (Input für kurze, Textarea für lange Felder). Escape
// verwirft, Cmd/Ctrl+Enter speichert und schließt, Blur speichert
// automatisch (keine Save-Buttons pro Feld) -- außer der Blur folgt direkt
// auf ein Escape (geradeAbgebrochen-Ref verhindert Doppel-Aktion).
// ============================================================

function InlineFieldEditor({
  initialValue,
  multiline,
  ariaLabel,
  onSave,
  onCancel,
}: {
  initialValue: string;
  multiline: boolean;
  ariaLabel: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}) {
  const [wert, setWert] = useState(initialValue);
  const geradeAbgebrochen = useRef(false);

  function abbrechen() {
    geradeAbgebrochen.current = true;
    onCancel();
  }

  function speichernFallsGeaendert() {
    if (wert !== initialValue && wert.trim().length > 0) {
      onSave(wert);
    } else {
      onCancel();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
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

  if (multiline) {
    return <AutoGrowTextarea value={wert} onChange={setWert} onKeyDown={handleKeyDown} onBlur={handleBlur} ariaLabel={ariaLabel} autoFocus />;
  }

  return (
    <input
      type="text"
      value={wert}
      onChange={(event) => setWert(event.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      aria-label={ariaLabel}
      autoFocus
      className="w-full rounded-md border border-primary bg-surface p-1 text-sm text-ink outline-none"
    />
  );
}

function TextSegment({
  segmentKey,
  ariaLabel,
  value,
  multiline,
  isEditing,
  isSaving,
  fehler,
  onActivate,
  onCancel,
  onSave,
  onRetry,
  renderDisplay,
  removable,
  onRemove,
}: {
  segmentKey: string;
  ariaLabel: string;
  value: string;
  multiline: boolean;
  isEditing: boolean;
  isSaving: boolean;
  fehler?: FehlgeschlagenerPatch;
  onActivate: () => void;
  onCancel: () => void;
  onSave: (value: string) => void;
  onRetry: () => void;
  renderDisplay: (value: string) => React.ReactNode;
  removable?: boolean;
  onRemove?: () => void;
}) {
  return (
    <SegmentContainer segmentKey={segmentKey} ariaLabel={`${ariaLabel}. Enter zum Bearbeiten.`} isEditing={isEditing} onActivate={onActivate} isSaving={isSaving} fehler={fehler} onRetry={onRetry}>
      {isEditing ? (
        <InlineFieldEditor initialValue={value} multiline={multiline} ariaLabel={ariaLabel} onSave={onSave} onCancel={onCancel} />
      ) : (
        <>
          {renderDisplay(value)}
          {removable && value && (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.stopPropagation();
                onRemove?.();
              }}
              className="ml-2 hidden text-xs text-ink-muted underline group-hover:inline"
            >
              Entfernen
            </button>
          )}
        </>
      )}
    </SegmentContainer>
  );
}

// ============================================================
// Zitat: Text, Sprecher-Name, Sprecher-Rolle werden zusammen editiert
// (Issue: "beim Edit werden alle drei Felder zugleich editierbar").
// ============================================================

function ZitatSegment({
  zitat,
  isEditing,
  isSaving,
  fehler,
  onActivate,
  onCancel,
  onSave,
  onRetry,
  onRemove,
}: {
  zitat: Zitat | null;
  isEditing: boolean;
  isSaving: boolean;
  fehler?: FehlgeschlagenerPatch;
  onActivate: () => void;
  onCancel: () => void;
  onSave: (zitat: Zitat) => void;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const [text, setText] = useState(zitat?.text ?? "");
  const [name, setName] = useState(zitat?.sprecher_name ?? "");
  const [rolle, setRolle] = useState(zitat?.sprecher_rolle ?? "");
  const geradeAbgebrochen = useRef(false);

  useEffect(() => {
    if (isEditing) {
      setText(zitat?.text ?? "");
      setName(zitat?.sprecher_name ?? "");
      setRolle(zitat?.sprecher_rolle ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  function abbrechen() {
    geradeAbgebrochen.current = true;
    onCancel();
  }

  function speichernFallsGeaendert() {
    const geaendert = text !== (zitat?.text ?? "") || name !== (zitat?.sprecher_name ?? "") || rolle !== (zitat?.sprecher_rolle ?? "");
    if (geaendert && text.trim() && name.trim() && rolle.trim()) {
      onSave({ text, sprecher_name: name, sprecher_rolle: rolle });
    } else {
      onCancel();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      abbrechen();
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      speichernFallsGeaendert();
    }
  }

  function handleBlur(event: React.FocusEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    if (geradeAbgebrochen.current) {
      geradeAbgebrochen.current = false;
      return;
    }
    speichernFallsGeaendert();
  }

  if (!isEditing) {
    return (
      <SegmentContainer segmentKey="zitat" ariaLabel="Zitat, Sprechername und Sprecherrolle. Enter zum Bearbeiten." isEditing={false} onActivate={onActivate} isSaving={isSaving} fehler={fehler} onRetry={onRetry}>
        {zitat ? (
          <blockquote className="border-l-4 border-border pl-4 text-sm italic text-ink">
            „{zitat.text}“
            <footer className="mt-1 not-italic text-xs text-ink-muted">
              {zitat.sprecher_name}, {zitat.sprecher_rolle}
            </footer>
          </blockquote>
        ) : (
          <p className="text-xs text-ink-muted underline">+ Zitat hinzufügen</p>
        )}
      </SegmentContainer>
    );
  }

  return (
    <div
      data-segment="zitat"
      role="group"
      aria-label="Zitat bearbeiten: Text, Sprecher-Name, Sprecher-Rolle"
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      className="space-y-1 rounded-md border border-primary p-2"
    >
      <AutoGrowTextarea value={text} onChange={setText} ariaLabel="Zitat-Text" autoFocus />
      <input
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        aria-label="Sprecher-Name"
        className="w-full rounded-md border border-border bg-surface p-1 text-sm text-ink outline-none"
      />
      <input
        type="text"
        value={rolle}
        onChange={(event) => setRolle(event.target.value)}
        aria-label="Sprecher-Rolle"
        className="w-full rounded-md border border-border bg-surface p-1 text-sm text-ink outline-none"
      />
      {zitat && (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onRemove}
          className="text-xs text-danger underline"
        >
          Zitat entfernen
        </button>
      )}
    </div>
  );
}

// ============================================================
// Haupt-Komponente
// ============================================================

export function PressemitteilungEditor({
  handlerAufrufId,
  initial,
  wurdeBereitsBearbeitet,
  warFreigegeben,
}: {
  handlerAufrufId: string;
  initial: W1Output;
  wurdeBereitsBearbeitet: boolean;
  warFreigegeben: boolean;
}) {
  const [dokument, setDokument] = useState<W1Output>(initial);
  const [aktivesSegment, setAktivesSegment] = useState<string | null>(null);
  const [speichertSegment, setSpeichertSegment] = useState<string | null>(null);
  const [fehlgeschlagen, setFehlgeschlagen] = useState<Record<string, FehlgeschlagenerPatch>>({});
  const [freigabeErloschen, setFreigabeErloschen] = useState(false);
  const [neuerAbsatzOffen, setNeuerAbsatzOffen] = useState(false);
  const [, startTransition] = useTransition();

  const { pressemitteilung } = dokument;

  function commitPatch(segmentKey: string, patch: PressemitteilungPatch) {
    const snapshotVorher = dokument;
    setDokument((bisherig) => pressemitteilungPatchAnwenden(bisherig, patch));
    setAktivesSegment(null);
    setSpeichertSegment(segmentKey);
    setFehlgeschlagen((bisherig) => {
      if (!(segmentKey in bisherig)) return bisherig;
      const kopie = { ...bisherig };
      delete kopie[segmentKey];
      return kopie;
    });

    startTransition(async () => {
      try {
        const resultat = await pressemitteilungBearbeitenAction(handlerAufrufId, patch);
        setSpeichertSegment(null);
        if (resultat.status === "erfolg") {
          if (resultat.freigabeErloschen) setFreigabeErloschen(true);
        } else {
          setDokument(snapshotVorher);
          setFehlgeschlagen((bisherig) => ({ ...bisherig, [segmentKey]: { patch, meldung: resultat.meldung } }));
        }
      } catch {
        setSpeichertSegment(null);
        setDokument(snapshotVorher);
        setFehlgeschlagen((bisherig) => ({ ...bisherig, [segmentKey]: { patch, meldung: "Netzwerkfehler. Änderung ist nicht verloren." } }));
      }
    });
  }

  function erneutVersuchen(segmentKey: string) {
    const eintrag = fehlgeschlagen[segmentKey];
    if (eintrag) commitPatch(segmentKey, eintrag.patch);
  }

  function absatzBearbeiten(index: number, wert: string) {
    const neueAbsaetze = pressemitteilung.ausfuehrung_absaetze.map((absatz, i) => (i === index ? wert : absatz));
    commitPatch(`ausfuehrung_absaetze.${index}`, { ausfuehrung_absaetze: neueAbsaetze });
  }

  function absatzEntfernen(index: number) {
    const neueAbsaetze = pressemitteilung.ausfuehrung_absaetze.filter((_, i) => i !== index);
    commitPatch("ausfuehrung_absaetze", { ausfuehrung_absaetze: neueAbsaetze });
  }

  function absatzHinzufuegenSpeichern(wert: string) {
    setNeuerAbsatzOffen(false);
    const neueAbsaetze = [...pressemitteilung.ausfuehrung_absaetze, wert];
    commitPatch("ausfuehrung_absaetze", { ausfuehrung_absaetze: neueAbsaetze });
  }

  const zeigeFreigabeHinweis = freigabeErloschen || (wurdeBereitsBearbeitet && !warFreigegeben);
  const absaetzeAnzahl = pressemitteilung.ausfuehrung_absaetze.length;

  return (
    <div className="space-y-4">
      {zeigeFreigabeHinweis && (
        <p role="status" className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning">
          Sie haben nach der Freigabe Änderungen vorgenommen — der Vorgang muss erneut freigegeben werden.
        </p>
      )}

      <div data-segment="headline">
        <TextSegment
          segmentKey="headline"
          ariaLabel="Überschrift"
          value={pressemitteilung.headline}
          multiline={false}
          isEditing={aktivesSegment === "headline"}
          isSaving={speichertSegment === "headline"}
          fehler={fehlgeschlagen.headline}
          onActivate={() => setAktivesSegment("headline")}
          onCancel={() => setAktivesSegment(null)}
          onSave={(wert) => commitPatch("headline", { headline: wert })}
          onRetry={() => erneutVersuchen("headline")}
          renderDisplay={(wert) => <h3 className="text-base font-semibold text-ink">{wert}</h3>}
        />

        <TextSegment
          segmentKey="sub_headline"
          ariaLabel="Untertitel"
          value={pressemitteilung.sub_headline ?? ""}
          multiline={false}
          isEditing={aktivesSegment === "sub_headline"}
          isSaving={speichertSegment === "sub_headline"}
          fehler={fehlgeschlagen.sub_headline}
          onActivate={() => setAktivesSegment("sub_headline")}
          onCancel={() => setAktivesSegment(null)}
          onSave={(wert) => commitPatch("sub_headline", { sub_headline: wert })}
          onRetry={() => erneutVersuchen("sub_headline")}
          removable
          onRemove={() => commitPatch("sub_headline", { sub_headline: null })}
          renderDisplay={(wert) =>
            wert ? (
              <p className="text-sm text-ink-muted">{wert}</p>
            ) : (
              <p className="text-xs text-ink-muted underline">+ Untertitel hinzufügen</p>
            )
          }
        />
      </div>

      <TextSegment
        segmentKey="ort_datum"
        ariaLabel="Ort und Datum"
        value={pressemitteilung.ort_datum}
        multiline={false}
        isEditing={aktivesSegment === "ort_datum"}
        isSaving={speichertSegment === "ort_datum"}
        fehler={fehlgeschlagen.ort_datum}
        onActivate={() => setAktivesSegment("ort_datum")}
        onCancel={() => setAktivesSegment(null)}
        onSave={(wert) => commitPatch("ort_datum", { ort_datum: wert })}
        onRetry={() => erneutVersuchen("ort_datum")}
        renderDisplay={(wert) => <p className="text-xs text-ink-muted">{wert}</p>}
      />

      <TextSegment
        segmentKey="lead_absatz"
        ariaLabel="Lead-Absatz"
        value={pressemitteilung.lead_absatz}
        multiline
        isEditing={aktivesSegment === "lead_absatz"}
        isSaving={speichertSegment === "lead_absatz"}
        fehler={fehlgeschlagen.lead_absatz}
        onActivate={() => setAktivesSegment("lead_absatz")}
        onCancel={() => setAktivesSegment(null)}
        onSave={(wert) => commitPatch("lead_absatz", { lead_absatz: wert })}
        onRetry={() => erneutVersuchen("lead_absatz")}
        renderDisplay={(wert) => <p className="text-sm font-medium text-ink">{wert}</p>}
      />

      <div data-segment="ausfuehrung_absaetze" className="space-y-3">
        {pressemitteilung.ausfuehrung_absaetze.map((absatz, index) => {
          const segmentKey = `ausfuehrung_absaetze.${index}`;
          return (
            <div key={index} className="group/absatz">
              <TextSegment
                segmentKey={segmentKey}
                ariaLabel={`Absatz ${index + 1} von ${absaetzeAnzahl}`}
                value={absatz}
                multiline
                isEditing={aktivesSegment === segmentKey}
                isSaving={speichertSegment === segmentKey}
                fehler={fehlgeschlagen[segmentKey]}
                onActivate={() => setAktivesSegment(segmentKey)}
                onCancel={() => setAktivesSegment(null)}
                onSave={(wert) => absatzBearbeiten(index, wert)}
                onRetry={() => erneutVersuchen(segmentKey)}
                renderDisplay={(wert) => <p className="text-sm text-ink">{wert}</p>}
              />
              {absaetzeAnzahl > 1 && (
                <button
                  type="button"
                  onClick={() => absatzEntfernen(index)}
                  aria-label={`Absatz ${index + 1} entfernen`}
                  className="mt-1 hidden text-xs text-ink-muted underline group-hover/absatz:inline"
                >
                  Absatz entfernen
                </button>
              )}
            </div>
          );
        })}

        {neuerAbsatzOffen ? (
          <InlineFieldEditor
            initialValue=""
            multiline
            ariaLabel={`Absatz ${absaetzeAnzahl + 1} von ${absaetzeAnzahl + 1}`}
            onSave={absatzHinzufuegenSpeichern}
            onCancel={() => setNeuerAbsatzOffen(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setAktivesSegment(null);
              setNeuerAbsatzOffen(true);
            }}
            className="text-xs text-ink-muted underline"
          >
            + Absatz hinzufügen
          </button>
        )}
      </div>

      <ZitatSegment
        zitat={pressemitteilung.zitat}
        isEditing={aktivesSegment === "zitat"}
        isSaving={speichertSegment === "zitat"}
        fehler={fehlgeschlagen.zitat}
        onActivate={() => setAktivesSegment("zitat")}
        onCancel={() => setAktivesSegment(null)}
        onSave={(zitat) => commitPatch("zitat", { zitat })}
        onRetry={() => erneutVersuchen("zitat")}
        onRemove={() => commitPatch("zitat", { zitat: null })}
      />

      <TextSegment
        segmentKey="boilerplate"
        ariaLabel="Boilerplate"
        value={pressemitteilung.boilerplate}
        multiline
        isEditing={aktivesSegment === "boilerplate"}
        isSaving={speichertSegment === "boilerplate"}
        fehler={fehlgeschlagen.boilerplate}
        onActivate={() => setAktivesSegment("boilerplate")}
        onCancel={() => setAktivesSegment(null)}
        onSave={(wert) => commitPatch("boilerplate", { boilerplate: wert })}
        onRetry={() => erneutVersuchen("boilerplate")}
        renderDisplay={(wert) => <p className="text-xs text-ink-muted">{wert}</p>}
      />

      <TextSegment
        segmentKey="kontakt_fusszeile"
        ariaLabel="Kontakt-Fußzeile"
        value={pressemitteilung.kontakt_fusszeile}
        multiline
        isEditing={aktivesSegment === "kontakt_fusszeile"}
        isSaving={speichertSegment === "kontakt_fusszeile"}
        fehler={fehlgeschlagen.kontakt_fusszeile}
        onActivate={() => setAktivesSegment("kontakt_fusszeile")}
        onCancel={() => setAktivesSegment(null)}
        onSave={(wert) => commitPatch("kontakt_fusszeile", { kontakt_fusszeile: wert })}
        onRetry={() => erneutVersuchen("kontakt_fusszeile")}
        renderDisplay={(wert) => <p className="whitespace-pre-wrap text-xs text-ink-muted">{wert}</p>}
      />
    </div>
  );
}
