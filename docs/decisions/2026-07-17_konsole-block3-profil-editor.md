# Konsole Block 3: Kundenprofil-Editor mit KI-Befüllung als transaktionale Aktion

**Datum:** 2026-07-17
**Status:** vorgeschlagen
**Kontext:** Issue #50. Aus dem Backend-Kundenprofil-Fundament (Issue #35: Kern-Tabelle + neun Listen mit `freigegeben`/`vorlaeufig`/`abgeleitet`-Status und `herkunft`-Spalten) und der KI-Befüllung (Issues #37/#38/#40: produktive Dokument-/Website-Provider, konservative Extraktion) entsteht die erste Editier-UI für das Kundenprofil. Panel-Konsens (Horvitz/Shneiderman/Wattenberger/Appleton, siehe Issue): transaktionaler Fluss, Provenance ist Pflicht, Vorschläge werden nie direkt in Feldwerte geschrieben.

## Fixpunkte aus dem Issue (nicht neu entschieden)

1. Fünf Sektionen (Fakten, Ton und Stimme, Strategie, Grenzen und Governance, Referenzen und Operatives), entlang der bestehenden Tabellenstruktur.
2. Editier-Pattern identisch zu Block 2 (`pressemitteilung-editor.tsx`): Klick/Enter aktiviert, Cmd/Ctrl+Enter speichert, Escape verwirft, Optimistic UI mit Rollback und "Erneut versuchen".
3. Vorschlags-Karten getrennt vom Feld-Editor, mit `Übernehmen`/`Ablehnen`, Sammel-Aktionen, Undo für die letzten fünf Aktionen (nur Sitzungs-Dauer).
4. KI-Befüllung ist explizit gestartete Aktion (Dokument-Upload oder Website-URL), nicht Hintergrund-Ambient.
5. Provenance sichtbar für jedes Feld/jede Zeile mit Status ≠ `freigegeben` oder mit gesetzter `herkunft`.

## Vier nicht-triviale Entscheidungen

### 1. Warum `feld_status` (JSONB) und `herkunft` (Spalte) parallel existieren

Die Kopf-Tabelle `kunden_profil` hat Felder, keine Zeilen — ein Feldname ist der Schlüssel, `feld_status` hält `{status, stand, quelle}` pro Feldname in einem einzigen JSONB. Die neun Listen-Tabellen haben Zeilen, jede mit eigener Herkunft — dort reicht eine `status`- und eine `herkunft`-Spalte pro Zeile, ein JSONB wäre unnötige Indirektion für eine 1:1-Beziehung Zeile→Herkunft. Beide Mechanismen zusammen ergeben die vollständige Provenance-Sicht über alle Profil-Elemente hinweg, ohne dass die Kopf-Tabelle 33 einzelne `<feld>_status`/`_stand`/`_quelle`-Spalten bräuchte (bereits so in `docs/decisions/2026-07-12_kundenprofil.md` entschieden — hier nur bestätigt, weil der Editor beide Mechanismen gleichzeitig bedienen muss).

### 2. Warum das Vorschlags-System eine eigene UI-Schicht ist, kein Teil des Feld-Editors

Läge ein Vorschlag im Feld selbst (z. B. als Platzhalter-Overlay über dem Input), wäre "was ist bestätigt" versus "was ist vorgeschlagen" nicht mehr eindeutig unterscheidbar — genau das Risiko, das Horvitz' "cost of poor guesses"-Prinzip vermeiden soll. Eine separate Karten-Liste (`vorschlaege-panel.tsx`) macht den Unterschied strukturell unübersehbar: Karten leben komplett getrennt vom Editor-State, ein Feld zeigt nur, was tatsächlich im Profil steht (inklusive `abgeleitet`, das ja bereits Teil des Profils ist), eine Karte zeigt, was noch gar nicht im Profil steht.

### 3. Vorschläge sind React-State, nicht Datenbank-Zeilen, bevor "Übernehmen" geklickt wird — Abweichung von der wörtlichen Lesart von "den Orchestrator nutzen wir"

