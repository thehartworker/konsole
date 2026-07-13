# Konsole Block 1: Vorgangs-Detailansicht mit Handler-Ergebnis und Freigabe

**Datum:** 2026-07-13
**Status:** vorgeschlagen
**Kontext:** Issue #43. Bisher ist das Backend (Klassifikations-Layer, W1, W2, Kundenprofil) für keinen Menschen sichtbar -- `apps/web` hat nur `/login` und `/konto`. Dieser Block baut die erste echte Arbeitsfläche: `/vorgaenge/[id]` zeigt Eingang, Klassifikation und Handler-Ergebnis, und erlaubt zwei scharfe Aktionen (Handler auslösen, Ergebnis/Rückfrage freigeben), beide Shadow-Mode-konform (kein echter Versand, siehe SAAS_SPEC §5.1/§5.2).

## Optionen und Entscheidungen

### 1. `/vorgaenge`-Liste fehlt komplett -- wird hier mitgebaut

Der Auftrag geht davon aus, dass die Vorgangs-Liste bereits existiert ("Klick auf einen Vorgang in der Liste führt zu /vorgaenge/[id]"). Sie existiert nicht im Repo (nur `/login`, `/konto`). Ohne Liste ist die Detailansicht nicht erreichbar und nicht vorzeigbar. Diese Decision baut deshalb eine schlanke `/vorgaenge`-Liste mit (Tabelle: Kunde, Absender, Typ, Priorität, Sensitivity, Status, Eingang; sensitive Vorgänge visuell hervorgehoben, oben stehend, analog SAAS_SPEC §6.1), aber **nicht** die volle Drei-Spalten-Übersicht aus §6.1 (Aktivitäts-Spalte, Session-Log, Team-Log). Das ist ein eigener, deutlich größerer Block und nicht Gegenstand von Issue #43.

### 2. Design-Token-System und White-Label-Vorbereitung

CSS-Custom-Properties in `globals.css` unter einem `:root`-Block, kategorisiert: Farbe (`--color-primary`, `--color-accent`, `--color-neutral-*`, `--color-danger`, `--color-warning`), Radius (`--radius-sm/md/lg`), Spacing-Skala (`--space-1..8`), Typografie (`--font-sans`, Größen-Skala). Tailwind (`tailwind.config.ts`) referenziert diese Variablen über `theme.extend` (`colors: { primary: 'var(--color-primary)', ... }`), statt Tailwinds Default-Palette direkt in Komponenten zu verwenden. Damit bleibt jede Komponente frei von hartcodierten Hex-Werten.

Eine zusätzliche Datei `src/lib/theme.ts` exportiert ein `AgenturTheme`-Objekt (Primärfarbe, Akzentfarbe, Logo-URL, Agenturname) mit genau einem Wert: `DEFAULT_THEME` (neutrales Standard-Theme, MENSCH-neutral, kein Kunden-Branding). `layout.tsx` schreibt die Theme-Werte als Inline-`style`-Custom-Properties auf das `<html>`-Element. **Bewusst nicht gebaut:** Laden des Themes aus der DB pro Agentur -- das ist der in der Aufgabe explizit ausgeschlossene spätere Block. Die Vorbereitung besteht darin, dass `DEFAULT_THEME` an exakt einer Stelle steht und die Signatur (`AgenturTheme`) bereits das trägt, was später aus `agenturen` kommen könnte (Name, Primär-/Akzentfarbe, Logo-URL).

### 3. Aufbau der Detailansicht: vier Bereiche, eigene Komponenten pro Bereich

`src/app/vorgaenge/[id]/page.tsx` lädt Vorgang, Anliegen und Handler-Aufrufe über den Session-Client (RLS, siehe Punkt 6) und rendert vier Server-Komponenten:

- `EingangUndKlassifikation` (Kanal, Absender, Betreff, Inhalt als Zitat-Block, Klassifikations-Zusammenfassung, Anliegen-Liste mit Handler-Vorschlag)
- `HandlerErgebnis` (pro `handler_aufrufe`-Zeile: W1- oder W2-Ansicht je nach `handler_slug`, in Segment-Komponenten, siehe Punkt 7)
- `CompliancePanel` (Grenz-Verstöße, hoch-schweregradige Kritiker-Findings, Shadow-Mode-Banner, siehe Punkt 8)
- `FreigabeAktionen` (Client-Komponente: Handler-auslösen-Button pro offenem Anliegen, Freigeben-Button pro Handler-Ergebnis, Rückfrage-Textarea + Senden-Button)

