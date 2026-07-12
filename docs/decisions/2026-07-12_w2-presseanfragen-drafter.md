# W2: Presseanfragen-Drafter (Referenz-Handler)

**Datum:** 2026-07-12
**Status:** vorgeschlagen

**Kontext:** `WORKFLOW_HANDLERS_v1.0.md` Abschnitt "W2: Presseanfragen-Drafter" verlangt den ersten Backend-Handler. Laut Auftrag (Issue #32) ist W2 die Referenz-Implementierung, an der sich W1, W3, ... orientieren — die hier getroffenen Struktur-Entscheidungen sind also nicht nur für W2 gültig, sondern legen das Muster für alle sechs Handler fest. `packages/classifier`, `packages/persistence`, `packages/llm` liegen auf `main`, getestet (siehe `docs/decisions/2026-07-12_klassifikations-layer.md`), und werden hier wiederverwendet.

## Optionen

**1. Paket-Struktur**

1a. Ein Paket pro Handler (`packages/handler-w2`, später `packages/handler-w1`, ...), direkter Kind-Ordner von `packages/`, passt ohne Änderung in das bestehende `pnpm-workspace.yaml`-Glob (`packages/*`).

1b. Ein gemeinsames Paket `packages/handlers` (`@konsole/handlers`) mit einem Unterordner pro Handler (`src/w2/`, später `src/w1/`, ...), wie in `AGENTS.md` §5 als Repo-Struktur bereits vorgesehen (`packages/handlers/` ist dort explizit als *ein* Ordner für "die sechs Backend-Handler" benannt, nicht als sechs Pakete).

**2. Grenze Persistenz/Business-Logik (Token-Erfassung in `llm_nutzung`)**

2a. `packages/handlers` bekommt selbst eine Abhängigkeit auf `@konsole/persistence` und schreibt `llm_nutzung`-Zeilen direkt.

2b. `packages/handlers` bleibt wie `packages/classifier` frei von Supabase/Persistenz-Wissen, gibt pro LLM-Aufruf Token-Verbrauch zurück (`llmAufrufe[]`), und `packages/persistence` bekommt eine neue Orchestrierungs-Funktion (`w2-orchestrierung.ts`), die `packages/handlers` aufruft und danach für jeden LLM-Aufruf `repo.llmNutzungSchreiben(...)` ausführt — analog zu `klassifiziereUndPersistiere()`.

**3. 19-Punkte-Check: Code-Check vs. Review-Prompt**

3a. Alle 19 Regeln als Teil eines einzigen Kritiker-LLM-Prompts (wie W1s Kritiker-Pass).

3b. Aufteilung nach Prüfbarkeit: strukturell/lexikalisch prüfbare Regeln als deterministische Code-Checks (Zod `superRefine`-Stil, wie in `packages/classifier/src/schema.ts`), Regeln mit echtem Sprachverständnis-Bedarf als Teil eines zweiten LLM-Aufrufs (Review-Pass).

**4. Sprach-Regel-Durchsetzung**

4a. Nur per Prompt-Anweisung an das LLM, keine Code-Prüfung.

4b. Prompt-Anweisung plus deterministischer Heuristik-Code-Check (Stopwort-Scoring, analog zur bestehenden Umlaut-Heuristik in `packages/classifier/src/schema.ts`), der bei Verdacht auf falsche Sprache einen Regel-Verstoß meldet und einen Retry auslöst.

**5. v1-Kontext-Quellen**

5a. Kontext-Sammlung mit fest verdrahteten Rückgabewerten (`null`/`[]`) für alle fünf Quellen außer Sprachregelungen.

5b. Ein `W2KontextQuellenProvider`-Interface mit einer Methode pro nicht-direkt-aus-dem-Input-verfügbaren Quelle (Sprachregelung, SSOT, Präzedenzen, Journalist:innen-Profil), das v1 mit einem Default-Stub-Provider erfüllt (liefert überall `null`), aber von einem Aufrufer (Konsole, Test) mit echten Implementierungen ersetzt werden kann, sobald die Datenbestände existieren.

## Entscheidung

**Zu 1:** Option 1b, `packages/handlers` als ein Paket mit `src/w2/`. Grund: `AGENTS.md` §5 sieht diese Struktur bereits vor, `pnpm-workspace.yaml` (`packages: ["apps/*", "packages/*"]`) müsste für Option 1a um ein zweites Glob-Muster (`packages/*/*` oder Ähnliches) erweitert werden — eine Workspace-Config-Änderung ist eine eigene Entscheidung mit größerem Radius (betrifft `pnpm install`/CI global) und hier nicht nötig. `packages/handlers/.gitkeep` existiert bereits als Platzhalter für genau diese Struktur. Da W2 laut Auftrag das Muster für W1/W3/... vorgibt: alle künftigen Handler kommen als weitere `src/<slug>/`-Unterordner in dasselbe Paket, mit eigenen `index.ts`-Exporten pro Handler unter dem gemeinsamen `src/index.ts`.

**Zu 2:** Option 2b. Konsistent mit der bestehenden Grenzziehung aus `docs/decisions/2026-07-12_klassifikations-layer.md` ("Grenze Klassifikation/Handler-Auslösung"): `packages/classifier` kennt weder Supabase noch die Service-Role, `packages/persistence` ist die einzige Schicht mit DB-Zugriff. Dieselbe Trennung gilt jetzt für Handler: `packages/handlers` ist reine Prompt-Bau-, Orchestrierungs- und Validierungs-Logik mit einer `LLMProvider`-Abhängigkeit, testbar ohne echte Postgres-Instanz. `packages/persistence/src/w2-orchestrierung.ts` bekommt eine neue Abhängigkeit auf `@konsole/handlers`, ruft `presseanfragenDrafter()` auf und schreibt danach **eine `llm_nutzung`-Zeile pro tatsächlichem LLM-Aufruf** (Draft-Versuch(e) plus Review-Pass(es), nicht nur eine aggregierte Zeile), jeweils mit `handler_slug = "W2_presseanfragen_drafter"`. Das ist granularer als bei der Klassifikation (dort ein Aufruf), aber notwendig, weil W2 laut Spec bis zu 3 Retries plus Review-Aufrufe machen kann und jeder Aufruf einzeln abgerechnet wird (gleiche Begründung wie in der Klassifikations-Decision, "pro-Call-Granularität").

Da `W2Input` (Handler-Vertrag) keine `kunde_id`/`vorgang_id` (UUID) enthält — nur `kunde_kontext.kunde_slug` — bekommt `fuehreW2AusUndErfasseNutzung()` diese IDs als zusätzliche Parameter, analog dazu, wie `EingehendeNachricht` in Teil 1 bereits `vorgang_id`/`kunde_id` getrennt vom reinen Klassifikations-Vertrag trug.

**Zu 3:** Option 3b. `WORKFLOW_HANDLERS_v1.0.md` listet für W2 namentlich 12 der "19 Feedback-Regeln aus dem Meta-System-Handoff" (siehe Abschnitt "Zu 3, Regel-Zuordnung" unten für die vollständige Liste). **Das Meta-System-Handoff-Dokument selbst, das laut Spec-Text alle 19 Regeln enthält, liegt nicht in diesem Repository vor** — weder im Root noch unter `docs/`. Diese Decision implementiert deshalb bewusst nur die 12 namentlich genannten Regeln als erweiterbare Prüf-Registry (`PRUEFUNGS_REGEL` in `packages/handlers/src/w2/pruefung.ts`), keine erfundenen zusätzlichen 7 Regeln (`AGENTS.md` §4: "Keine Prompt-Erfindung" — das gilt hier analog für Prüfregeln, die produktiv einen Retry auslösen). Siehe "@thehartworker Entscheidung nötig" unten.

**Zu 4:** Option 4b. Reine Prompt-Anweisung ist keine harte Garantie (siehe `docs/decisions/2026-07-12_klassifikations-layer.md`, "Zu 3": dieselbe Erfahrung führte dort zur Eskalations-Hardrule). `packages/handlers/src/w2/sprache.ts` exportiert `istWahrscheinlichDeutsch(text)`, eine Stopwort-Scoring-Heuristik (Verhältnis deutscher zu englischer Funktionswörter), die als Code-Check in Stage 3 läuft. Sie ist eine Heuristik, kein linguistisch vollständiger Sprach-Detektor — bei Uneindeutigkeit (z. B. sehr kurzer Text, Eigennamen-lastig) markiert sie bewusst konservativ (kein Verstoß), um keine False-Positive-Retry-Schleife zu erzeugen. Zusätzlich erzwingt der Code deterministisch: die Sprache der absender-gerichteten Felder aus `W2Input` (`fragen_woertlich`, etc.) beeinflusst **nie** die interne Feld-Sprache — der Draft-Prompt bekommt die Sprach-Regel als feste System-Anweisung, unabhängig von `sprache_eingang` der Anfrage. Es gibt in v1 noch keine absender-gerichteten Freitext-Felder im W2-Output-Vertrag selbst (`comms_plan` ist vollständig intern, `export_vorbereitung.doc_end_appendix` ist reine 1:1-Kopie der Originalanfrage, kein generierter Text) — die Sprach-Regel betrifft in W2 also ausschließlich sicherzustellen, dass die sechs `comms_plan`-Felder *nicht* fälschlich in der Anfrage-Sprache verfasst werden, wenn diese vom Deutschen abweicht (Test-Fall: englische Anfrage, interne Felder bleiben deutsch).

**Zu 5:** Option 5b. `packages/handlers/src/w2/kontext.ts` exportiert `W2KontextQuellenProvider` mit vier Methoden (`sprachregelungLaden`, `ssotLaden`, `praezedenzenLaden`, `journalistenProfilLaden`) plus einen `V1_STUB_KONTEXT_QUELLEN_PROVIDER`, der für alle vier `null` liefert. Die fünfte Quelle (externes Wissen) hat keinen eigenen Loader: v1 nutzt `kunde_kontext.thema_positionierung` direkt aus dem Input, weil das laut Auftrag bereits vorhanden ist ("v1 mit dem arbeitet, was da ist"). `sammleW2Kontext(input, provider)` markiert jede der fünf Quellen im Rückgabewert explizit mit einem Status (`verfuegbar` | `leer` | `v1_stub`):
- `sprachregelungen`: `verfuegbar`/`leer` (Provider aufgerufen, v1-Default liefert `leer`)
- `ssot`: immer `v1_stub` (keine Fallback-Spec-Formulierung vorhanden, kein Vermerk nötig)
- `externesWissen`: `verfuegbar`/`leer`, abhängig von `thema_positionierung`
- `praezedenzen`: `verfuegbar`/`leer` (Provider aufgerufen, v1-Default liefert `leer`, löst den "Onboarding empfohlen"-Vermerk aus)
- `journalistenProfil`: immer `v1_stub` (keine Fallback-Spec-Formulierung vorhanden)

Nur `sprachregelungen` und `praezedenzen` haben in `WORKFLOW_HANDLERS_v1.0.md` § "Failure-Fallbacks" eine explizite Warnungs-Formulierung — deshalb bekommen nur diese beiden Quellen bei Leerstand einen sichtbaren Hinweis im Output (`open_questions`, siehe unten), `ssot`/`journalistenProfil` bleiben stumm-leer.

## Wo die Fallback-Hinweise landen

Der `W2Output`-Vertrag aus der Spec hat kein eigenes "Warnungen"-Feld. Die beiden spezifizierten Fallback-Meldungen ("reactive_statement bleibt null" ist selbsterklärend am Feldwert; "Onboarding empfohlen" braucht aber einen sichtbaren Text) werden deshalb als zusätzlicher Eintrag in `comms_plan.open_questions` angehängt (bestehendes Vertragsfeld, "Check/Confirm/Decide-Tasks für die Beraterin" passt inhaltlich: die Beraterin muss den Hinweis zur Kenntnis nehmen). Kein neues Feld im Output-Vertrag für diesen Zweck.

## Erweiterung des Output-Vertrags: `pruefung`-Feld

Der in `WORKFLOW_HANDLERS_v1.0.md` gezeigte `W2Output` listet `audit_metadaten: { ... }` nur als Platzhalter (wie bei W1 mit `kritiker_findings` als eigenem Top-Level-Feld gelöst). Der Failure-Fallback "19-Punkte-Check nach 3 Retries fehlgeschlagen -> Draft geht mit Findings raus" verlangt, dass die Findings **im Output ankommen**, nicht nur geloggt werden. Diese Decision fügt deshalb ein Feld `pruefung: { verstoesse: PruefungsVerstoss[]; versuche: number; alle_regeln_bestanden: boolean }` zum `W2Output` hinzu, analog zu `kritiker_findings` bei W1. **@thehartworker Entscheidung nötig:** Feldname/-form ist ein Vorschlag dieser Decision, keine wörtliche Spec-Vorgabe — bei Verfügbarkeit des vollständigen Meta-System-Handoffs bitte gegenprüfen und ggf. anpassen.

## Zu 3, Regel-Zuordnung (alle 12 in der Spec namentlich genannten Regeln)

| # | Regel | Einordnung | Umsetzung |
|---|-------|-----------|-----------|
| 1 | `what_were_doing` in gewünschter Sprache (Deutsch, DACH-intern) | Code-Check | `sprache.ts`, Stopwort-Heuristik |
| 2 | `reactive_statement` nur bei vorhandener Sprachregelung | Code-Check | strukturell, direkt aus `W2KontextErgebnis.sprachregelungen.status` ableitbar |
| 3 | Keine Vermittlungs-Bezüge zur Agentur | Review-Prompt | braucht Sprachverständnis (Umschreibungen, kein fester Wortschatz) |
| 4 | Keine Prozess-Erklärungen | Review-Prompt | dito |
| 5 | Keine Vermutungen | Review-Prompt | dito, "ist das eine belegte Aussage oder Spekulation" ist Urteilssache |
| 6 | Deadline-Format standardisiert | Code-Check | Regex gegen festes Format (`TT.MM.JJJJ, HH:MM Uhr`) |
| 7 | Keine Tier-Nennung | Code-Check | Keyword-Scan ("Tier 1", "Tier-1", "Tier 2", ...) |
| 8 | Keine Framing-Risiken im Plan | Review-Prompt | Urteilssache par excellence |
| 9 | Action Items nur in `open_questions` | Code-Check | Keyword-Scan auf Action-Item-Marker (`Action Item:`, `To-Do:`, `- [ ]`, `☐`) außerhalb `open_questions` |
| 10 | Background mit Quellenangabe | Code-Check | strukturell: `background_information[].sources` darf nicht leer sein |
| 11 | Standardisierter Deadline-Schlusssatz wenn explizite Deadline | Code-Check | Fixe Satzvorlage, Presence-Check wenn `anfrage.frist_at` gesetzt |
| 12 | `questions_verbatim` exakt wie Original | Code-Check | Substring-Vergleich: wo eine der `fragen_woertlich` im Draft paraphrasiert vorkommt (normalisierter Fuzzy-Match ohne exakten Substring-Treffer), wird das als Verstoß gewertet |

**@thehartworker Entscheidung nötig:** Die Spec nennt "(weitere aus Handoff)" für die restlichen ~7 Regeln, ohne sie zu benennen, und das Meta-System-Handoff-Dokument liegt nicht in diesem Repository. Diese PR implementiert bewusst nur die 12 benannten Regeln, mit einer erweiterbaren Registry (`PRUEFUNGS_REGEL`-Array plus ein `pruefungen: PruefungsCheck[]`-Array in `pruefung.ts`, neue Regeln sind additiv). Bitte: entweder das Handoff-Dokument nachreichen (dann folgt ein Ergänzungs-PR), oder bestätigen, dass 12 Regeln für den v1-Launch ausreichen.

## Modell-Wahl

- Stage 2 (Comms-Plan-Draft): Opus-Klasse, wie in der Spec explizit gefordert ("Claude Opus-Klasse") und `AGENTS.md` §7.2 ("W2, W1: Opus für Reasoning-schwere Passagen"). Default-Modell-Konstante über `ANTHROPIC_MODEL_W2_DRAFT`-Env, Fallback im Code (technisches Detail, wie beim Klassifikations-Modell).
- Stage 3 Review-Pass (die 4 Urteils-Regeln): Sonnet-Klasse. Die Spec macht für diesen Teil-Schritt keine explizite Modell-Vorgabe; `AGENTS.md` §7.2 nennt für W2 nur die Draft-Stufe explizit als Opus-pflichtig, während die generelle Richtlinie "Sonnet für Standard-Passagen" für einen stärker checklisten-artigen (wenn auch urteilsbasierten) Prüf-Pass sprechen. Konfigurierbar über `ANTHROPIC_MODEL_W2_REVIEW`-Env.
- `max_tokens`: 8000 für beide Stufen (Untergrenze aus `AGENTS.md` §7.3).

## Konsequenzen

- `packages/handlers` ist die erste Iteration des Handler-Musters, das W1/W3/... übernehmen: Stage-Funktionen als reine, einzeln testbare Module (`kontext.ts`, `prompt.ts`, `draft.ts`, `pruefung.ts`, `export.ts`), eine `handler.ts`-Orchestrierung, die Retry-Schleife hält, und ein `index.ts`-Export pro Handler-Unterordner.
- Retry-Schleife: maximal 3 Retries (4 Versuche insgesamt) für den Comms-Plan-Draft, ausgelöst durch jeden Regel-Verstoß aus Stage 3 (Code-Check oder Review-Prompt), mit einem korrigierenden Prompt, der die vorherigen Verstöße plus den vorherigen Draft als Kontext bekommt. Nach 3 Retries: der letzte Draft geht mit `pruefung.verstoesse` unraus (nicht blockiert), `pruefung.alle_regeln_bestanden = false`.
- Jeder LLM-Aufruf (Draft, Draft-Retry, Review) läuft über `callLLMWithRetry` (Rate-Limit-Retry) aus `packages/llm` — nicht zu verwechseln mit dem 19-Punkte-Check-Retry (fachlicher Retry wegen Regel-Verstoß, andere Ebene).
- `packages/handlers` hat keine Kenntnis von Supabase; Tests laufen komplett mit `MockLLMProvider` aus `@konsole/llm/testing`.
- Test-Ablage: package-lokal unter `packages/handlers/tests/w2/` (Vitest, `pnpm -r test`), konsistent mit `packages/classifier`/`packages/persistence`/`packages/llm` — nicht unter einem Root-`/tests/handlers/w2/`, wie `AGENTS.md` §3.3 wörtlich nahelegt. Das ist dieselbe Struktur-Abweichung, die die drei bestehenden Pakete bereits vorleben (deren Tests liegen ebenfalls package-lokal, nicht unter einem Root-`/tests/`-Verzeichnis); diese Decision übernimmt das etablierte Muster statt zwei parallele Test-Ablage-Konventionen im selben Repo zu erzeugen.
