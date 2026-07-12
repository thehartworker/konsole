# Klassifikations-Layer (Intake)

**Datum:** 2026-07-12
**Status:** vorgeschlagen

**Kontext:** `BUILD_PLAN_v1.0.md` Woche 3, Teil 1 verlangt den Klassifikations-Layer: eine Funktion, die eine eingehende Nachricht per LLM nach dem Ausgabe-Schema aus `SAAS_SPEC_v1.0_CONSOLE.md` §3.4 klassifiziert. Migrations und RLS-Policies liegen bereits auf `main` (`docs/decisions/2026-07-10_datenmodell.md`, `docs/decisions/2026-07-10_rls-policies.md`) und sind getestet. Diese Decision legt fest, wie `packages/llm` und `packages/classifier` gebaut werden, bevor der Code entsteht (`AGENTS.md` §3.2).

Diese Decision deckt nur Provider-Abstraktion und Klassifikations-Logik ab (PR Teil 1). Persistenz (`vorgaenge`/`anliegen`/`audit_log`/Token-Zähler), Autonomie-Level-Durchsetzung beim Anlegen eines Vorgangs, und die minimale UX folgen in Teil 2, siehe "Grenze Klassifikation/Handler-Auslösung" unten für die genaue Schnittstelle zwischen den beiden Teilen.

## Optionen

**1. Prompt-Struktur**

1a. Ein einzelner Mega-Prompt, der sowohl System-Rolle als auch Aufgaben-Beschreibung, Regeln und Beispiel-Output in einem `user`-Message-Block bündelt.
1b. Trennung in `system` (Rolle, Grundprinzipien §3.1, Rückfragen-Regeln §3.2, Eskalations-Hardrule §3.3, Ausgabeformat- und Sprachregeln, Ausschlüsse §7.1) und `user`-Prompt (die konkrete Nachricht als strukturiertes JSON plus Kunden-Kontext).

**2. §3.4-zu-Zod-Abbildung**

2a. Nur die im Auftrag explizit genannten Felder abbilden (`typ_primaer`, `typ_sekundaer`, `confidence`, `sensitivity`, `prioritaet`, `sprache_ausgang`, `routing`, `anliegen[]`).
2b. Das vollständige §3.4-Schema abbilden (zusätzlich `sprache_eingang`, `verstandener_inhalt`, `transkript_qualitaet`, `kunde_slug`, `felder`, `erschlossen`, `annahmen`, `missing_mandatory`, `rueckfragen`, `rueckfrage_nachricht`, `antwort_nachricht`, `backend_calls_geplant`, `audit_summary`, `zusammenfassung`).

**3. Eskalations-Hardrule-Durchsetzung**

3a. Nur per Zod validieren: Verletzung führt zu `fehlgeschlagen`, das Feld-Muster selbst bleibt, wie das LLM es geliefert hat.
3b. Zusätzlich zur Zod-Validierung eine deterministische Nachbearbeitung, die `rueckfragen = []`, `rueckfrage_nachricht = null` und eine neutrale `antwort_nachricht` erzwingt, sobald `sensitivity != normal` oder `typ_primaer in {Freigabe, Issue, Krise}` – unabhängig davon, was das LLM tatsächlich geliefert hat.

**4. Token-Verbrauch-Speicherort**

4a. Neue Spalten auf `kunden` (z. B. `llm_tokens_input_gesamt`, `llm_tokens_output_gesamt`), die bei jedem Call inkrementiert werden.
4b. Neue Tabelle `llm_nutzung`, ein Zeile pro LLM-Call, mit `kunde_id`, `agentur_id` (denormalisiert, Option 3 aus `2026-07-10_datenmodell.md`), `vorgang_id`, `zweck` (`klassifikation` | später Handler-Slugs), `modell`, `input_tokens`, `output_tokens`, `created_at`.

## Entscheidung

**Zu 1:** Option 1b. System/User-Trennung ist der Anthropic-Messages-API-Konvention entsprechend sauberer trennbar (Regeln ändern sich nicht pro Nachricht, der Prompt-Cache der API kann den `system`-Teil wiederverwenden) und hält den Prompt wartbar: Regel-Änderungen (die laut `AGENTS.md` §7.1 immer über eine Design-Decision laufen) betreffen nur den `system`-Teil, nicht die Nachricht-Serialisierung.