### 4. Sensitive Vorgänge: bewusste Abweichung von SAAS_SPEC §6.3

SAAS_SPEC §6.3 sagt: bei `sensitivity in (vertraulich, krise)` oder Typ `Krise/Issue/Freigabe` zeigt die Detailansicht **keinen** Handler-Draft und keine Rückfrage, nur einen roten Hinweis-Block ("Läuft nicht automatisch. Ein Mensch übernimmt."). Issue #43 verlangt stattdessen ausdrücklich, dass Handler-Ergebnisse und Freigabe-Aktionen **sichtbar bleiben**, mit deutlich hervorgehobenen Compliance-Verstößen -- gerade weil der Pilot (MENSCH, Pharma) `regulatorisch_relevant` als Sensitivity-Kategorie hat und die Beraterin dort *gerade* das Handler-Ergebnis samt Grenzprüfung sehen muss, um es korrekt freizugeben oder abzulehnen.

**Entscheidung dieser Decision:** Issue-Vorgabe hat Vorrang, SAAS_SPEC §6.3 ist an dieser Stelle überholt (Handler-Ergebnisse werden für alle Sensitivity-Stufen angezeigt, nicht versteckt). Zusätzlich zeigt die Ansicht bei jeder Sensitivity ungleich `normal` einen roten Banner ("Sensitiver Vorgang -- ...").

> @thehartworker Entscheidung nötig: SAAS_SPEC §6.3 explizit für `vertraulich`/`krise`/`Krise`/`Issue`/`Freigabe` widersprechen (Handler-Draft anzeigen statt verstecken) -- passt das, oder soll ich für diese Fälle doch die Verstecken-Variante aus der Spec bauen und Freigabe-Aktionen dort sperren?

### 5. Handler-Auslösung als Server-Action -- welcher Supabase-Client

Zwei Optionen: (a) Service-Role-Client (RLS-Bypass) wie beim Klassifikations-Ingest, mit manueller Berechtigungsprüfung im Code; (b) Session-Client des eingeloggten Nutzers, RLS bleibt die einzige Durchsetzungsinstanz.

**Entscheidung:** (b). AGENTS.md §4 ist hier eindeutig ("Keine Umgehung der Row-Level-Security. Auch nicht 'kurz für Debugging'."). Der Session-Client lädt Vorgang/Anliegen (RLS: `darf_vorgang_sehen`), schreibt die neue `handler_aufrufe`-Zeile (neue Policy, RLS: `darf_vorgang_bearbeiten`, siehe Punkt 8) und ruft anschließend `fuehreW1AusUndProtokolliere`/`fuehreW2AusUndProtokolliere` mit demselben Client-basierten Repository auf. Alle von der Orchestrierung gelesenen Tabellen (`kunden`, `kunden_profil`, `kunden_grenzen`, `pruefregeln`, ...) haben bereits Lese-Policies für zugewiesene Kunden -- ein Nutzer, der den Vorgang sehen darf, darf auch das zugehörige Kundenprofil lesen. Einzige Ausnahme: `llm_nutzung` hatte bisher nur eine Service-Role-INSERT-Möglichkeit (bewusst, siehe Migration). Diese Decision erweitert das um eine eng gescopte INSERT-Policy für `chef`/`manager`/`editor` auf zugewiesene Kunden (siehe Migration, Abschnitt "llm_nutzung"), weil ab jetzt echte Nutzer-Sessions LLM-Aufrufe auslösen, nicht mehr nur Hintergrund-Jobs.

### 6. `backend_handler_input` reicht nicht für den vollen W1-/W2-Input-Kontrakt -- v1-Näherung

