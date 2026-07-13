# W1: Pressemitteilungs-Drafter (zweiter Handler, spiegelt W2)

**Datum:** 2026-07-13
**Status:** vorgeschlagen

**Kontext:** Issue #41 verlangt den zweiten Backend-Handler, W1 (Pressemitteilungs-Drafter). Er soll das W2-Baumuster (`docs/decisions/2026-07-12_w2-presseanfragen-drafter.md`) übernehmen UND das inzwischen gebaute Kundenprofil (`docs/decisions/2026-07-12_kundenprofil.md`, Issue #35/#37/#39) für sein kundenspezifisches Wissen nutzen: Tonalität, Boilerplate, Präzedenzfälle und Sprecher kommen aus dem Profil, nicht aus dem Input. Die Kundenprofil-Decision hat W1 bereits als nächsten Nutznießer der `KundenProfilRepository`-Methoden angekündigt, ohne die Anbindung selbst zu bauen (kein Handler-Code existierte da noch).

## Optionen und Entscheidungen

### 1. Paketstruktur

Wie bei W2 entschieden (`packages/handlers` als ein Paket, `src/w2/` als erster Unterordner): **Option 1b fortgeführt**, `packages/handlers/src/w1/` als paralleler Unterordner, gleiche Datei-Aufteilung wie W2 (`types.ts`, `kontext.ts`, `prompt.ts`, `draft.ts`, `schema.ts`, `handler.ts`, `index.ts`), plus zwei W1-spezifische Dateien ohne W2-Äquivalent: `kritiker.ts` (Stage 3, siehe unten) und `grenzen.ts` (deterministische Grenz-Prüfung, siehe unten). Kein `regel-engine/`-Unterordner — Begründung unter Punkt 3.

### 2. Profil-Anbindung: `w1KontextLaden` analog `w2KontextLaden`

Gleiche Grenzziehung wie bei W2: `packages/handlers/src/w1` kennt keine Datenbank, bekommt `W1Input` (inklusive `kunde_kontext`) und ein injizierbares `W1KontextQuellenProvider`-Interface übergeben. Die Datenbank-Anbindung lebt vollständig in `packages/persistence/src/kundenprofil.ts`.

Vier Wissens-Kategorien, vier unterschiedliche Lade-Pfade (nicht ein einziger `w1KontextLaden`-Rutsch, weil sie technisch unterschiedlich sind):

- **Tonalität** (`grundton`, `stil_parameter`, `anrede_konvention`, `gendering_konvention`): Kern-Felder aus `kunden_profil`, 1:1 zum Kunden, EAGER geladen — Teil von `W1KundeKontextInput.tonalitaet`, analog zu `thema_positionierung` bei W2 (kein RAG nötig, das Feld liegt bereits im `W1Input`, wenn `w1KontextLaden` fertig ist). Anders als bei `thema_positionierung` gibt es hier keine Statusfilterung (kein `feld_status`-Check) — Tonalität ist eine stilistische, keine faktische Aussage, ein Risiko-Ungleichgewicht zu Positionierungstexten oder Kennzahlen. `KundenProfilRepository.w1KontextLaden(kundeId)` liefert `{ kunde_slug, tonalitaet }`, analog `w2KontextLaden`.
- **Präzedenzfälle**: identisches Muster zu W2s `praezedenzenLaden` — `kunden_praezedenzfaelle` gefiltert auf `kunde_id`, `handler_slug = 'W1_pressemitteilung_drafter'`, `status = 'freigegeben'`. Über `W1KontextQuellenProvider.praezedenzenLaden`, injiziert.
- **Boilerplate**: NEU gegenüber W2 (W2 hatte keine Boilerplate-Quelle). `kunden_boilerplate` gefiltert auf `kunde_id`, `typ` (abgeleitet aus `briefing.laenge_ziel`, siehe unten), `sprache` (`'de'` fest in v1, siehe Punkt 6), `status != 'abgeleitet'` (freigegeben ODER vorläufig reicht — Boilerplate ist meist Fakten-nah/risikoarm, härtere Schwelle als bei Präzedenzfällen wäre hier unverhältnismäßig, aber ein rein KI-abgeleiteter, nie menschlich angeschauter Text soll trotzdem nicht 1:1 in eine echte Pressemitteilung kopiert werden). Bei mehreren Treffern: neuester `stand` zuerst. Über `W1KontextQuellenProvider.boilerplateLaden(kundeSlug, laenge, sprache): Promise<string | null>`.
- **Sprecher**: NEU gegenüber W2. `kunden_sprecher` gefiltert auf `kunde_id` und `name = briefing.zitat_sprecher`. Nur relevant, wenn `briefing.zitat_sprecher` gesetzt ist. Über `W1KontextQuellenProvider.sprecherLaden(kundeSlug, sprecherName): Promise<W1SprecherEintrag | null>`.

