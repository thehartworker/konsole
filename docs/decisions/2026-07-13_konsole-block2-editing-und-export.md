# Konsole Block 2: Inline-Editing und Multi-Format-Export der W1-Pressemitteilung

**Datum:** 2026-07-13
**Status:** vorgeschlagen
**Kontext:** Issue #45. Block 1 (Issue #43) zeigt das W1-Ergebnis in `pressemitteilung-ansicht.tsx` als Struktur-Segmente mit `data-segment`-Markierung an, bewusst vorbereitet für Inline-Editing (siehe docs/decisions/2026-07-13_konsole-block1-vorgangs-detailansicht.md, Abschnitt 7). Dieser Block macht daraus ein bearbeitbares und in drei Formaten (PDF, Word, Plain-Text) exportierbares Dokument -- der im Issue als "Wow-Moment" markierte Übergang von KI-Vorschlag zu redaktionell abgenommenem Dokument.

## Fixpunkte aus dem Issue (nicht neu entschieden)

1. **Persistenz:** `ergebnis_bearbeitet jsonb NULL` auf `handler_aufrufe`. `ergebnis` (KI-Original) bleibt unverändert. Anzeige/Export nutzen `ergebnis_bearbeitet ?? ergebnis`.
2. **Editing-Modell:** Feld-für-Feld über die bestehenden `data-segment`-Markierungen, keine globale Edit-Modus-Umschaltung. Absätze einzeln im Array, Zitat als zusammengehörige Gruppe.
3. **Export-Formate:** PDF, Word (.docx), Plain-Text, aus einer gemeinsamen Segment-Render-Funktion. Kein Corporate-Design in v1.
4. **Freigabe-Semantik:** Eine Bearbeitung nach Freigabe setzt `freigegeben_at`/`freigegeben_von_nutzer_id` (in diesem Schema: `freigegeben_durch`, siehe unten) automatisch zurück, durchgesetzt per DB-Trigger.

## Optionen und Entscheidungen

### 1. `ergebnis_bearbeitet` als JSONB, nicht als Versions-Tabelle

**Optionen:** (a) ein nullable JSONB-Feld, das den aktuellen bearbeiteten Zustand hält (b) eine `handler_aufrufe_versionen`-Tabelle mit einer Zeile pro Edit-Vorgang, volle Historie.

**Entscheidung:** (a). Der Bedarf in v1 ist "ein Original, ein aktuell bearbeiteter Zustand" -- keine Versions-Historie, kein Diff, kein Undo über mehrere Schritte hinweg (das ist im Issue explizit als "Nicht Teil dieses Blocks" markiert: "Versionierung/Historie der Bearbeitungen (v2)"). Eine Versions-Tabelle wäre für diesen Bedarf overengineered: zusätzliche Tabelle, zusätzliche RLS-Policies, zusätzliche Aggregations-Logik ("was ist der aktuelle Stand"), ohne dass v1 davon Gebrauch macht. Der JSONB-Ansatz ist in einer Migration später erweiterbar (eine `handler_aufrufe_versionen`-Tabelle kann in v2 ergänzt werden, die bei jedem Speichern zusätzlich einen Snapshot schreibt -- das ist additiv, kein Bruch am jetzigen Schema).

**Konsequenz:** kein Undo über den letzten Edit hinaus, keine "wer hat wann was geändert"-Historie außer dem einzelnen `bearbeitet_at`-Zeitstempel. Für v1 ausreichend, siehe Scope-Grenzen.

### 2. `ergebnis_bearbeitet` hat dieselbe Form wie `ergebnis` (voller `W1Output`), nicht nur `PressemitteilungDraft`

Das Issue sagt an einer Stelle "mit demselben Schema wie `ergebnis`" (Persistenz-Vorgabe) und an anderer Stelle "muss dem `PressemitteilungSchema` entsprechen" (Aufgabe B, Validierung). Das ist kein Widerspruch, wenn man beide Sätze zusammen liest: `handler-ergebnis.tsx` reicht `ergebnis`/`ergebnis_bearbeitet` unverändert als `W1Output` an `PressemitteilungAnsicht` durch (`eintrag.ergebnis as unknown as W1Output`). Damit `ergebnis_bearbeitet ?? ergebnis` an derselben Stelle funktioniert, muss `ergebnis_bearbeitet` ebenfalls die volle `W1Output`-Form haben (inklusive `kritiker_findings`, `grenz_pruefung_ergebnis`, `audit_metadaten` -- unverändert aus dem Original übernommen, nur `pressemitteilung` wird durch den Patch verändert).