Der Prompt wird aus den in `SAAS_SPEC_v1.0_CONSOLE.md` §3.1–§3.4 und §7.1 dokumentierten Prinzipien deterministisch zusammengesetzt (`packages/classifier/src/prompt.ts`), nicht wörtlich aus einem bestehenden Prototyp-Prompt übernommen, weil kein solcher Prompt-Text im Repository vorliegt. Das ist eine Neu-Formulierung der dokumentierten Prinzipien, keine Prompt-Erfindung im Sinne von `AGENTS.md` §4 ("Prompts... sind entweder aus den Specs übernommen oder in einer Design-Decision dokumentiert und begründet") – hiermit dokumentiert und begründet.

Der `user`-Prompt enthält: die Nachricht als JSON (Kanal, Absender, Betreff, Inhalt, Eingangszeitpunkt als Anker für Frist-Auflösung §3.1), den Kunden-Slug, und optional eine Kontaktdatenbank-Kurzliste (Name, Rolle) für die Absender-Auflösung, falls vorhanden. Ohne Kontaktdatenbank funktioniert die Klassifikation weiterhin (§2.3: `aufgeloester_name`/`aufgeloeste_rolle` sind nullable).

**Zu 2:** Option 2b, vollständiges Schema. Der Auftrag selbst verlangt es wörtlich ("Fordert das vollständige §3.4-Ausgabe-Schema an"). Zusätzlicher Grund: einzelne Felder aus dem vollständigen Schema sind Voraussetzung für spätere Schritte, die nicht in dieser Decision liegen, aber ohne die Felder nicht nachrüstbar wären, ohne den Prompt erneut zu ändern – etwa `antwort_nachricht`/`rueckfrage_nachricht` für den Checkpoint-1-Versand (§5.1) oder `backend_calls_geplant` für die Handler-Trigger-Vorschau in der Konsole (§6.2).

Die Zod-Schema-Datei (`packages/classifier/src/schema.ts`) bildet jedes Feld aus dem §3.4-Beispiel 1:1 ab. Enum-Werte (`typ_primaer`, `sensitivity`, `prioritaet`, `backend_handler_vorschlag`) sind identisch zu den Postgres-Enums aus `supabase/migrations/20260711130000_enums_und_basistabellen.sql`, damit eine spätere Persistenz (Teil 2) keine Werte-Übersetzung braucht.

Zusätzlich zur reinen Struktur-Validierung prüft das Schema per `superRefine` die automatisch prüfbaren Ausschlüsse aus §7.1:
- verbotene Phrasen ("in der heutigen schnelllebigen ...", "es ist wichtig zu betonen", "wir freuen uns") in `antwort_nachricht`/`rueckfrage_nachricht`
- Umlaut-Ersatzformen (ae/oe/ue) in denselben Feldern, über eine kuratierte Wortliste statt eines generischen Regex (ein generischer Regex auf `ae|oe|ue` hätte zu viele falsch-positive Treffer bei legitimen Wörtern; die Wortliste ist bewusst als Heuristik markiert und erweiterbar)
- Selbst-Nummerierung in `rueckfragen` (§3.2: "keine Selbst-Nummerierung im Klassifikations-Output")

Die `ss`-statt-`ß`-Prüfung aus §7.1 wird bewusst **nicht** automatisiert (zu viele legitime Wörter mit "ss" im Deutschen, z. B. "dass", "muss" – ein Regex-Check hätte eine inakzeptable Falsch-Positiv-Rate). Das bleibt eine Lücke, die in der menschlichen Beurteilungs-Rubrik (§7.2) hängen bleibt.

**Zu 3:** Option 3b. `AGENTS.md` §4 nennt die Eskalations-Hardrule "unantastbar" – das liest diese Decision als Anforderung an eine harte, deterministische Durchsetzung im Code, nicht nur als Validierungs-Regel, die bei Verletzung den ganzen Vorgang verwirft. Ein LLM, das trotz Prompt-Anweisung fälschlich eine inhaltliche Rückfrage bei einem sensitiven Vorgang liefert, soll nicht dazu führen, dass der gesamte Vorgang als `failed` verworfen wird (das wäre schlechter für den Absender: kein Vorgang, keine Empfangsbestätigung), sondern dass der Layer selbst nachbessert.

`packages/classifier/src/eskalation.ts` exportiert `erzwingeEskalationsHardrule()`, die nach erfolgreicher Zod-Validierung läuft und bei `sensitivity != normal` oder `typ_primaer in {Freigabe, Issue, Krise}` deterministisch `rueckfragen = []`, `rueckfrage_nachricht = null` setzt und `antwort_nachricht` durch die neutrale Vorlage aus §3.3 ersetzt ("Hallo [Name], deine Nachricht ist angekommen und liegt bei [zuständige Person]. Sie meldet sich schnellstmöglich."). Die Namens-Auflösung nutzt in Teil 1 nur, was die Klassifikation selbst liefert (`felder.absender_name`, `routing.person_slug`/`routing.rolle`), weil eine vollständige Namens-Auflösung über `kunden_kontakte`/`nutzer` einen DB-Join braucht, der erst in Teil 2 existiert. Das ist eine bewusste Vereinfachung für Teil 1, kein Spec-Verstoß (§3.3 schreibt keine Quelle für "[Name]"/"[zuständige Person]" vor).

