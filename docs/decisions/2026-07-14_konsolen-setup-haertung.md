# Konsolen-Setup-Härtung nach dem ersten Live-Test

**Datum:** 2026-07-14
**Status:** vorgeschlagen
**Kontext:** Issue #47. Block 1 (#43) und Block 2 (#45) wurden gestern zum ersten Mal lokal mit `pnpm dev` gestartet. Dabei sind drei bisher nicht erkannte Setup-Fehler (Modul-Auflösung, `pdfkit`-Bundling, Compliance-Panel-Crash) und zwei schlummernde Test-Instabilitäten (`packages/handlers/tests/w1/export.test.ts`) sichtbar geworden, plus eine Lücke im Seed-Fixture-Angebot. Ursache für alle drei Laufzeit-Fehler ist derselbe strukturelle Punkt: bisher hatte niemand die Konsole tatsächlich als Next.js-App gestartet, `pnpm -r test`/`pnpm -r typecheck` in CI prüfen kein `next build`.

## Baustein A: Modul-Auflösung und `pdfkit`-Bundling

**Problem 1 -- Modul-Auflösung:** `packages/handlers/src/index.ts` importiert Workspace-Submodule mit `.js`-Suffix (TS-Bundler-Konvention, siehe "Nicht Teil dieses PRs"). Next.js/Webpack löst `./w2/index.js` ohne `resolve.extensionAlias` nicht gegen die tatsächliche `.ts`-Datei auf.