`KundenProfilRepository.w1KontextQuellenProviderErstellen(kundeId)` liefert `KundenProfilW1KontextQuellenProvider`, analog `KundenProfilW2KontextQuellenProvider`. `deterministischeGrenzenAlsPruefregeln(kundeId, handlerSlug)` ist bereits vollständig handler-agnostisch (nimmt `handlerSlug` als Parameter) und wird UNVERÄNDERT für W1 wiederverwendet (`handlerSlug = 'W1_pressemitteilung_drafter'`).

Keine neue Migration nötig: alle vier Tabellen (`kunden_profil`, `kunden_boilerplate`, `kunden_sprecher`, `kunden_praezedenzfaelle`) existieren bereits aus Issue #35, inklusive der für W1 passenden Spalten.

### 3. Warum Kritiker-Pass statt konfigurierbarer Regel-Engine (bewusster Unterschied zu W2)

W2 hat eine kundenkonfigurierbare Regel-Engine (`pruefregeln`-Tabelle, Code-Bausteine + LLM-Prompt-Regeln, Retry-Schleife bis zu 3 Versuchen), weil ein Comms-Plan aus benannten, wiederholbaren Struktur-Anforderungen besteht (Quellenangabe vorhanden? Tier-Einstufung im Klartext? echte Entscheidungsfrage?) — genau der Fall, für den eine Checkliste taugt.

Eine Pressemitteilung ist ein anderes Problem: `WORKFLOW_HANDLERS_v1.0.md` beschreibt Stage 3 als offene redaktionelle Kritik ("ist die Headline nichtssagend, ist die Nachricht wirklich neu, wirkt das Zitat authentisch oder gestellt") — Fragen, die kein Kunde sinnvoll als Checkbox-Liste konfigurieren würde, weil die Antwort vom konkreten Text abhängt, nicht von einer wiederholbaren Regel. Eine Regel-Engine mit editierbaren `llm_prompt`-Zeilen für "ist das Zitat authentisch" wäre Konfigurierbarkeit ohne echten Nutzen (kein Kunde würde diese Prompt-Zeile sinnvoll anders formulieren als ein anderer). Deshalb: **ein einziger, fest formulierter Kritiker-Pass** (Opus-Klasse, Rolle "kritischer Wirtschaftsredakteur"), keine `pruefregeln`-Tabelle für W1, kein Retry-Loop.

**Kein Retry-Loop, bewusst anders als W2:** W2 korrigiert den Draft automatisch anhand der Regel-Verstöße und versucht es erneut (bis zu 3 Versuche). W1 tut das NICHT — der Kritiker-Pass liefert `kritiker_findings` zur Information, aber der Draft wird nicht automatisch überarbeitet ("KEINE automatische Überarbeitung: der Kritiker findet und meldet, der Mensch entscheidet", wörtlich aus dem Auftrag). Ein Finding mit `schweregrad = "hoch"` setzt `ueberarbeitungsbeduerftig = true`, ändert aber nichts am Draft-Text selbst. `fuehreW1Aus` ist deshalb strukturell einfacher als `fuehreW2Aus`: Drafter-Pass einmal, Kritiker-Pass einmal, deterministische Prüfung einmal, fertig — keine Schleife.