**Entscheidung:** `ergebnisBearbeitenSpeichern` validiert das gespeicherte JSONB gegen `W1OutputSchema` (nicht nur `PressemitteilungSchema`). Weil `W1OutputSchema.shape.pressemitteilung` exakt `PressemitteilungSchema` ist, erfüllt das wörtlich die Vorgabe aus Aufgabe B ("muss dem `PressemitteilungSchema` entsprechen") und zusätzlich die Persistenz-Vorgabe ("dasselbe Schema wie `ergebnis`"). Die Server-Action baut den vollständigen `W1Output` durch Merge des Patches in `(ergebnis_bearbeitet ?? ergebnis).pressemitteilung`, alle anderen Top-Level-Felder bleiben vom zuletzt bekannten Stand unverändert.

### 3. Freigabe-Erlöschen-Trigger auf DB-Ebene, nicht in der Anwendung

**Optionen:** (a) Server-Action prüft vor jedem Schreiben von `ergebnis_bearbeitet`, ob `freigegeben_at` gesetzt ist, und setzt es explizit zurück (b) `BEFORE UPDATE`-Trigger auf `handler_aufrufe`.

**Entscheidung:** (b), wie im Issue vorgegeben. Begründung, präzisiert: `handler_aufrufe_aktualisieren` (RLS-Policy aus Block 1) erlaubt jeder berechtigten Nutzerin ein UPDATE auf `handler_aufrufe` -- nicht nur über die eine Server-Action, die dieser Block baut. Jeder künftige Schreibpfad (ein Backoffice-Skript, ein zweiter Editor, ein direkter Supabase-Client-Aufruf während eines Debugging-Laufs) würde die Anwendungslogik umgehen, wenn die Freigabe-Rücksetzung nur in der Server-Action stünde. Ein Trigger ist die einzige Stelle, die JEDES UPDATE sieht, unabhängig vom Aufrufer -- konsistent mit dem bestehenden Muster `handler_aufrufe_agentur_id_setzen_trg`/`agentur_id`-Konsistenz-Trigger aus `20260711130300_agentur_id_konsistenz_trigger.sql`, das aus demselben Grund (deterministisch, nicht umgehbar) auf DB-Ebene sitzt statt in der Anwendung.

### 4. Export-Modul lebt in `packages/handlers/src/w1/export.ts`, kein eigenes Paket

**Optionen:** (a) neues Paket `packages/pressemitteilung-export` (b) `packages/handlers/src/w1/export.ts`.

**Entscheidung:** (b). Die Export-Logik hängt ausschließlich an `PressemitteilungDraft` (`packages/handlers/src/w1/schema.ts`) -- keine Persistenz-, keine UI-Abhängigkeit. Ein eigenes Paket wäre für ein einzelnes, eng an W1 gekoppeltes Modul zusätzliche Workspace-Komplexität (eigenes `package.json`, eigener Build-Eintrag, eigene Typecheck/Test-Pipeline) ohne einen zweiten Konsumenten, der die Trennung rechtfertigt. `packages/handlers/src/w1/` ist bereits der Ort, an dem die W1-Domänenlogik (Draft, Kritiker, Grenzen, Schema) lebt; Export ist eine weitere reine Funktion auf demselben Typ. Re-Export über `packages/handlers/src/w1/index.ts`, analog zu den bestehenden Exporten.

### 5. Export-Bibliotheken: `pdfkit` für PDF, `docx` für Word

**PDF -- `pdfkit` statt `pdf-lib`:** `pdfkit` hat eine deklarative Text-/Layout-API (`doc.fontSize(...).text(...)`, automatischer Zeilenumbruch, Font-Handling für Serif/Sans eingebaut), die für "Fließtext mit sauberer Typografie" der direktere Weg ist. `pdf-lib` ist stärker auf das Bearbeiten bestehender PDFs und manuelles Low-Level-Text-Placement ausgelegt (eigene Zeilenumbruch-Berechnung nötig) -- für ein neu erzeugtes, reines Text-Dokument ohne Formularfelder ist das unnötiger Mehraufwand. `pdfkit` ist außerdem die im Issue zuerst genannte Option.

**Word -- `docx`:** einzige im Issue genannte Option, keine Alternativen-Abwägung nötig. Die API bildet Word-Strukturen (Paragraph, HeadingLevel, TextRun) direkt ab, passend zur Anforderung "Beraterin kann sofort in ihrem Word-Workflow weiterarbeiten".

**Plain-Text:** keine Bibliothek, reine String-Konkatenation über dieselbe Segment-Liste.

### 6. Gemeinsames Zwischenformat: Segment-Liste