**Problem 2 -- `pdfkit`-Bundling:** `pdfkit` lädt Font-Metriken (`Helvetica.afm` etc.) zur Laufzeit über einen relativen Pfad von seinem eigenen Modul-Verzeichnis. `@konsole/handlers` steht in `transpilePackages` (nötig, weil es rohes TypeScript ausliefert, siehe next.config.ts-Kommentar zu Issue #43). Next.js bündelt transpilierte Pakete inklusive ihrer Importe in eigene Vendor-Chunks -- die `.afm`-Ressourcen-Dateien werden dabei nicht mitkopiert, `serverExternalPackages: ["pdfkit"]` allein reicht nicht, weil der Transpile-Pfad über `@konsole/handlers` Vorrang hat.

**Optionen:**
(a) Nur `serverExternalPackages` setzen und hoffen, dass Next.js `pdfkit` trotz `transpilePackages`-Überlapp externalisiert.
(b) `pdfkit`/`docx` in `packages/handlers/src/w1/export.ts` lazy (`await import(...)` innerhalb der Render-Funktion) statt statisch importieren.
(c) `@konsole/handlers` aus `transpilePackages` entfernen und stattdessen vorab bauen (Build-Schritt vor `next build`).

**Entscheidung:** (b) plus die Modul-Auflösungs-Konfiguration aus (a). Lazy-Import ist unabhängig davon, ob Next.js' Bundler `serverExternalPackages` und `transpilePackages` bei überlappenden Paketnamen korrekt zusammen auflöst -- eine Bibliotheks-Ressourcen-Datei-Falle, die sich mit jeder Next.js-Minor-Version wieder anders verhalten kann. Der dynamische Import läuft nur innerhalb von `renderPressemitteilungPdf`/`renderPressemitteilungDocx`, zur Aufrufzeit im Node-Serverprozess -- Webpack nimmt `pdfkit`/`docx` dadurch nicht mehr in den statischen Transpile-Pfad von `@konsole/handlers` auf. (c) wurde verworfen: ein Vorab-Build-Schritt für ein Workspace-Paket, das laut Issue #43 bewusst ungebaut bleibt (`package.json`-`exports` zeigt auf `src/`), wäre eine Umkehr dieser bereits getroffenen Entscheidung ohne neuen Grund.

`serverExternalPackages: ["pdfkit", "docx", "pdf-parse", "mammoth"]` bleibt trotzdem gesetzt (Defense-in-Depth für den Fall, dass ein künftiger Aufrufer doch statisch importiert, und weil `pdf-parse`/`mammoth` produktiv in `@konsole/profil-extraktion` verwendet werden, ebenfalls ein transpiliertes Paket). `webpack.resolve.extensionAlias` behebt Problem 1 unabhängig davon.

**Konsequenz:** `renderPressemitteilungPdf`/`renderPressemitteilungDocx` sind jetzt beide `async` mit einem zusätzlichen `await import(...)` am Funktionsanfang -- `renderPressemitteilungPdf` war bereits durch sein Promise-Executor-Muster asynchron, die Signatur (`Promise<Buffer>`) ändert sich nicht. `renderPressemitteilungDocx` war bereits `async`.

## Baustein B: Compliance-Panel defensiv gegen unvollständigen Handler-Output

**Problem:** `sammleVerstoesseUndFindings` griff direkt auf `output.grenz_pruefung_ergebnis.verstoesse` und `output.kritiker_findings` zu. Ein Handler-Ergebnis, das (z. B. durch einen fehlgeschlagenen Handler-Lauf vor Schema-Validierung, oder während der Entwicklung eines neuen Handlers) diese Felder nicht besitzt, wirft eine `TypeError` und reißt die gesamte Detailansicht mit runter.

**Optionen:** (a) Zod-Validierung am Lese-Pfad erzwingen, ungültige Daten gar nicht erst rendern (b) defensiv rendern: fehlende Teil-Objekte werden als "nicht verfügbar" behandelt, kein Crash.

**Entscheidung:** (b), wie im Issue vorgegeben. Das Compliance-Panel ist die Stelle, an der eine Beraterin erfährt, dass mit einem Ergebnis etwas nicht stimmt (AGENTS.md-Leitsatz: Menschen-Abzweig bei Unsicherheit). Ein Panel, das sich bei genau der Art von unvollständigem Ergebnis selbst wegkatapultiert, vor der es warnen soll, wäre kontraproduktiv. Schema-Zwang (a) gehört an den Schreib-/Persistenz-Pfad (Zod-Validierung vor dem Speichern, AGENTS.md §3.3), nicht an die Anzeige -- die Anzeige muss mit historischen oder unvollständigen Datensätzen umgehen können, die bereits in der DB liegen.

**Umsetzung:** Pro Handler-Eintrag wird zusätzlich vermerkt, ob das komplette Compliance-Teil-Ergebnis fehlt (`grenz_pruefung_ergebnis` bzw. bei W2 `pruefung` nicht vorhanden). Fehlt es, erscheint pro betroffenem Handler-Aufruf ein dezenter Hinweis "Compliance-Prüfung nicht verfügbar" statt eines Crashs. Fehlt nur `kritiker_findings`, wird es wie eine leere Liste behandelt (kein gesonderter Hinweis, weil `kritiker_findings` nur für W1 existiert und ihr Fehlen kein Hinweis auf einen Compliance-Ausfall ist, sondern z. B. auf ein W2-Ergebnis).

## Baustein C: CI-Job `build-web`

**Problem:** Keiner der drei obigen Laufzeit-Fehler wäre in CI aufgefallen, weil CI bisher nur `pnpm -r typecheck` und `pnpm -r test` ausführt -- beides prüft kein Next.js-Bundling.

**Entscheidung:** Neuer Job `build-web` in `.github/workflows/ci.yml`, parallel zu den bestehenden Jobs, führt `pnpm --filter web build` aus.

**Wichtiger Hinweis zur Umsetzung:** Der Claude-Code-Action-Agent, der diesen PR baut, hat laut seiner GitHub-App-Berechtigung keinen Schreibzugriff auf `.github/workflows/*` (GitHub verlangt dafür den `workflows`-OAuth-Scope, den die App bewusst nicht hat). Der Job-Vorschlag liegt deshalb unten als Textblock vor und muss von Bastian manuell in `.github/workflows/ci.yml` eingefügt werden, siehe PR-Beschreibung/Kommentar.

## Baustein D: Seed-Fixture `supabase/seeds/01_pilot_mensch_neurabin.sql`

**Problem:** `supabase/seed/seed.sql` deckt nur generische RLS-Testdaten ab (Bäckerei Hoffmann, Pharma Beispiel GmbH), kein Fixture mit einem vollständigen, schema-konformen Handler-Ergebnis (`W1Output`). Der Nutzer musste beim ersten lokalen Test manuell ein SQL-Seed zusammenbauen und mehrfach gegen `W1OutputSchema` nachbessern.

**Optionen:** (a) das bestehende `supabase/seed/seed.sql` erweitern (b) ein neues Verzeichnis `supabase/seeds/` mit einer eigenen, MENSCH-Pilot-spezifischen Datei.

**Entscheidung:** (b), wie im Issue vorgegeben. `supabase/seed/seed.sql` ist laut seinem Kommentarkopf bewusst generisch für RLS-Tests (drei Rollen, Kunden ohne Pilot-Bezug); der MENSCH-Pilot-Datensatz mit realistischem Handler-Ergebnis ist ein anderer Zweck (manuelles Durchklicken der Konsole, Demo), verdient eine eigene Datei statt den generischen Seed zu vermischen. `supabase/seeds/` (Plural, neues Verzeichnis) statt `supabase/seed/` (Singular, bestehend), damit beide nebeneinander bestehen und unterschiedlich eingespielt werden können.

**Idempotenz:** analog zum bestehenden `seed.sql`-Muster -- feste UUIDs, `ON CONFLICT (id) DO NOTHING` beziehungsweise (für `handler_aufrufe`, die kein Unique-Constraint außer `id` brauchen) über die feste `id` in der `VALUES`-Zeile selbst.

**`handle_new_user()`-Trigger:** der Auth-User-Insert setzt `raw_user_meta_data` mit `agentur_id`/`rolle`, damit der bestehende `handle_new_user()`-Trigger (siehe `20260711140000_auth_nutzer_verknuepfung.sql`) die zugehörige `public.nutzer`-Zeile automatisch anlegt -- kein separater `INSERT INTO nutzer`, kein Bootstrap-Modus/Trigger-Deaktivierung nötig.

## Baustein F: Robuste Export-Tests

**Problem 1 -- Snapshot ohne Persistenz:** `renderPressemitteilungText > Snapshot` legt beim ersten CI-Lauf eine `__snapshots__`-Datei an, committet sie aber nicht (nicht Teil des Block-2-PRs) -- jeder Folge-Lauf in einer frischen CI-Umgebung ohne diese Datei erzeugt automatisch einen neuen Snapshot und "besteht" damit scheinbar, während ein Lauf mit vorhandener, aber inhaltlich abweichender Datei fehlschlägt. Das ist zusätzlich ein Verstoß gegen AGENTS.md §3.3 ("Kein Snapshot-Testing für LLM-Outputs").

**Problem 2 -- PDF-Text-Whitespace:** `pdf-parse` gibt Text mit Zeilenumbrüchen zurück, sobald eine Zeile im Rendering umbricht (lange Headlines) oder `align: 'justify'` zusätzliche Zwischenräume erzeugt. `toContain(GUTER_DRAFT.headline)` scheitert dann, obwohl der Inhalt korrekt ist.

**Entscheidung:** siehe Aufgabe F im Issue, wörtlich umgesetzt -- inhaltsbasierter Reihenfolge-Test statt Snapshot, Whitespace-Normalisierung (`text.replace(/\s+/g, ' ').trim()`) vor jedem `toContain` im PDF-Test, gleiches Muster für die DOCX-Assertions, wo sinnvoll (docx-Absätze sind bereits einzelne XML-Textknoten ohne Zeilenumbruch-Rauschen; die Normalisierung schadet dort nicht, ist aber nur für `kontakt_fusszeile`, das intern ein `\n` enthält, tatsächlich nötig).

**Verworfen:** Headline in `GUTER_DRAFT` kürzen, damit sie nicht umbricht. Der Renderer muss mit realistischen (langen) Headlines umgehen -- eine gekürzte Fixture verschiebt denselben Bug nur auf den nächsten Wechsel der Fixture-Daten.

## Aufgabe G: React-Testing-Library-Cleanup in apps/web

**Problem:** `@testing-library/react` räumt den DOM zwischen Tests bei Vitest nicht automatisch auf (anders als bei Jest, wo das über `jest-environment-jsdom`/Auto-Cleanup-Hooks implizit passiert). `apps/web/vitest.config.ts` hatte weder `setupFiles` noch existierte eine Setup-Datei mit `afterEach(cleanup)`. Solange nur eine Test-Datei mit `getByRole`-Aufrufen lief, fiel das nicht auf, weil jede Datei ihren eigenen jsdom-Body-Zustand hatte. Sobald `compliance-panel.test.tsx` (Baustein B) dazukam, akkumulierten sich gerenderte Komponenten über Testdatei-Grenzen im selben Testlauf, und der bestehende Barrierefreiheits-Test in `pressemitteilung-editor.test.tsx` sah acht Kopien der Headline im DOM -- `Found multiple elements with role "button"`.

**Optionen:**
(a) Ein globales `setupFiles`-Eintrag in `vitest.config.ts` mit einer zentralen Datei, die `afterEach(cleanup)` einmal registriert.
(b) Per-Test-`afterEach(cleanup)` direkt in jeder betroffenen Test-Datei.
(c) `cleanup`-Import am Kopf jeder Test-Datei, die Testing-Library nutzt (ohne expliziten `afterEach`-Aufruf, verlassen auf manuelles Aufräumen am Dateiende).

**Entscheidung:** (a). Die fehlende Automatik ist kein Merkmal einzelner Test-Dateien, sondern eine Eigenschaft der Kombination Vitest plus Testing-Library selbst -- sie betrifft jede aktuelle und jede künftige Test-Datei in `apps/web`, die `render()` aufruft, unabhängig davon, ob ihr Autor an das Cleanup-Problem denkt. Eine zentrale Setup-Datei behebt die Ursache an der Stelle, an der Vitest sie kennt (`test.setupFiles`), statt das Symptom in jeder Datei einzeln zu behandeln.

**Verworfen:** (b) verlangt Disziplin bei jeder neuen Test-Datei und wiederholt denselben Boilerplate n-mal -- vergisst ein Autor den `afterEach`-Block, ist der Bug wieder da, lautlos, bis eine zweite Test-Datei im selben Lauf betroffen ist. (c) ist strukturell dieselbe Schwäche wie (b), nur mit einem Import statt eines Hooks -- kein technischer Mechanismus erzwingt, dass jede Datei ihn tatsächlich einbindet. Beide Alternativen sind genau das Muster, das dieser Bug bereits einmal ausgenutzt hat: eine implizite Voraussetzung (DOM-Zustand pro Testdatei), die nur so lange hält, wie niemand sie prüft.

**Umsetzung:** Neue Datei `apps/web/vitest.setup.ts` mit einem einzigen `afterEach(() => cleanup())`. In `vitest.config.ts` referenziert über `test.setupFiles: ["./vitest.setup.ts"]`. Keine Änderung an bestehenden Test-Dateien -- sie waren korrekt geschrieben und brauchten nur die fehlende Setup-Datei, kein `queryAllByRole` oder andere Symptombehandlung an den Assertions selbst.

## Scope-Grenzen (aus dem Issue übernommen)

- Keine Änderung an `packages/handlers/src/index.ts` (`.js`-Suffix bleibt Standard).
- Keine PDF-/DOCX-Bibliotheken-Wechsel.
- Keine Migrations-Änderungen an bestehenden Dateien (nur eine neue Seed-Datei).
- Keine Änderung am Renderer-Verhalten, nur an Konfiguration (lazy import) und Test-Robustheit.