**Sensitivity-Erkennung per Hardrule (§3.3-Auftrag, zusätzlich zur LLM-Klassifikation):** `packages/classifier/src/sensitivity.ts` scannt `betreff`/`inhalt_text` deterministisch gegen Stichwort-Muster für die vier Nicht-normal-Kategorien:
- `krise`: "Krise", "Shitstorm", "Skandal", "Rückruf", "Klage", "Anwalt", "Vorwurf", "Missstand"
- `vertraulich`: "vertraulich", "Embargo", "geheim", "NDA", "nicht veröffentlicht", "unter Verschluss"
- `besonders_geschuetzt` (Art. 9 DSGVO, §8.6): "Diagnose", "Erkrankung", "Krankheit", "religiös", "Glaubensrichtung", "sexuelle Orientierung", "Gewerkschaft", "Parteimitgliedschaft"
- `regulatorisch_relevant` (Pharma-Compliance, §9 / `GESELLSCHAFT_UND_PILOT_v1.0.md` §B.3): "Wirksamkeit", "Nebenwirkung", "off-label", "HWG", "AMG", "MDR", "Studienergebnis", "Arzneimittel", "Wirkstoff", "verschreibungspflichtig"

Trifft eine Regel, wird die Sensitivity mindestens auf diesen Wert angehoben, aber nie abgeschwächt, falls das LLM selbst schon eine (andere) Nicht-normal-Sensitivity erkannt hat – konsistent mit der Feststellung in `2026-07-10_datenmodell.md`, dass alle vier Nicht-normal-Werte beim Picking gleichrangig behandelt werden. Diese Wortlisten sind eine Sicherheitsnetz-Heuristik, keine wörtliche Spec-Ableitung (die Spec liefert Prinzipien, keine Wortlisten) – explizit hier benannt, damit sie nicht als Spec-Zitat missverstanden wird. Sie sollten mit echten Produktionsdaten nachgeschärft werden.

**Zu 4: @thehartworker Entscheidung nötig:** Diese Decision schlägt Option 4b (neue Tabelle `llm_nutzung`) vor, aus denselben Gründen wie die Options-3-Begründung in `2026-07-10_datenmodell.md`: pro-Call-Granularität erlaubt spätere Abrechnung/Limits pro Zeitraum, pro Zweck (Klassifikation vs. später Handler W1–W6) und Audit ("welcher Call hat wie viele Tokens verbraucht"), was mit kumulierten Spalten auf `kunden` nicht mehr rekonstruierbar wäre. Konkreter Vorschlag für die Migration (kommt in Teil 2, nicht in diesem PR):