`anliegen.backend_handler_input` (aus der Klassifikation) ist ein schlankes JSON (z. B. `{ medium_name: "..." }`), aber `W1BriefingInput`/`W2AnfrageInput` erwarten deutlich mehr Felder (Anlass, Kernbotschaft, Fakten, Zitat, Ziel-Medien-Gruppe, ...). Ein eigenes Briefing-Formular für die Beraterin ist nicht Teil dieses Issues (Inline-Editing ist ausdrücklich "Block 2").

**Entscheidung:** eine kleine Mapping-Funktion (`briefingAusAnliegen`/`anfrageAusAnliegen` in `src/lib/handler-input.ts`) übernimmt vorhandene Felder aus `backend_handler_input` 1:1 und füllt alle übrigen Pflichtfelder mit der `anliegen.beschreibung` bzw. `null`/leeren Defaults auf. Das Ergebnis ist ein funktionierender, aber inhaltlich grobes Erst-Draft -- die Kritiker-/Grenz-Prüfung von W1/W2 bleibt die Qualitätssicherung, nicht das Mapping.

> @thehartworker Entscheidung nötig: reicht die grobe Mapping-Näherung für den ersten vorzeigbaren Durchlauf, oder soll ein Briefing-Formular vor dem Handler-Aufruf vorgezogen werden (dann eigener, kleinerer Block vor dem hier beschriebenen)?

### 7. Struktur-Segmente statt Fließtext (Vorbereitung für Inline-Editing, Block 2)

`PressemitteilungAnsicht` und `CommsPlanAnsicht` rendern jedes Feld des jeweiligen Zod-Outputs (`headline`, `sub_headline`, `lead_absatz`, `ausfuehrung_absaetze[]`, `zitat`, `boilerplate`, `kontakt_fusszeile` bzw. `what_were_doing`, `strategic_objectives.{reputation,risk}`, `reactive_statement`, `background_information[]`, `open_questions[]`) als eigenen, mit `data-segment="<feldname>"` markierten Block, nicht als zusammenhängenden Text. Block 2 kann so pro Segment einen Editier-Zustand andocken, ohne die Darstellung neu zu strukturieren.

### 8. Freigabe-Modell: neue Spalten statt neuer Enum-Werte

`handler_aufruf_status` bleibt Ausführungsstatus (`queued/in_progress/done/failed/escalated`), unverändert. Freigabe ist eine zweite, unabhängige Dimension (ein Mensch muss ein `done`-Ergebnis noch freigeben). Neue, nullable Spalten auf `handler_aufrufe`: `freigegeben_at timestamptz`, `freigegeben_durch uuid REFERENCES nutzer(id)`. `freigegeben_at IS NOT NULL` heißt "freigegeben, bereit zum Versand -- Versand-Anbindung folgt" (SCOPE-GRENZE, kein echter Versand). Gleiches Muster auf `vorgaenge` für die Rückfrage: `rueckfrage_nachricht text` (persistiert erstmals -- war bisher ein reines Klassifikations-Laufzeit-Feld, nirgends gespeichert), `rueckfrage_bereit_am timestamptz`, `rueckfrage_freigegeben_durch uuid REFERENCES nutzer(id)`.

Jede der beiden Freigabe-Aktionen schreibt zusätzlich einen `audit_log`-Eintrag (`aktion = 'freigabe_erteilt'`, vorhandener Enum-Wert, `aktion_payload.typ` unterscheidet `'handler_ergebnis'` von `'rueckfrage'`) mit `nutzer_id = auth.uid()` (nicht mehr `null` wie beim Service-Role-Pfad).

### 9. RLS-Erweiterung: `darf_vorgang_bearbeiten()` plus drei neue INSERT/UPDATE-Policies

Neue `SECURITY DEFINER`-Funktion `darf_vorgang_bearbeiten(p_vorgang_id uuid)`, analog zu `darf_vorgang_sehen()`, kapselt exakt die Rollen-Logik, die bisher inline in der `vorgaenge_schreiben`-Policy steht (chef: alle; manager: zugewiesene Kunden; editor: zugewiesene Kunden, sensitive nur als zuständige Person). `vorgaenge_schreiben` wird auf diese Funktion umgestellt (DRY, gleiche Begründung wie bei `darf_vorgang_sehen()` in der RLS-Decision). Neue Policies, die dieselbe Funktion wiederverwenden:

- `handler_aufrufe_schreiben` (INSERT, für "Handler auslösen")
- `handler_aufrufe_aktualisieren` (UPDATE, für Status nach Handler-Lauf und für Freigabe)
- `audit_log_schreiben` (INSERT, `WITH CHECK (nutzer_id = auth.uid() AND agentur_id = current_agentur_id() AND (vorgang_id IS NULL OR darf_vorgang_bearbeiten(vorgang_id)))`)
- `llm_nutzung_schreiben` (INSERT, `WITH CHECK (current_rolle() = 'chef' OR (current_rolle() IN ('manager','editor') AND ist_kunde_zugewiesen(kunde_id)))`, ohne `agentur_id`-Bezug im Check, weil die Spalte per Trigger aus `kunde_id` abgeleitet wird)
- `vorgaenge_schreiben` (UPDATE, erweitert um das Schreiben der neuen `rueckfrage_*`-Spalten -- nutzt dieselbe Policy wie bisher, keine neue Policy nötig)

`reader`/`guest` bleiben ausgeschlossen (keine Verzweigung in `darf_vorgang_bearbeiten()` für diese Rollen), konsistent mit SAAS_SPEC §9.2 ("Assistenz kann sehen, aber nicht freigeben").

### 10. Test-Strategie

- **pgTAP** (`supabase/tests/database/17_...test.sql`): neue Policies beweisen -- editor mit Kunden-Zuweisung darf `handler_aufrufe` für seinen Vorgang einfügen/aktualisieren, editor ohne Zuweisung nicht, reader darf in keinem Fall schreiben, `audit_log`/`llm_nutzung`-INSERT nur für zugewiesene Kunden.
- **vitest** (`packages/persistence`): Mapping-Funktionen (`briefingAusAnliegen`/`anfrageAusAnliegen`) sowie die Freigabe-Feld-Erweiterung von `VorgangKlassifikationsUpdate`/`persistiere-klassifikation.ts` (rueckfrage_nachricht wird jetzt mitgeschrieben).
- **vitest + Testing Library** (`apps/web`, neu -- `apps/web` hat noch keine Test-Infrastruktur): Server-Actions gegen die `Fake`-Repositories aus `@konsole/persistence/testing` (Handler-Auslösung erzeugt gespeichertes Ergebnis, kein Versand; Freigabe setzt Status und schreibt audit_log, kein Versand), plus ein Komponenten-Test für `CompliancePanel` (Grenzverstoß und hoher Kritiker-Schweregrad werden sichtbar rot dargestellt).

**Konsequenzen:**

- Neue Migration ändert eine bestehende Policy (`vorgaenge_schreiben`) und erweitert die Sicherheits-Fläche dreier bisher Service-Role-exklusiver Tabellen (`audit_log`, `llm_nutzung`, `handler_aufrufe`) um Endnutzer-Schreibrechte. **DB-nah, sicherheitsrelevant -- Review nötig.**
- `rueckfrage_nachricht` wird ab dieser Migration erstmals dauerhaft gespeichert (vorher nur Laufzeit-Wert im Klassifikations-Output). Bestehende, bereits klassifizierte Vorgänge haben `rueckfrage_nachricht = NULL`, auch wenn ihr ursprünglicher Klassifikations-Lauf eine Rückfrage formuliert hatte -- das ist ein bekannter Backfill-Verlust, kein Bug dieser Migration.
- Der reale Versand (E-Mail an den Absender) existiert weiterhin nicht. "Freigegeben"/"Rückfrage bereit" ist ein ehrlicher Zwischenstatus, die UI kennzeichnet das wörtlich ("Zum Versand freigegeben, Versand-Anbindung folgt").

**Offene Fragen (für Bastian):** siehe die beiden `@thehartworker Entscheidung nötig:`-Punkte oben (Abschnitt 4 und 6). Ich baue in diesem PR mit den dort genannten Standard-Entscheidungen weiter (Handler-Ergebnis auch bei sensitiven Vorgängen sichtbar; grobe Mapping-Näherung statt Briefing-Formular), damit der Block nicht blockiert -- beides ist ohne Schema-Bruch nachträglich änderbar.
