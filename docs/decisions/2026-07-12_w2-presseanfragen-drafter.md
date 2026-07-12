# W2: Presseanfragen-Drafter (Referenz-Handler)

**Datum:** 2026-07-12
**Status:** vorgeschlagen

**Kontext:** `WORKFLOW_HANDLERS_v1.0.md` benennt W2 als Referenz-Implementierung, an der sich W1/W3/... orientieren (Issue #32). Der ursprüngliche Auftrag beschreibt Stage 3 als festen "19-Punkte-Check" nach den Meta-System-Feedback-Regeln. Noch bevor Code auf `main` gemerged war, korrigierte ein Folge-Kommentar auf Issue #32 diese Annahme: die Meta-Regeln fest im Handler zu verdrahten passt nicht zu einem kundenagnostischen Multi-Tenant-SaaS, weil jeder Kunde jeder Agentur andere Kommunikationsregeln braucht (Pharma- vs. Konsumgüter-Kunde derselben Agentur). Diese Decision dokumentiert direkt die korrigierte, finale Architektur (keine separate Zwischen-Decision für den verworfenen festen Regelsatz).

## Optionen

**1. Paket-Struktur**

1a. `packages/handler-w2` als eigenständiges Paket pro Handler.
1b. `packages/handlers` (`@konsole/handlers`) als ein Paket für alle sechs Backend-Handler, mit `src/w2/`, `src/w1/`, ... als Unterordner pro Handler.

**2. Wo lebt die Regel-Engine-Logik**

2a. Vollständig in `packages/persistence` (kennt Supabase), `packages/handlers` bekommt nur das Endergebnis (bestanden/nicht bestanden) übergeben.
2b. Die Regel-*Anwendung* (Baustein-Registry, Review-Prompt-Bau, Retry-Orchestrierung) lebt in `packages/handlers` als reine Funktion über einem injizierten `Pruefregel[]`-Array. Das *Laden* aus der DB (`pruefregeln`-Tabelle) und die Default-Template-Zuweisung leben in `packages/persistence`.

**3. Aufteilung der Regeln: Code-Baustein vs. LLM-Prompt**

3a. Alle Regeln als LLM-Prompt-Text, auch die deterministisch prüfbaren (einfacher DB-Schema, aber unnötiger Token-Verbrauch und unzuverlässiger als Code für exakte Prüfungen wie "Quellenangabe vorhanden").
3b. Deterministisch prüfbare Regeln als benannte Code-Bausteine (Registry), urteilsbasierte Regeln als reine Prompt-Texte im Review-Pass.

**4. Kontext-Sammlung (Stage 1) bei fehlenden Datenbeständen**

4a. Stage 1 wirft einen Fehler, wenn eine der fünf RAG-Quellen nicht angebunden ist.
4b. Stage 1 kapselt jede Quelle hinter einem `KontextQuelle<T>`-Wrapper (`verfuegbar`, `daten`), v1-Stubs liefern `verfuegbar: false`, Fallback-Hinweise laufen als Daten durch, kein Fehler.

## Entscheidung

**Zu 1:** Option 1b, `packages/handlers` als ein Paket mit `src/w2/` als erstem, referenz-gebendem Unterordner. Der Auftrag selbst sagt "packages/handlers/w2 oder packages/handler-w2, du entscheidest", und `AGENTS.md` §5 sieht `packages/handlers/` (Singular-Struktur, "die sechs Backend-Handler") als ein Paket vor. Sechs eigenständige Pakete für strukturell identische Handler (gleiches `LLMProvider`, gleiche Retry-Semantik, gleiches Shadow-Mode-Muster) wären unnötige Wiederholung von `package.json`/`tsconfig.json`. `packages/handlers` kennt kein Supabase, keine Service-Role (wie `packages/classifier`) — reine Business-Logik mit `LLMProvider`-Abhängigkeit, testbar mit `MockLLMProvider`.

**Zu 2:** Option 2b. Die Grenze folgt derselben Trennung wie `packages/classifier`/`packages/persistence`: alles, was reine Transformation/Validierung ist (Baustein-Anwendung, Review-Prompt-Bau, Retry-Schleife), bleibt ohne DB-Abhängigkeit testbar. Alles, was Supabase braucht (Regeln laden, Default-Template beim Onboarding zuweisen, `llm_nutzung` schreiben), lebt in `packages/persistence`. `packages/handlers` exportiert den reinen Typ `Pruefregel` (Werte-Form einer `pruefregeln`-Zeile, ohne `kunde_id` — der Aufrufer hat die Regeln bereits kunde-gescoped geladen) sowie `PruefregelDefinition` (dieselbe Form ohne `id`, für das Default-Template vor dem Insert). `packages/persistence/src/pruefregeln.ts` definiert zusätzlich lokal `PruefregelZeile` (= `Pruefregel` + `kunde_id`) für die eigene Lade-/Fake-Repository-Logik.

**Zu 3:** Option 3b. Acht Regeln sind als Code-Bausteine implementiert (`packages/handlers/src/w2/regel-engine/bausteine.ts`), vier als LLM-Prompt-Regeln — zusammen das Default-Template mit 12 Regeln (siehe unten, "Default-Template"):

| Baustein-Name (`code_baustein`) | Prüft |
|---|---|
| `was_wir_tun_zielsprache` | `what_were_doing` ist in der konfigurierten internen Sprache (Default `de`), Heuristik `istWahrscheinlichDeutsch()` |
| `reactive_statement_nur_bei_sprachregelung` | `reactive_statement` ist `null`, wenn keine Sprachregelung vorhanden (Stage-1-Kontext) |
| `keine_tier_nennung` | keine "Tier 1/2/3"-Einstufung im Klartext in irgendeinem Textfeld |
| `keine_agentur_vermittlungs_bezug` | keine Formulierungen wie "unsere Agentur hat weitergeleitet" |
| `keine_prozess_erklaerungen` | keine Erklärung interner Freigabewege/Prozesse |
| `action_items_nur_in_open_questions` | keine Action-Item-Marker (`TODO`, `- [ ]`, ...) außerhalb `open_questions` |
| `background_mit_quellenangabe` | jeder `background_information`-Eintrag hat mindestens eine nicht-leere Quelle |
| `deadline_schlusssatz_bei_frist` | bei gesetzter `frist_at` enthält `reactive_statement` oder eine `open_questions`-Zeile einen standardisierten Deadline-Hinweis (`bis TT.MM.JJJJ`) |

Die vier LLM-Prompt-Regeln (unbelegte Vermutungen, Framing-Risiken, Authentizität des `reactive_statement`, echte Entscheidungsfragen in `open_questions`) laufen in einem einzigen Review-Pass (Sonnet-Klasse): alle aktiven `llm_prompt`-Texte werden gemeinsam in einen Prompt gebündelt, das Modell liefert strukturierte Verstöße mit Regel-Index zurück (Zod-validiert, `packages/handlers/src/w2/regel-engine/pruefung.ts`). Ein Review-Pass statt eines LLM-Calls pro Regel, weil sonst bei 4+ aktiven LLM-Regeln pro Kunde die Token-/Latenz-Kosten pro Draft-Versuch linear mit der Regel-Anzahl wachsen würden — bei bis zu 3 Retries sonst potenziell 12+ zusätzliche Calls pro Handler-Lauf.

Ein unbekannter `baustein_name` (z. B. eine DB-Zeile mit Tippfehler oder ein noch nicht implementierter Baustein) wird **fail-closed** als Verstoß gewertet, nicht stillschweigend übersprungen — eine falsch konfigurierte Regel darf nie dazu führen, dass sie effektiv nie geprüft wird.

**Zu 4:** Option 4b. `packages/handlers/src/w2/kontext.ts` sammelt aus fünf benannten Quellen (`sprachregelungen`, `ssot`, `externes_wissen`, `praezedenzen`, `journalisten_profil`), jede als `KontextQuelle<T>` mit `verfuegbar`/`daten`. v1-Umsetzung pro Quelle:

- `sprachregelungen`: über `W2KontextQuellenProvider.sprachregelungenLaden()`, injizierbar. v1: `LeererW2KontextQuellenProvider` liefert immer `[]` (kein produktiver Datenbestand vorhanden), Tests injizieren eine Fake-Implementierung mit Fixture-Daten.
- `praezedenzen`: gleiches Muster, `praezedenzenLaden()`.
- `externes_wissen`: direkt aus `W2Input.kunde_kontext.thema_positionierung` (kein RAG nötig, das Feld liegt bereits im Input-Kontrakt).
- `ssot` und `journalisten_profil`: **reine v1-Stubs**, immer `{ verfuegbar: false, daten: null }`. Kein Interface, keine Methode — es gibt in v1 keinen befüllten Datenbestand (frühere Comms-Plans desselben Kunden bzw. Journalisten-Artikel-Historie), ein Interface dafür zu bauen wäre vorgezogene Abstraktion ohne Gegenstück.

Fallbacks laufen als `hinweise: string[]` durch den gesamten Handler-Lauf bis in `W2Output.hinweise`, kein Fehler-Pfad: leere Sprachregelungen → Hinweis "reactive_statement bleibt leer", leere Präzedenzen → "Onboarding empfohlen" (SAAS_SPEC-Fallback wörtlich).

## Regel-Engine (Kernstück dieser Decision)

### Schema `pruefregeln`

```sql
CREATE TABLE pruefregeln (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kunde_id uuid NOT NULL REFERENCES kunden (id),
  agentur_id uuid NOT NULL REFERENCES agenturen (id),  -- denormalisiert, Trigger-gesetzt
  handler_slug handler_slug NOT NULL,                  -- bestehendes Enum wiederverwendet
  typ pruefregel_typ NOT NULL,                          -- 'code_baustein' | 'llm_prompt'
  baustein_name text,                                   -- NOT NULL wenn typ = code_baustein
  parameter jsonb NOT NULL DEFAULT '{}'::jsonb,
  prompt_text text,                                     -- NOT NULL wenn typ = llm_prompt
  aktiv boolean NOT NULL DEFAULT true,
  reihenfolge integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
```

`handler_slug` referenziert bewusst das bestehende Postgres-Enum aus `20260711130000_enums_und_basistabellen.sql` statt eines neuen `text`-Felds (anders als `llm_nutzung.handler_slug`, das `text` ist, weil dort auch `'klassifikation'` als Nicht-Handler-Wert vorkommt) — `pruefregeln.handler_slug` ist immer ein echter Backend-Handler (W1–W6), ein zusätzlicher Wert ist nie nötig.

Ein `CHECK`-Constraint erzwingt, dass genau eines von `baustein_name`/`prompt_text` befüllt ist, abhängig von `typ` — eine falsch konfigurierte Zeile (z. B. `typ = 'code_baustein'` mit `prompt_text` statt `baustein_name`) ist damit auf DB-Ebene unmöglich, nicht nur eine Anwendungs-Konvention.

`agentur_id` wird per `BEFORE INSERT`-Trigger aus `kunde_id` übernommen, identisches Muster wie `llm_nutzung_agentur_id_setzen_trg`.

### RLS

`pruefregeln_lesen`: `agentur_id = current_agentur_id() AND (current_rolle() = 'chef' OR ist_kunde_zugewiesen(kunde_id))` — wörtlich dasselbe Muster wie `kunden_kontakte_lesen`/`llm_nutzung_lesen`. Bewusst keine INSERT/UPDATE/DELETE-Policy für authentifizierte Rollen: in v1 gibt es kein Editier-UI (siehe Auftrag, "Kein UI zum Editieren in v1"), Regeln werden ausschließlich über die Service-Role beim Onboarding gesetzt. Ein `throws_like`-pgTAP-Test beweist, dass ein `chef`-Insert an der RLS-Policy scheitert.

### Laden zur Laufzeit

`packages/persistence/src/pruefregeln.ts` definiert `PruefregelnRepository` (Interface-Pattern wie `KlassifikationsRepository`/`LLMProvider`): `aktivePruefregelnLaden(kundeId, handlerSlug)` selektiert `aktiv = true AND deleted_at IS NULL`, sortiert nach `reihenfolge`. `packages/persistence/src/w2-orchestrierung.ts` lädt die Regeln, ruft `fuehreW2Aus()` aus `packages/handlers` auf und schreibt danach die `llm_nutzung`-Zeilen (siehe unten).

### Default-Template (Onboarding)

`packages/handlers/src/w2/regel-engine/default-template.ts` exportiert `W2_DEFAULT_PRUEFREGELN: PruefregelDefinition[]` mit den 12 oben genannten Regeln (8 Code-Bausteine + 4 LLM-Prompt-Regeln), `reihenfolge` 1–12, alle `aktiv: true`. `PruefregelnRepository.defaultTemplateZuweisen(kundeId, definitionen)` fügt diese Definitionen als neue `pruefregeln`-Zeilen für einen Kunden ein (Service-Role, außerhalb RLS). Ein neu angelegter Kunde bekommt dieses Set beim Onboarding zugewiesen (Aufruf von `defaultTemplateZuweisen(kundeId, W2_DEFAULT_PRUEFREGELN)`, in v1 manuell/per Skript getriggert, kein automatischer Onboarding-Flow — der existiert noch nicht). Die 7 aus dem WORKFLOW_HANDLERS-Text erwähnten, aber nicht namentlich aufgeführten Meta-Regeln werden **nicht** nachgezogen: sie waren Meta-Press-spezifisch, und weil Regeln jetzt ohnehin pro Kunde frei konfigurierbar sind, ist das Default-Set nur ein anpassbarer Startpunkt, kein vollständiges Abbild des alten Meta-Handoffs. Damit ist die in einem früheren (nie gemergten) Kommentar offene Frage zu den fehlenden 7 Regeln gegenstandslos.

### Grenze zu `packages/handlers`

`fuehreRegelEngineAus(draft, regeln: Pruefregel[], kontext, provider, optionen)` kennt keine Datenbank. Sie bekommt das bereits kunde-gescopte, aktive Regel-Array injiziert, wendet `code_baustein`-Regeln über die Registry an und baut aus den aktiven `llm_prompt`-Regeln den Review-Prompt. Damit ist derselbe Handler-Code für jeden Kunden korrekt, ohne dass er weiß, dass Kunden überhaupt existieren — die Kundenagnostik liegt vollständig in dem, was `packages/persistence` ihm übergibt.

## Sprach-Regel: technische Durchsetzung

Alle sechs Comms-Plan-Felder sind **immer** Deutsch, unabhängig von der Sprache der eingegangenen Presseanfrage (WORKFLOW_HANDLERS §W2: "weil sie Kommunikation innerhalb der Agentur sind"). W2Output hat kein absender-gerichtetes Textfeld (anders als der Klassifikations-Output mit `antwort_nachricht`/`rueckfrage_nachricht`) — der Comms-Plan geht nie direkt an den Journalisten, sondern ist reines internes Arbeitsmaterial für die Beraterin. Damit ist die "Absender-Ausgabe-Sprache pro Agentur konfigurierbar"-Aussage aus dem Auftrag für W2 in v1 gegenstandslos: es gibt keinen Absender-Ausgabe-Text in diesem Kontrakt, den man konfigurieren müsste.

Technische Durchsetzung, zweistufig wie bei der Eskalations-Hardrule in `packages/classifier`:
1. **Prompt-Ebene:** der System-Prompt (`packages/handlers/src/w2/prompt.ts`) verlangt explizit deutsche Ausgabe für alle sechs Felder, unabhängig von `anfrage.thema_beschreibung`/`fragen_woertlich`.
2. **Code-Ebene:** der Baustein `was_wir_tun_zielsprache` prüft `what_were_doing` per Heuristik (`packages/handlers/src/w2/sprache.ts`, `istWahrscheinlichDeutsch()` — Stopwort-Dichte Deutsch vs. Englisch plus Umlaut-Signal, analog zur bestehenden `findUmlautErsatz`-Heuristik in `packages/classifier/src/schema.ts`). Eine Verletzung ist ein regulärer Regel-Verstoß, der denselben Retry-Mechanismus wie jede andere Regel durchläuft — kein separater Hardrule-Pfad, weil die Sprach-Regel im Unterschied zur Eskalations-Hardrule nicht sicherheitskritisch, sondern eine Qualitäts-Regel ist, die über den korrigierenden Prompt behandelt werden kann.

Der Testfall "Anfrage auf Englisch → interne Felder bleiben Deutsch" beweist beide Ebenen gemeinsam über einen vollständigen Handler-Lauf mit `MockLLMProvider`.

## Retry-Interpretation ("max. 3 Retries")

Sowohl der ursprüngliche Auftrag als auch die Architektur-Nachschärfung sprechen von "max. 3 Retries" für die Regel-Engine. Diese Decision liest das als **maximal 3 Versuche insgesamt** (nicht 1 Erstversuch + 3 zusätzliche Retries = 4 Versuche): `fuehreW2Aus()` läuft eine Schleife von bis zu 3 Iterationen, jede Iteration erzeugt einen neuen Draft (Stage 2, mit Korrektur-Hinweis aus den Verstößen der Vorrunde ab Iteration 2) und prüft ihn (Stage 3). Bricht die Schleife nach 3 Versuchen ohne bestandene Prüfung ab, greift der Spec-Fallback: der letzte Draft geht mit den offenen Verstößen im `pruefung`-Feld des Outputs raus, die Beraterin zieht manuell nach. Explizit hier festgehalten, falls sich diese Lesart als falsch herausstellt.

## Output-Kontrakt-Erweiterung: `pruefung`

Der in `WORKFLOW_HANDLERS_v1.0.md` gezeigte `W2Output` listet `audit_metadaten: { ... }` nur als Platzhalter, ohne ein Feld für die Verstöße nach ausgeschöpften Retries zu benennen. Diese Implementierung ergänzt `pruefung: { bestanden, versuche, verstoesse }` (analog zu `kritiker_findings` bei W1) — eine Erweiterung über den wörtlichen Spec-Ausschnitt hinaus, aber notwendig, damit der im Auftrag selbst geforderte Fallback ("Draft geht mit Findings raus") überhaupt einen Ort im Output hat. Zusätzlich `hinweise: string[]` für die Stage-1-Fallback-Warnungen (leere Sprachregelungen/Präzedenzen).

## Shadow-Mode-Durchsetzung

Wie `packages/classifier` und `packages/persistence` (Klassifikations-Pfad) hat `packages/handlers/src/w2` strukturell keinen Code-Pfad, der etwas versendet oder einen weiteren Handler auslöst — `fuehreW2Aus()` ruft ausschließlich `LLMProvider.strukturierteCompletion()` auf und gibt reine Daten zurück. `benoetigt_menschliche_freigabe` ist im Zod-Schema als `z.literal(true)` fixiert, kann also nicht versehentlich `false` werden. `packages/persistence/src/w2-orchestrierung.ts` fügt keinen Versand-Trigger hinzu, sie lädt Regeln, ruft den Handler auf und schreibt `llm_nutzung`.

## Token-Erfassung

`fuehreW2Aus()` gibt `llmAufrufe: W2LlmAufruf[]` zurück — einen Eintrag pro tatsächlichem LLM-Call (jeder Draft-Versuch, jeder Review-Pass), auch wenn der Gesamtlauf am Ende scheitert (Draft-JSON-Fehler o. ä.), aus demselben Grund wie in `packages/classifier`/`persistiere-klassifikation.ts`: der Call wurde bereits abgerechnet. `w2-orchestrierung.ts` schreibt für jeden Eintrag eine eigene `llm_nutzung`-Zeile mit `handler_slug = "W2_presseanfragen_drafter"`.

## Konsequenzen

- Der ursprünglich im Auftrag beschriebene feste "19-Punkte-Check" existiert an keiner Stelle im Code — nur das Default-Template mit 12 Regeln, das jederzeit pro Kunde überschrieben werden kann.
- W1/W3 (nächste Referenz-Konsumenten dieses Musters) übernehmen dieselbe Regel-Engine-Struktur (`pruefregeln.handler_slug` ist bereits generisch), brauchen aber jeweils eigene Baustein-Registries und Default-Templates, weil ihre Prüf-Regeln inhaltlich andere sind.
- Ohne Editier-UI (v2-Scope) ist die Kunden-Konfiguration in v1 ein Betriebs-Vorgang (SQL/Service-Funktion), kein Self-Service — akzeptiert für den Piloten (ein Kunde: MENSCH Kreativagentur), wird aber schnell zum Engpass, sobald mehrere Kunden mit wirklich unterschiedlichen Regeln onboarden.
- Der Review-Pass bündelt alle aktiven LLM-Prompt-Regeln in einem Call. Das begrenzt, wie viele urteilsbasierte Regeln ein Kunde realistisch aktivieren kann, bevor der Prompt selbst unübersichtlich wird — kein hartes Limit in v1, aber ein Kandidat für eine spätere Sortierung/Gruppierung, falls Kunden zweistellige LLM-Prompt-Regel-Zahlen konfigurieren.

## Offene Fragen (für Bastian)

Keine harten Blocker. Ein Beobachtungspunkt: die Retry-Interpretation ("3 Versuche gesamt" statt "3 zusätzliche Retries") ist eine bewusste, aber nicht spec-eindeutige Wahl — siehe Abschnitt oben.