```sql
CREATE TABLE llm_nutzung (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agentur_id uuid NOT NULL REFERENCES agenturen (id),
  kunde_id uuid NOT NULL REFERENCES kunden (id),
  vorgang_id uuid REFERENCES vorgaenge (id),
  zweck text NOT NULL,              -- 'klassifikation', später 'W1_pressemitteilung_drafter' etc.
  modell text NOT NULL,
  input_tokens integer NOT NULL CHECK (input_tokens >= 0),
  output_tokens integer NOT NULL CHECK (output_tokens >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Bitte bestätigen oder Alternative vorgeben, bevor Teil 2 (Persistenz) beginnt. Bis dahin gibt `packages/classifier` den Token-Verbrauch pro Call im Rückgabewert von `klassifiziereNachricht()` zurück (`tokenVerbrauch: { input_tokens, output_tokens }`), schreibt aber nichts in die DB – das ist Teil-2-Scope.

## Shadow-Mode-Durchsetzung (§5.1)

`packages/classifier` löst **keinen** Handler aus und versendet **nichts**. Die Funktion `klassifiziereNachricht()` hat keinen Code-Pfad, der `packages/handlers` importiert, eine Nachricht verschickt, oder eine `handler_aufrufe`-Zeile anlegt. `backend_handler_vorschlag` pro `anliegen` ist reine Daten im Rückgabewert, kein Aufruf. Damit ist Stufe 1 (Shadow-Mode) für diesen Layer nicht "konfiguriert", sondern strukturell erzwungen: es gibt in Teil 1 überhaupt keinen Code, der etwas anderes tun könnte.

Die eigentliche Autonomie-Level-Prüfung (`kunden.autonomie_level`) gehört in die Persistenz-Schicht (Teil 2): dort entscheidet sich, ob `antwort_nachricht` automatisch versendet wird (Stufe 2/3) oder auf manuelle Freigabe wartet (Stufe 1, Default). Diese Decision hält fest, dass Teil 2 diese Prüfung **vor** jedem Versand-Trigger einbauen muss, mit Stufe 1 als hartem Default, bis `kunden.autonomie_level` explizit etwas anderes sagt.

## Grenze Klassifikation/Handler-Auslösung

`packages/classifier` endet mit einem validierten, hardrule-durchgesetzten `KlassifikationsErgebnis` plus Token-Verbrauch. Alles danach – Vorgang/Anliegen/Audit-Log anlegen, `llm_nutzung` schreiben, `klassifikation_status` von `queued` über `in_progress` nach `done`/`failed` fahren, Autonomie-Level für den Versand der `antwort_nachricht` prüfen, `handler_aufrufe`-Zeilen aus `backend_handler_vorschlag` erzeugen – ist Teil-2-Scope (Persistenz) und liegt bewusst außerhalb dieses Pakets. `packages/classifier` kennt weder Supabase noch die Service-Role, es ist reine Prompt-Bau- und Validierungs-Logik mit einer `LLMProvider`-Abhängigkeit.

## Konsequenzen

- `packages/llm` ist provider-agnostisch nutzbar: das `LLMProvider`-Interface kennt weder Klassifikation noch Zod, nur strukturierte Text-Completions mit Token-Rückgabe. Spätere Handler (W1–W6) können dasselbe Interface und denselben Retry-Wrapper verwenden.
- Der optionale `apiKey`-Parameter im Interface ist in v1 tot (immer der zentrale `ANTHROPIC_API_KEY`), aber vorhanden, damit ein späterer agentur-spezifischer Key (verschlüsselt in der Agentur-Konfiguration, siehe Auftrag) ohne Interface-Bruch nachgerüstet werden kann.
- Das Default-Modell für die Klassifikation kommt aus `ANTHROPIC_MODEL_KLASSIFIKATION` (Env), mit einem Fallback-Konstanten im Code. Anthropic-Modell-Bezeichner ändern sich; der Fallback-Wert ist ein technisches Detail, keine strategische Entscheidung, und per Env jederzeit überschreibbar.
- Teil 2 muss beim Anlegen der `vorgaenge`-Zeile `zustaendige_nutzer_id` aus `routing.person_slug` auflösen (Slug-zu-UUID über `nutzer`/`kunden_kontakte`) – diese Auflösung existiert in Teil 1 nicht, weil sie einen DB-Zugriff braucht.
- Die Sensitivity-Hardrule-Wortlisten sind ein Startpunkt, kein Abschluss. Sollte sich in der Pilot-Phase (MENSCH Kreativagentur) zeigen, dass Pharma-Signale (§9) häufiger falsch negativ durchrutschen, ist das ein Kandidat für eine eigene Nachschärfung, nicht für diese Decision.
- Beim Portieren des Retry-Wrappers ist aufgefallen, dass der letzte Schleifendurchlauf im kanonischen Muster aus `AGENTS.md` §7.4 (`attempt === maxRetries`) nie in den `continue`-Zweig läuft, weil `attempt < maxRetries` dann `false` ist – der finale `throw new Error('Rate-Limit persistent nach 6 Retries')` nach der Schleife ist dadurch unerreichbarer Code, der letzte Versuch wirft stattdessen immer den rohen `LLM <status>: ...`-Fehler aus dem `!res.ok`-Zweig. `packages/llm/src/retry.ts` übernimmt das Muster bewusst wörtlich (Fidelity zum dokumentierten, bridgebound-gehärteten Code), der Test in `packages/llm/tests/retry.test.ts` prüft deshalb das tatsächliche statt des vermutlich beabsichtigten Verhaltens. Das ist inhaltlich unkritisch (es wird in jedem Fall geworfen, nur mit anderer Fehlermeldung), aber erwähnenswert, falls `AGENTS.md` §7.4 selbst einmal nachgeschärft wird.

## Offene Fragen (für Bastian)

1. **Token-Verbrauch-Speicherort** (siehe oben, Punkt 4): Tabelle `llm_nutzung` wie vorgeschlagen, oder Alternative?