**Die deterministischen Grenzen gelten trotzdem:** unabhängig von dieser Entscheidung bleiben `verbotene_aussage`/`pflichtbaustein` aus `kunden_grenzen` (`ist_deterministisch_erzwungen = true`) hart durchgesetzt, code-basiert, nicht LLM-Ermessen — das ist keine Regel-Engine-Konfiguration durch den Kunden über eine `pruefregeln`-Tabelle, sondern derselbe bereits bestehende Kundenprofil-Mechanismus aus der Kundenprofil-Decision, hier nur für W1 wiederverwendet (`packages/handlers/src/w1/grenzen.ts`, siehe Punkt 4).

### 4. Deterministische Grenz-Prüfung: eigene, kleine Implementierung statt Wiederverwendung der W2-Bausteine

`packages/handlers/src/w2/regel-engine/bausteine.ts` hat bereits zwei generische Bausteine (`kundengrenze_verbotene_aussage`, `kundengrenze_pflichtbaustein`), aber ihre Signatur (`BausteinFn`) ist auf `CommsPlanDraft` und `BausteinKontext` (`sprachregelungVorhanden`, `fristAt`) zugeschnitten — beides W2-spezifisch, ohne Pressemitteilungs-Äquivalent. Statt die W2-Bausteine zu verallgemeinern (vorzeitige Abstraktion für zwei Nutzer), bekommt W1 eine eigene, kleine Prüf-Funktion in `packages/handlers/src/w1/grenzen.ts`:

```typescript
function pruefeDeterministischeGrenzen(
  pressemitteilung: PressemitteilungDraft,
  grenzen: Pruefregel[],
): PruefungsErgebnis
```

Wiederverwendet werden nur die reinen Werte-Typen `Pruefregel`, `PruefungsErgebnis`, `RegelVerstoss` (aus `w2/regel-engine/types.ts`, bereits handler-agnostisch — `Pruefregel.handler_slug` ist ein freier String, kein W2-Enum) und `RegelVerstossSchema` (aus `w2/schema.ts`, ein reines Zod-Bauteil ohne Geschäftslogik). Die Prüf-Logik selbst (String-Suche über alle Pressemitteilungs-Textfelder) ist neu, ca. 15 Zeilen, kein Grund für eine gemeinsame Abstraktion mit W2.

**Ein fehlender Pflichtbaustein wird nur MARKIERT, nicht automatisch eingefügt** ("Draft ergänzt ihn bzw. markiert das Fehlen" aus dem Auftrag — diese Decision wählt explizit die zweite Option). Begründung: ein automatisch eingefügter Pflichttext (z. B. Pharma-Pflichttext, Finanz-Disclaimer) an einer vom Code gewählten Stelle im Fließtext ist eine redaktionelle Entscheidung (wohin, wie eingebettet), die derselben "Mensch entscheidet"-Logik unterliegt wie die Kritiker-Findings — ein still eingefügter Text birgt zudem das Risiko, unbemerkt falsch platziert zu werden. Der fehlende Baustein erscheint als `RegelVerstoss` in `grenz_pruefung_ergebnis.verstoesse` und setzt `ueberarbeitungsbeduerftig = true`, die Beraterin ergänzt ihn manuell.

### 5. Zitat-Freigabe: technische Durchsetzung (neuer Mechanismus, kein W2-Äquivalent)

Der Auftrag verlangt explizit "Sprecher ... für Zitat-Attribution, korrekte Schreibweise, `zitat_freigabe` prüfen". Analog zur Sprach-Regel-Durchsetzung bei W2 (zweistufig: Prompt-Ebene + Code-Ebene) wird das hier zweistufig durchgesetzt:

1. **Prompt-Ebene:** der Drafter-Prompt bekommt den Sprecher nur als Kalibrierungs-/Attributionsdaten, wenn `kontext.sprecher.verfuegbar = true` (das heißt: Sprecher im Profil gefunden UND `zitat_freigabe = true`), inklusive `exakte_schreibweise` für den Namen im Zitat.
2. **Code-Ebene (Sicherheitsnetz):** nach Stage 2 prüft `erzwingeZitatFreigabe()` den generierten Draft: ist `zitat !== null`, aber der Sprecher im Kundenprofil nicht gefunden oder `zitat_freigabe = false`, wird `zitat` deterministisch auf `null` gesetzt (nicht dem LLM überlassen) und ein Hinweis "Zitat entfernt: Sprecher-Freigabe fehlt oder Sprecher nicht im Kundenprofil gefunden." landet in `hinweise`. Diese Korrektur läuft VOR dem Kritiker-Pass, damit der Kritiker den tatsächlich ausgelieferten Text bewertet, nicht ein Zwischenergebnis.

Begründung für die Code-Ebene: ein einer realen Person zugeschriebenes Zitat ohne bestätigte Freigabe ist eine Aussage, die AGENTS.md §4 ("Keine Fake-Antworten ohne Menschen-Abzweig bei sensitiven Vorgängen") nahekommt — ein Prompt-Hinweis allein reicht nicht, ein LLM kann trotzdem ein Zitat erzeugen, wenn `zitat_kernaussage` gesetzt ist, unabhängig von der Freigabe.

### 6. v1-Stubs (RAG-Quellen aus der Spec, die noch nicht angebunden sind)

Die Spec (`WORKFLOW_HANDLERS_v1.0.md` §W1, Stage 1) nennt vier RAG-Quellen: Kunden-SSOT, Sektor-Corpus, Client-Final-Präzedenzen, Diskurs-Snapshot (Websearch). v1-Umsetzung, analog zum `KontextQuelle<T>`-Wrapper-Muster aus W2:

- **Präzedenzen** (= "Client-Final-Präzedenzen" der Spec): ECHT angebunden, siehe Punkt 2.
- **Boilerplate/Tonalität** (Teil des "Kunden-SSOT" der Spec): ECHT angebunden, siehe Punkt 2. Der Rest von "Kunden-SSOT" (frühere freigegebene Pressemitteilungen als eigene Kategorie neben den Präzedenzfällen) hat in `kunden_praezedenzfaelle` bereits sein Zuhause — es gibt in diesem Schema keinen separaten SSOT-Datenbestand neben den Präzedenzfällen, anders als bei W2, wo `ssot` (frühere Comms-Plans) und `praezedenzen` (Client-Final-Texte) unterschiedliche, beide fehlende v1-Stubs waren. Für W1 fallen beide Konzepte in der bestehenden Kundenprofil-Tabellenstruktur zusammen.
- **Sektor-Corpus**: reiner v1-Stub, `{ verfuegbar: false, daten: null }`. Kein branchenweiter, geteilter Datenbestand vorhanden (der Auftrag nennt "öffentlich zugänglich" — kein Scraping/Corpus-Aufbau ist Teil dieses Auftrags).
- **Diskurs-Snapshot**: reiner v1-Stub, `{ verfuegbar: false, daten: null }`. Websearch ist laut Auftrag "noch nicht angebunden".

Kein Fehler-Pfad für Stubs, gleiches Fallback-Hinweis-Muster wie W2.

**Sprache:** `boilerplateLaden` bekommt in v1 immer `sprache = 'de'` fest übergeben (kein Feld in `W1Input`, das eine andere Sprache anfordern könnte — "keine Multi-Sprache in v1" steht explizit in der Spec unter "v1-Umfang"). Wird in v1.2 durch ein echtes Sprachfeld im Briefing ersetzt.

**Länge → Boilerplate-Typ:** `kunden_boilerplate.typ` kennt nur `'kurz'`/`'lang'` (zwei Varianten), `briefing.laenge_ziel` kennt drei Stufen (`'kurz'`/`'standard'`/`'lang'`). Mapping: `'kurz' → 'kurz'`, `'standard'` und `'lang' → 'lang'` — eine dritte Boilerplate-Variante extra für "standard" anzulegen wäre eine DB-Änderung ohne Auftrag dazu; die lange Boilerplate-Variante passt inhaltlich besser zu einer Standard- oder langen Pressemitteilung als die kurze.