Der bestehende `profil-extraktion-orchestrierung.ts` (Issue #37, PR 2) verheiratet Extraktion und Persistenz: `extrahiereUndPersistiereProfil`/`verarbeiteDokumentUndPersistiereProfil`/`verarbeiteWebsiteUndPersistiereProfil` schreiben JEDEN Vorschlag sofort als `abgeleitet` in die Zieltabellen (mit Nicht-Überschreiben-Regel gegen `freigegeben`-Felder). Das war für den reinen Backend-Pfad korrekt (kein UI, kein Nutzer, der "Übernehmen" klicken könnte).

Für Aufgabe C ("Vorschläge werden nie direkt in Feldwerte geschrieben ... erst bei Übernehmen wird der Wert Teil des Profils") ist das ein echter Widerspruch: würde der Editor `extrahiereUndPersistiereProfil` aufrufen, wären alle 14 Vorschläge einer Extraktion bereits in der Datenbank (als `abgeleitet`), bevor die Beraterin auch nur eine Karte gesehen hat. `verwerfeVorschlagAction` müsste dann aktiv etwas löschen — aber die Aufgabenbeschreibung sagt explizit "server-seitig no-op, weil nicht persistent".

**Entscheidung:** Die Editor-Server-Actions rufen `extrahiereProfilVorschlag` (packages/profil-extraktion, die reine Extraktions-Funktion ohne Persistenz-Kopplung) direkt auf, nicht die drei orchestrierenden `verarbeite*Und­PersistiereProfil`-Funktionen. Das Ergebnis (`ProfilExtraktionsVorschlag`, Zod-validiert) wird in einzelne Vorschlags-Karten zerlegt (`profil-vorschlaege.ts`) und ausschließlich im Client-State der Editor-Komponente gehalten. Erst `uebernehmeVorschlagAction` schreibt EINEN einzelnen Vorschlag (ein Kern-Feld oder eine Listen-Zeile) als `abgeleitet` ins Profil — über die neuen, gezielten Repository-Methoden (`kernFeldManuellSpeichern`/`listenzeileManuellSpeichern`, siehe unten), nicht über die batch-orientierten `kernFelderVorschlagen`/`listenElementeVorschlagen`, die für "alles auf einmal schreiben" gebaut sind. `verwerfeVorschlagAction` ist entsprechend tatsächlich ein no-op: die verworfene Karte existierte nie als Datenbank-Zeile.

Die `llm_nutzung`-Protokollierung (ein Eintrag pro tatsächlichem LLM-Call, unabhängig vom Ausgang) bleibt erhalten — sie passiert in der neuen dünnen Wrapper-Funktion `fuehreProfilExtraktionAus` (`apps/web/src/lib/profil-extraktion-ausfuehren.ts`), die den LLM-Call macht, protokolliert und das Ergebnis durchreicht, ohne den Persistenz-Schritt der Orchestrierung zu übernehmen.

**Konsequenz:** `extrahiereUndPersistiereProfil` & Co. bleiben ungenutzter, aber korrekter Code für einen künftigen vollautomatisierten (Ambient-)Pfad — das ist laut Issue explizit ein späterer Block ("Ambient-Vorschläge ... kommen frühestens nach Nutzungsdaten-Analyse"). Kein Code wird entfernt, nur nicht von diesem Block aufgerufen.

### 4. Provenance nach Persistenz ist Kategorie + Datum, nicht Dokumentname/URL/Akteur — expliziter Scope-Cut

Die Beispiele im Issue ("abgeleitet aus dem Dokument 'Unternehmens-Broschüre 2026.pdf'", "vorläufig eingetragen von Bastian Scherbeck") sind reicher als das, was die bestehenden Spalten hergeben:

- `herkunft` (Listen-Tabellen) ist eine `CHECK`-Constraint auf genau zwei Werte (`dokument-upload`/`website-scraping`) — keine Dokument-ID, kein Dateiname, keine URL.
- `feld_status.quelle` (Kopf-Tabelle, JSONB) ist zwar frei befüllbares Text, wird aber im gesamten übrigen Code als `ProfilExtraktionsQuelle`-Kategorie behandelt (`kernFelderVorschlagen`-Signatur) — ihn nur für den Editor-Pfad mit Freitext ("Dokument XY.pdf") zu befüllen würde diesen Vertrag stillschweigend aufweichen und künftige Leser (z. B. eine spätere Ambient-Auswertung) verwirren.
- Es gibt keine Spalte, die eine Listen- oder Kopf-Zeile mit der konkreten `kunden_quelldokumente`-Zeile oder der eingegebenen URL verknüpft, und keine Spalte für "manuell eingetragen von Nutzer X" (kein `angelegt_von_nutzer_id`).

**Entscheidung:** Persistierte Provenance zeigt Kategorie (Dokument-Upload/Website-Scraping/manuell) plus Datum (`feld_status.stand` bzw. `updated_at`), keine Akteur- oder Dokument-Feindetails. Solange ein Vorschlag noch als Karte im Session-State lebt (Aufgabe C), zeigt er dagegen die volle Herkunfts-Zeile inklusive Dateiname/URL/Zitat, weil diese Information zu diesem Zeitpunkt ohnehin im Speicher vorliegt (aus dem Upload bzw. der Website-Antwort) — der Informationsverlust passiert einzig beim Übergang von Karte zu Datenbank-Zeile.

**Konsequenz — @thehartworker Entscheidung nötig, wenn die volle Nach-Persistenz-Provenance gewünscht ist:** das würde zwei zusätzliche Spalten brauchen: `angelegt_von_nutzer_id uuid REFERENCES nutzer(id)` auf allen zehn Kundenprofil-Tabellen (für "eingetragen von") und entweder eine Aufweichung der `herkunft`-`CHECK`-Constraint auf Freitext oder eine `quelldokument_id`-Fremdschlüsselspalte plus eine `quelle_url`-Textspalte. Absichtlich nicht in diesem PR umgesetzt (Issue-Vorgabe: zusätzliche Felder explizit flaggen statt still einschieben) — dieser Abschnitt ist die Flagge.

## Fünfte Entscheidung: Schreibrechte für `kunden_profil` und die neun Listen-Tabellen

Nicht im Issue erwähnt, aber ein blockierender Befund beim Lesen der bestehenden Migrationen: `kunden_profil` (`20260712110000`) und alle neun Listen-Tabellen (`20260712110100`) haben ausschließlich `SELECT`-RLS-Policies. Der Migrations-Kommentar ist explizit: *"Bewusst keine INSERT/UPDATE/DELETE-Policy für Endnutzer-Rollen: in Ebene 1+2 gibt es kein Editier-UI (das ist Ebene 4, Folge-Auftrag), Pflege läuft über die Service-Role."* Dieser Block IST Ebene 4 — die Prämisse der bisherigen Policy-Lücke entfällt.

**Optionen:** (a) Server-Actions schreiben mit der Service-Role (RLS-Bypass) und prüfen Berechtigung selbst in Anwendungscode. (b) Neue `INSERT`/`UPDATE`-RLS-Policies, Server-Actions bleiben auf dem Session-Client.

**Entscheidung:** (b). AGENTS.md §4 ist hier unmissverständlich: *"Keine Umgehung der Row-Level-Security. Auch nicht 'kurz für Debugging'."* Migration `20260717120000_kundenprofil_schreibrechte.sql` ergänzt `INSERT`/`UPDATE`-Policies nach demselben Muster wie `vorgaenge_schreiben`: `chef` schreibt jede Zeile der eigenen Agentur, `manager`/`editor` nur für zugewiesene Kunden (`ist_kunde_zugewiesen`), `reader`/`guest` bleiben ohne Schreibrecht. Entfernen einer Listen-Zeile läuft wie überall im Repository über Soft-Delete (`deleted_at`-`UPDATE`), keine eigene `DELETE`-Policy nötig. `kunden_quelldokumente` bleibt bewusst bei Service-Role-only (Datei-Upload läuft weiterhin über eine Server-Route mit Service-Role, siehe Aufgabe D) — nur die tatsächlichen Profil-Schreibpfade dieses Blocks bekommen Nutzer-Policies.

Der bestehende pgTAP-Test `13_kundenprofil_rls.test.sql` behauptete bisher explizit "kein Schreibrecht" — dessen letzter Abschnitt wird an die neue Realität angepasst (die Lese-/Mandantentrennungs-Assertions bleiben unverändert). Ein neuer Test `19_kundenprofil_schreibrechte.test.sql` deckt die neuen Policies im Detail ab (zugewiesener editor darf schreiben, nicht-zugewiesener editor nicht, agenturfremder chef nicht) — das ist der von Aufgabe "Tests" geforderte RLS-Test für das Übernehmen von Vorschlägen.

## Vorschläge sind nicht sitzungsübergreifend persistent

Wie im Issue vorgegeben: schließt die Beraterin den Browser, ist die Vorschlags-Liste weg (übernommene Vorschläge bleiben natürlich als `abgeleitet` im Profil). Das ist hier technisch zwangsläufig, nicht nur eine UX-Entscheidung — mit Entscheidung 3 oben leben Vorschläge ausschließlich im React-State der Editor-Komponente, es gibt keine Zieltabelle, in der sie zwischen Anfragen überleben könnten. Eine `verworfene_vorschlaege`-Tabelle für Anti-Learning aus Ablehnungen (v2, laut Issue explizit nicht Teil dieses Blocks) wäre der naheliegende nächste Schritt, falls sitzungsübergreifende Vorschläge später gewünscht sind.

## Aufgabe H: Post-Merge-Correction nach externem Review

Externes Review (Postgres 16 + `pnpm --filter web build` + `pnpm -r typecheck`) hat drei rote Checks mit lokalen Ursachen gefunden, kein Rewrite nötig. Der neue `build-web`-CI-Job aus Issue #47 Aufgabe C hatte hier seinen ersten scharfen Einsatz und den `node:module`-Bug gefangen, den `typecheck` und `test` allein nicht sehen — genau der Grund, warum der Job gebaut wurde.

### H.1: Server/Client-Trennung für `@konsole/profil-extraktion`

`packages/profil-extraktion/src/index.ts` re-exportierte Server-only-Provider (`ProduktiverDokumentTextProvider`, zieht `pdf-parse`/`mammoth`; `ProduktiverWebsiteTextProvider`) im selben Barrel wie Client-taugliches (Schemas, Types, Enums). Sobald ein Client Component-Modul (`apps/web/src/lib/kundenprofil-felder.ts`, als Laufzeit-Import für die Enums, importiert von der Client Component `profil-editor.tsx`) daraus importierte, zog Webpack den gesamten Barrel inklusive der Provider in den Client-Bundle-Pfad — die Provider referenzieren `node:module`, was im Browser-Bundle bricht.

**Fix:** Neuer Sub-Export `packages/profil-extraktion/src/client.ts` re-exportiert ausschließlich `ProfilExtraktionsVorschlagSchema` und ihre abgeleiteten Types sowie die reinen Typen/Enums aus `types.ts`/`schema.ts` — explizit ohne `dokument-text-provider.ts`, `website-text-provider.ts`, `extrahiere.ts`. `package.json` bekommt einen `"./client"`-Export-Eintrag daneben. `kundenprofil-felder.ts` und `profil-vorschlaege.ts` importieren jetzt aus `@konsole/profil-extraktion/client`; Server-Code (`actions.ts`, `profil-extraktion-ausfuehren.ts`) bleibt unverändert beim Default-Export.

**Verworfene Alternative:** Provider per lazy `await import()` verstecken. Hätte das Symptom gefixt, ohne die eigentliche Server/Client-Trennung zu ziehen — beim nächsten neuen Provider oder Client-Import wäre derselbe Bug wiedergekommen. Der Sub-Export-Fix ist strukturell, nicht symptomatisch.

### H.2: Type-Guard für `VorschlagZielKern | VorschlagZielListe` — Nachtrag, doch ein Fix nötig

Die erste Einschätzung ("Diskriminator ist schon da, kein Fix nötig") war für die meisten Zugriffsstellen richtig, aber nicht vollständig: `onUebernommen` in `profil-editor.tsx` prüft `vorschlag.ziel.art === "kern"` und liest `vorschlag.ziel.feldname` direkt darunter — aber innerhalb des Callback-Arguments von `setKernUebernommen((bisherig) => ({ ..., [vorschlag.ziel.feldname]: ... }))`. TypeScripts Control-Flow-Narrowing überträgt sich nicht über die Grenze eines verschachtelten Funktionsausdrucks: der Callback könnte theoretisch später aufgerufen werden, nachdem sich `vorschlag` geändert hat, deshalb verwirft TypeScript die Verengung aus dem äußeren `if` für Zugriffe innerhalb des Callbacks. `onUebernahmeRueckgaengig` (dieselbe Datei, wenige Zeilen darunter) hatte dieses Muster bereits korrekt: `feldname`/`tabelle` werden vor dem Callback in eine `const` gezogen.

**Fix:** In `onUebernommen` `feldname` ebenfalls vor dem Callback in eine lokale `const` gezogen (analog zu `tabelle` im Listen-Zweig direkt darunter, der bereits korrekt war). Alle übrigen Zugriffsstellen (`actions.ts`, restlicher `profil-editor.tsx`) greifen synchron innerhalb desselben `if`-Zweigs ohne verschachtelte Funktionsgrenze zu — dort bleibt die Verengung gültig, kein weiterer Fix nötig.

### H.3: pgTAP-Test 19, Assertion 4 zu strikt

`supabase/tests/database/19_kundenprofil_schreibrechte.test.sql`, Assertion 4 (editor_a1 versucht `kunden_profil`-INSERT für den NICHT zugewiesenen Kunden A2) nutzte `throws_like(..., '%row-level security policy%', ...)`. Tatsächlich wirft der bestehende `kunden_profil_agentur_id_setzen_trg` (`20260712110000_kundenprofil.sql`) VOR der RLS-Policy: sein `SELECT agentur_id INTO STRICT ... FROM kunden WHERE id = NEW.kunde_id` sieht Kunde A2 durch die RLS-Policy auf `kunden` selbst nicht (editor_a1 ist dort nicht zugewiesen) und wirft `NO_DATA_FOUND` ("query returned no rows") — die INSERT-Policy auf `kunden_profil` wird nie erreicht. Der Effekt (Schreibversuch scheitert) stellt sich trotzdem ein, nur die Fehlermeldung weicht ab.

**Fix:** Assertion 4 von `throws_like` auf `throws_ok` umgestellt (prüft nur "es wirft", nicht die konkrete Meldung), mit Kommentar im Test-File. Assertion 5 (reader_a, Kunde A1 IST zugewiesen, aber Rolle ohne Schreib-Zweig) bleibt unverändert bei `throws_like` — dort sieht reader_a den Zielkunden per RLS auf `kunden`, der Trigger läuft durch, und die eigentliche INSERT-Policy wirft tatsächlich mit der RLS-Meldung.

## Scope-Grenzen (aus dem Issue übernommen)

Kollaboratives Live-Editing, Ambient-Vorschläge, Verworfene-Vorschläge-Persistenz/Anti-Learning, Historie/Versionierung von Profil-Zellen, Bulk-CSV-Import, White-Label-Umschaltung, weitere Sub-Tabs unter `/kunden/[id]` — alle bewusst nicht Teil dieses Blocks, siehe Issue.