Alle drei Exporte und die Editor-UI (Aufgabe C) arbeiten konzeptionell auf denselben Feldern von `PressemitteilungDraft`. Für den Export wird das explizit als typisierte Segment-Liste materialisiert:

```typescript
type PressemitteilungSegment =
  | { typ: 'headline'; text: string }
  | { typ: 'sub_headline'; text: string }
  | { typ: 'ort_datum'; text: string }
  | { typ: 'lead_absatz'; text: string }
  | { typ: 'ausfuehrung_absatz'; text: string; index: number }
  | { typ: 'zitat'; text: string; sprecher_name: string; sprecher_rolle: string }
  | { typ: 'boilerplate'; text: string }
  | { typ: 'kontakt_fusszeile'; text: string };
```

`pressemitteilungSegmente(draft)` baut diese Liste einmal, `renderPressemitteilungText/Pdf/Docx` konsumieren sie. Segment-Reihenfolge und -Auswahl (sub_headline/zitat nullable, werden übersprungen wenn `null`) sind damit an genau einer Stelle definiert, nicht dreifach dupliziert.

### 7. Editor "wraps" die Ansicht -- praktische Umsetzung

`PressemitteilungAnsicht` bleibt unverändert als reine, zustandslose Darstellungs-Komponente (für Read-Only-Kontexte, z. B. einen späteren Kunden-Freigabe-Link außerhalb der Konsole). `pressemitteilung-editor.tsx` exportiert `PressemitteilungEditor`, eine Client-Komponente, die dieselbe visuelle Struktur mit denselben `data-segment`-Attributen re-implementiert (nicht `<PressemitteilungAnsicht>` intern rendert), weil "auf Klick wird das Segment zum Editor" ein grundlegend anderes Render-Verhalten pro Feld braucht (kontrollierte Inputs statt statischem Text) -- ein echtes DOM-Overlay über eine fremde Komponente wäre fragiler als eine zweite, editier-fähige Variante derselben Struktur. `HandlerErgebnis` (die Server-Komponente, die bisher `PressemitteilungAnsicht` direkt aufruft) ruft für W1 ab jetzt `PressemitteilungEditor`.

### 8. Optimistic UI: Rollback plus Retry, nicht "für immer im Client-State"

Der Qualitätsanspruch-Abschnitt des Issues ("Aenderung wird im Client-State gehalten, kein Datenverlust") und Aufgabe C ("bei Fehler wird der Zustand zurueckgerollt") beschreiben auf den ersten Blick unterschiedliche Verhalten. Auflösung: der **angezeigte Wert** des Segments rollt bei einem Fehler auf den zuletzt bestätigten Stand zurück (das UI zeigt keinen unbestätigten Wert als vermeintlich gespeichert an -- sonst könnte ein Reload den ungespeicherten Edit stillschweigend verwerfen, ohne dass die Nutzerin es merkt). Der fehlgeschlagene Patch wird dabei aber nicht verworfen, sondern im Editor-State der Komponente gehalten und über einen dezenten "Erneut versuchen"-Hinweis direkt am Segment erneut sendbar, ohne dass die Nutzerin den Text neu eingeben muss. Das erfüllt beide Sätze: kein Datenverlust (der Edit-Inhalt bleibt im Speicher und ist mit einem Klick erneut sendbar), UND der anzeigte/persistente Zustand rollt zurück (kein "Fake-gespeichert"-Zustand).

## Scope-Grenzen (aus dem Issue übernommen, hier verbindlich)

- Kein W2-Comms-Plan-Editing.
- Kein Corporate-Design/Logo im Export (kommt mit Block 4 White-Label).
- Keine Versionierung/Historie der Bearbeitungen (siehe Punkt 1 oben).
- Keine Drag-and-Drop-Umsortierung der Absätze.
- Kein kollaboratives Live-Editing mehrerer Nutzerinnen.
- Kein Direkt-Versand aus der Konsole (Export ist Download, kein E-Mail-Trigger).

## Konsequenzen

- Neue Spalten (`ergebnis_bearbeitet`, `bearbeitet_at`) und ein neuer Trigger auf `handler_aufrufe` -- DB-nah, sicherheitsrelevant, Review nötig (AGENTS.md §6.4).
- Zwei neue Produktions-Abhängigkeiten (`pdfkit`, `docx`) in `packages/handlers`.
- `HandlerErgebnis` wechselt für W1 von der reinen Anzeige zur editierbaren Variante -- `PressemitteilungAnsicht` bleibt exportiert, aber ab dieser Änderung ungenutzt innerhalb der Konsole selbst (bewusst erhalten für spätere Read-Only-Kontexte, siehe Punkt 7).