### 7. Struktur-Vermerk für späteres Inline-Editing/Export

Der Auftrag verlangt, `pressemitteilung` jetzt schon in getrennte Felder/Absatz-Arrays zu zerlegen (nicht ein Fließtext-Block), damit später Inline-Editing einzelner Segmente und Export in diverse Formate andocken können, auch wenn das UI dafür noch nicht gebaut wird. Diese Decision setzt das um: `PressemitteilungSchema` hat bereits jetzt `ausfuehrung_absaetze: string[]` (ein Array-Eintrag pro Absatz, kein zusammenhängender String) statt eines einzelnen `ausfuehrung: string`-Feldes, und `zitat` ist ein eigenes strukturiertes Objekt (`text`/`sprecher_name`/`sprecher_rolle`) statt in den Fließtext eingebettet. Jedes Feld ist einzeln adressierbar (z. B. für ein künftiges `PATCH /pressemitteilung/{feld}`-Editier-Endpoint), ohne dass diese Decision einen solchen Endpoint baut oder vorwegnimmt.

### 8. Output-Kontrakt-Erweiterungen (analog W2s `pruefung`/`hinweise`)

`WORKFLOW_HANDLERS_v1.0.md`s `W1Output` benennt `kritiker_findings` und `audit_metadaten`, aber keinen Ort für: (a) das Ergebnis der deterministischen Grenz-Prüfung, (b) eine kompakte "muss überarbeitet werden"-Flagge, (c) Fallback-Hinweise aus Stage 1/Zitat-Erzwingung/Kritiker-Ausfall. Diese Decision ergänzt, analog zur W2-Erweiterung:

- `grenz_pruefung_ergebnis: { bestanden: boolean; verstoesse: RegelVerstoss[] }`
- `ueberarbeitungsbeduerftig: boolean` — `true`, wenn mindestens ein `kritiker_findings`-Eintrag `schweregrad = "hoch"` hat ODER `grenz_pruefung_ergebnis.bestanden = false` ist.
- `hinweise: string[]` — Stage-1-Fallbacks (keine Präzedenzen/Boilerplate), Zitat-Erzwingungs-Hinweis, Kritiker-Ausfall-Vermerk ("Kritiker-Prüfung nicht möglich: ...").

`audit_metadaten.dauer_ms` (in der Spec bereits vorgesehen, W2 hatte das Feld nicht) wird über `Date.now()`-Differenz vom Start bis zum Ende von `fuehreW1Aus` gemessen — normaler Anwendungscode, keine Restriktion wie in Workflow-Skripten.

### 9. Fehler-/Fallback-Semantik

- **Drafter-Pass schlägt fehl** (LLM-Fehler, ungültiges JSON, Zod-Fehler): Gesamtlauf `fehlgeschlagen`, wie bei W2 — ohne einen validen Draft gibt es nichts Sinnvolles zurückzugeben.
- **Kritiker-Pass schlägt fehl** (Timeout o. ä.): Gesamtlauf läuft weiter, `kritiker_findings = []`, Hinweis "Kritiker-Prüfung nicht möglich: ..." in `hinweise` — wörtlich der Spec-Fallback. `ueberarbeitungsbeduerftig` hängt in diesem Fall nur noch von der deterministischen Grenz-Prüfung ab.
- **Keine Präzedenzen/Boilerplate im Profil:** kein Fehler, Hinweis in `hinweise`, Drafter-Prompt bekommt einen entsprechenden Hinweis, damit der Draft erkennbar generischer ausfällt (wörtlich Spec-Fallback: "Kunden-Präzedenzen fehlen, Draft wird generischer, Empfehlung: Kunden-SSOT aufsetzen").
- **Rate-Limit:** bereits strukturell abgedeckt — `AnthropicProvider.strukturierteCompletion` läuft immer über `callLLMWithRetry` (AGENTS.md §7.4), unabhängig vom aufrufenden Handler. Kein zusätzlicher Code in `packages/handlers/src/w1` nötig.

### 10. Token-Erfassung

Wie bei W2: `fuehreW1Aus` gibt `llmAufrufe: W1LlmAufruf[]` zurück, ein Eintrag pro tatsächlichem LLM-Call (`zweck: 'draft' | 'kritiker'`), auch wenn der Gesamtlauf scheitert oder der Kritiker-Pass fehlschlägt (der Call wurde bereits abgerechnet). `packages/persistence/src/w1-orchestrierung.ts` (neu, analog `w2-orchestrierung.ts`) schreibt für jeden Eintrag eine eigene `llm_nutzung`-Zeile mit `handler_slug = "W1_pressemitteilung_drafter"`.

### 11. Shadow-Mode

Wie bei W2: `benoetigt_menschliche_freigabe` ist `z.literal(true)` im Zod-Schema, `packages/handlers/src/w1` ruft ausschließlich `LLMProvider.strukturierteCompletion()` auf, kein Versand-/Trigger-Code-Pfad. `packages/persistence/src/w1-orchestrierung.ts` lädt Kontext, ruft den Handler auf und schreibt `llm_nutzung` — keine zusätzliche Aktion.

## Konsequenzen

- `packages/handlers/src/w2` bleibt unverändert (keine gemeinsame Abstraktion mit W1 erzwungen, siehe Punkt 4) — kein Risiko für bestehende W2-Tests.
- `packages/persistence/src/kundenprofil.ts` bekommt zwei neue Interface-Methoden (`w1KontextLaden`, `w1KontextQuellenProviderErstellen`) plus eine neue Provider-Klasse (`KundenProfilW1KontextQuellenProvider`) — sowohl `SupabaseKundenProfilRepository` als auch `FakeKundenProfilRepository` werden erweitert, keine bestehende Methode ändert ihre Signatur.
- Keine neue Migration, keine RLS-Änderung — alle gelesenen Tabellen und Policies existieren bereits aus Issue #35.
- W1 hat KEINE `pruefregeln`-Tabellen-Nutzung (bewusst, siehe Punkt 3) — ein neu angelegter Kunde braucht für W1 kein Default-Template wie bei W2 (`W2_DEFAULT_PRUEFREGELN`). Nur `kunden_grenzen` mit `ist_deterministisch_erzwungen = true` wirkt.
- W3 (nächster Referenz-Konsument) muss selbst entscheiden, ob es dem W2-Muster (Regel-Engine) oder dem W1-Muster (Kritiker-Pass ohne Retry) näher steht — diese Decision zeigt, dass "spiegelt W2" nicht "kopiert die Regel-Engine" bedeuten muss.

## Offene Fragen (für Bastian)

@thehartworker Entscheidung nötig: zwei Annahmen, die diese Decision bewusst trifft, aber die du bestätigen oder korrigieren solltest:

1. **Boilerplate-Statusschwelle (`!= 'abgeleitet'` statt `== 'freigegeben'`):** anders als bei Präzedenzfällen (nur `freigegeben`) lässt diese Decision auch `vorlaeufig`-Boilerplate in den Draft einfließen, weil Boilerplate meist risikoarmer Fakten-Text ist. Ist das die gewünschte Schwelle, oder soll Boilerplate genauso streng wie Präzedenzfälle nur bei `freigegeben` verwendet werden?
2. **Pflichtbaustein wird nur markiert, nie automatisch eingefügt** (Punkt 4): das ist die konservativere der beiden im Auftrag genannten Optionen. Falls ein automatisches Anhängen des Pflichtbausteins (z. B. immer ans Ende der Pressemitteilung) gewünscht ist, wäre das eine kleine Folge-Änderung in `grenzen.ts` bzw. `handler.ts` — aktuell bewusst nicht gebaut, um keine redaktionelle Platzierungsentscheidung im Code zu verstecken.
