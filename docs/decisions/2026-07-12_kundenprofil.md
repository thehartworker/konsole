# Kundenprofil-Fundament: Datenmodell, Pflege, Handler-Anbindung

**Datum:** 2026-07-12
**Status:** vorgeschlagen

**Kontext:** Issue #35 verlangt den zentralen Wissenskern des Produkts: das Kundenprofil. Aus ihm sollen ALLE Handler (W1, W2, später W3-W6) ihr kundenspezifisches Wissen schöpfen, statt es (wie aktuell bei W2, siehe `packages/handlers/src/w2/types.ts`, `W2KundeKontextInput`) per Input mitgegeben zu bekommen. Dieser Auftrag deckt Ebene 1 (Datenmodell) und Ebene 2 (Pflege, Lesen, Handler-Anbindung) ab. Ebene 3 (KI-Befüllung) und Ebene 4 (Konsolen-UI) sind explizit NICHT Teil dieser Decision, siehe "Kommt in Folge-Aufträgen" unten.

Die Architektur-Prinzipien sind im Auftrag selbst als "verbindlich, aus einem Experten-Panel abgeleitet" vorgegeben (Status pro Element, gestuft befüllbar). Diese Decision übersetzt sie in ein konkretes Schema und einen konkreten Lese-/Schreib-Pfad, aufbauend auf `docs/decisions/2026-07-10_datenmodell.md` (Options-3-Muster: `agentur_id` denormalisiert auf jeder mandanten-relevanten Tabelle) und `docs/decisions/2026-07-10_rls-policies.md` (RLS direkt auf Basistabellen, `SECURITY DEFINER`-Helfer).

## Fünf Schichten und ihre Tabellen

Drei inhaltliche Säulen (Fakten, Stimme/Tonalität, Strategie) plus eine Referenz-/Betriebs-Schicht, aufgeteilt in eine Kern-Tabelle (1:1 zum Kunden) und neun Listen-Tabellen (1:n, jede Zeile mit eigenem Status):

```
kunden_profil                -- Kern: Fakten + Stimme/Tonalität + Strategie + Betrieb, 1:1 zu kunden
kunden_boilerplate           -- Liste: Boilerplate-Varianten (kurz/lang, pro Sprache)
kunden_kennzahlen            -- Liste: nennbare Kennzahlen (Stichtag + Quelle PFLICHT)
kunden_sprecher               -- Liste: Sprecher-Register
kunden_kernbotschaften        -- Liste: 3-5 Kernbotschaften
kunden_themen                  -- Liste: Themenlandkarte (deckt Sprachregelungen für W2 ab)
kunden_grenzen                  -- Liste: das Ungesagte (inkl. deterministisch erzwingbare Grenzen)
kunden_freigabekette             -- Liste: Freigabe-Reihenfolge
kunden_praezedenzfaelle            -- Liste: Referenz-Ausgaben (größter Qualitätshebel)
kunden_medien_kontext                -- Liste: Medien-/Journalisten-Kontext (aus W2)
```

`kunden.autonomie_level` existiert bereits (`docs/decisions/2026-07-10_datenmodell.md`) und wird NICHT dupliziert. `aktive_handler` (Betrieb) liegt auf `kunden_profil`, weil es 1:1 zum Kunden ist, keine eigene Liste braucht und mit den übrigen Betriebs-Feldern zusammen geladen wird. Verknüpfung zu `pruefregeln` (bereits vorhanden, `supabase/migrations/20260712100000_pruefregeln.sql`) läuft weiterhin über `kunde_id`, keine neue FK nötig.

Alle zehn Tabellen tragen `agentur_id` denormalisiert (Options-3-Muster) mit demselben `BEFORE INSERT`-Trigger-Pattern wie `pruefregeln`/`llm_nutzung` (`agentur_id` wird aus `kunden` via `kunde_id` übernommen, überschreibt jeden vom Aufrufer mitgeschickten Wert).

## Status-Modell (Quer-Prinzip 1)

**Entscheidung:** zwei verschiedene technische Umsetzungen für zwei verschiedene Tabellen-Formen, nicht eine einzige einheitliche Lösung:

1. **`kunden_profil` (Kern-Tabelle, viele Skalar-Felder in einer Zeile):** ein einziges `feld_status jsonb NOT NULL DEFAULT '{}'`, das pro Feldname ein Objekt `{ status, stand, quelle }` hält, z. B. `{"grundton": {"status": "abgeleitet", "stand": "2026-07-01", "quelle": "website-scraping"}}`. Begründung: elf einzelne `<feld>_status`/`<feld>_stand`/`<feld>_quelle`-Spalten-Tripel wären 33 zusätzliche Spalten für ein Element, das laut Auftrag "gestuft befüllbar" bleiben soll — das jsonb-Muster ist im Auftrag selbst als Option genannt ("ein status-jsonb, das pro Feldname den Status hält") und skaliert ohne Migration, wenn später weitere Kern-Felder dazukommen (z. B. in Ebene 3). Nachteil: kein DB-CHECK, der ein `feld_status`-Objekt zwingend zu jedem befüllten Feld erzwingt — das übernimmt die Repository-Schicht (`KundenProfilRepository`, siehe unten), nicht die Datenbank. Für ein internes Pflege-Tool (kein Endnutzer-Freiform-Input in Ebene 2) ist das ein akzeptabler Kompromiss.
2. **Listen-Tabellen (jede Zeile ein eigenständiges Element):** eine echte Spalte `status kunden_profil_element_status NOT NULL DEFAULT 'abgeleitet'` pro Zeile, plus wo im Auftrag verlangt zusätzliche `stand`/`quelle`-Spalten (`kunden_boilerplate.stand`, `kunden_kennzahlen.stichtag`/`quelle`, `kunden_praezedenzfaelle.freigegeben_am`). Begründung: hier gibt es kein "viele Skalar-Felder in einer Zeile"-Problem, eine normale Spalte ist einfacher zu indizieren (`WHERE status = 'freigegeben'`) und zu einer echten Status-Übergangs-Query zu machen (`UPDATE ... SET status = 'freigegeben' WHERE id = $1`), ohne jsonb-Pfad-Updates.

`kunden_profil_element_status` ist der Enum-Typ `'freigegeben' | 'vorlaeufig' | 'abgeleitet'`, wörtlich aus dem Auftrag übernommen, für beide Formen (jsonb-Werte-Domäne und Listen-Spalte) identisch verwendet.

**Default:** `abgeleitet` überall. Ein neu angelegtes Element ohne expliziten Status ist konservativ als "noch nicht menschlich bestätigt" zu behandeln, nie als stillschweigend freigegeben — das ist die sichere Ausfallrichtung, konsistent mit dem RLS-Prinzip "keine Policy = kein Zugriff" aus `2026-07-10_rls-policies.md`.

**Warnhinweis für die Beraterin:** liegt NICHT in der Datenbank (kein Trigger, der Warnungen generiert), sondern ist Sache der Lese-Funktion (`KundenProfilRepository`, unten) bzw. später der Konsolen-UI (Ebene 4). Begründung: eine Warnung ist Präsentationslogik ("zeig der Beraterin einen Hinweis"), keine Datenintegritäts-Regel — sie in der DB zu erzwingen würde eine View- oder Trigger-Schicht nur für UI-Zwecke einführen, die die RLS-Decision (Option 2 gegen Option 3, "eine View verdoppelt die Wartungsfläche ohne Sicherheitsgewinn") bereits gegen unnötige Zusatzschichten entschieden hat.

## Gestuft befüllbar und Fallbacks (Quer-Prinzip 2)

- Fast alle Inhaltsfelder in `kunden_profil` sind `NULL`-fähig. Einzige NOT-NULL-Felder: `id`, `kunde_id`, `agentur_id`, `feld_status`, `aktive_handler`, `created_at`, `updated_at` (technisches Gerüst, kein Inhalt).
- Für Listen-Tabellen gilt: eine leere Liste (keine Zeilen für einen `kunde_id`) ist ein gültiger Zustand, kein Fehler. Das Schema erzwingt kein Pflicht-Minimum auf DB-Ebene (kein `CHECK`, der z. B. "mindestens 3 Kernbotschaften" verlangt) — das wäre eine Produkt-Entscheidung (welches Minimum reicht für brauchbaren Output), keine Datenintegritäts-Regel, und unterschiedliche Handler (W1 vs. W2 vs. später W3-W6) werden unterschiedliche Minima brauchen.
- **Ausnahme, bewusst hart:** `kunden_kennzahlen.stichtag` und `kunden_kennzahlen.quelle` sind `NOT NULL`. Der Auftrag verlangt das explizit ("MUESSEN Stichtag und Quelle haben, kein Raten") — das ist eine Datenintegritäts-Regel (eine Kennzahl ohne Stichtag ist keine unvollständige Kennzahl, sondern eine potenziell falsche Behauptung), deshalb DB-Constraint statt Anwendungs-Disziplin, konsistent mit `AGENTS.md` §4 ("Keine Fake-Antworten").
- Fallbacks sind Handler-seitige Aufgabe, nicht DB-Aufgabe. W2 hat das Muster bereits (`packages/handlers/src/w2/kontext.ts`, `sammleKontext`): jede der fünf RAG-Quellen liefert `{ verfuegbar: boolean, daten: T | null }` plus einen `hinweise`-Eintrag bei leerer Quelle ("Keine Client-Final-Präzedenzen hinterlegt, Draft wird generischer. Onboarding empfohlen."). Die Kundenprofil-Anbindung (unten) speist genau in dieses bestehende Muster ein, ändert es nicht.

## KundenProfilRepository (packages/persistence)

Analog zu `PruefregelnRepository` (`packages/persistence/src/pruefregeln.ts`): ein Interface plus eine `Supabase*`-Implementierung (Service-Role, RLS-Bypass für Schreibzugriffe) plus eine `Fake*`-Implementierung für Tests.

```typescript
interface KundenProfilRepository {
  profilLaden(kundeId: string): Promise<KundenProfil | null>;
  feldStatusSetzen(kundeId: string, feldname: string, status: KundenProfilElementStatus): Promise<void>;
  elementStatusSetzen(tabelle: KundenProfilListenTabelle, id: string, status: KundenProfilElementStatus): Promise<void>;
  w2KontextLaden(kundeId: string): Promise<W2KundeKontextInput>;
  w2KontextQuellenProviderErstellen(kundeId: string): W2KontextQuellenProvider;
  deterministischeGrenzenAlsPruefregeln(kundeId: string, handlerSlug: string): Promise<Pruefregel[]>;
}
```

`profilLaden` lädt Kern plus alle neun Listen in einem Aufruf (mehrere `SELECT`s gegen den Service-Role-Client, kein Multi-Statement-Join — gleiches Muster wie `KlassifikationsRepository`: "jede Methode entspricht genau einer SQL-Anweisung"). `feldStatusSetzen`/`elementStatusSetzen` sind die beiden Status-Übergangs-Pfade aus Quer-Prinzip 1 (z. B. "abgeleitet" -> "freigegeben" bei menschlicher Bestätigung durch die Beraterin, Ebene 4 später).

## Handler-Anbindung: W2-Umstellung

**Wichtige Erkenntnis beim Durcharbeiten des bestehenden Codes:** `packages/handlers/src/w2` hat die Grenze zwischen Handler-Logik und Datenbank bereits sauber gezogen, BEVOR dieser Auftrag existierte (`W2KontextQuellenProvider`-Interface in `types.ts`, injiziert in `kontext.ts`/`sammleKontext`). Der Handler selbst muss deshalb **nicht geändert werden** — kein einziges File unter `packages/handlers/src/w2/` außer `regel-engine/bausteine.ts` (siehe unten, für deterministische Grenzen) wird angefasst. Das ist genau das im Auftrag verlangte Muster ("Der Handler-Code selbst bleibt LLM-fokussiert; das Laden passiert in der persistence-Orchestrierung"), es war nur noch nicht bis zur Persistenz-Schicht durchgezogen:

- **Vorher:** der AUFRUFER von `fuehreW2AusUndProtokolliere` (`packages/persistence/src/w2-orchestrierung.ts`) musste den vollständigen `W2Input` inklusive `kunde_kontext` (`kunde_slug`, `sprachregelungen_slug`, `thema_positionierung`) selbst zusammenbauen und mitgeben.
- **Nachher:** `FuehreW2AusEingabe` nimmt nur noch `anfrage: W2AnfrageInput` entgegen (die Anfrage-spezifischen Daten, die es keine DB-Quelle geben kann) plus `kundenProfilRepo: KundenProfilRepository`. `fuehreW2AusUndProtokolliere` lädt `kunde_kontext` selbst über `kundenProfilRepo.w2KontextLaden(kundeId)` und baut den vollständigen `W2Input` intern zusammen, bevor `fuehreW2Aus` (unverändert) aufgerufen wird. Ebenso wird der bisher optionale `kontextProvider`-Parameter jetzt standardmäßig aus `kundenProfilRepo.w2KontextQuellenProviderErstellen(kundeId)` bezogen (weiterhin überschreibbar für Tests).

`w2KontextLaden` bildet ab:
- `kunde_slug` <- `kunden.slug`
- `sprachregelungen_slug` <- weiterhin `kunden.slug` (das Feld wird als reiner Gruppierungs-Schlüssel an `W2KontextQuellenProvider.sprachregelungenLaden` durchgereicht; mit dem Kundenprofil-Modell gibt es keine separate "Sprachregelungs-Gruppe" mehr, jede Zeile in `kunden_themen` gehört direkt zu genau einem `kunde_id` — das Feld bleibt im `W2Input`-Typ bestehen, um `packages/handlers` nicht anzufassen, wird aber von der neuen `KundenProfilW2KontextQuellenProvider`-Implementierung nicht mehr inhaltlich ausgewertet, sondern nur zur Konsistenz durchgereicht)
- `thema_positionierung` <- `kunden_profil.positionierung`, aber NUR wenn `feld_status.positionierung.status` nicht `'abgeleitet'` ist. Ein nur-abgeleiteter, noch nicht menschlich bestätigter Positionierungstext wird NICHT automatisch in einen Presseanfragen-Draft eingespeist (das wäre ein KI-Vorschlag, der ungeprüft in einen echten Kunden-Output einfließt) — stattdessen `null` plus ein `hinweise`-Eintrag über den bestehenden `kontext.ts`-Mechanismus.

`KundenProfilW2KontextQuellenProvider implements W2KontextQuellenProvider`:
- `sprachregelungenLaden` liest `kunden_themen` gefiltert auf `kunde_id` (Konstruktor-Parameter) und liefert Zeilen mit befülltem `sprachregelung`, gemappt auf `SprachregelungsEintrag { thema, position_text }`.
- `praezedenzenLaden` liest `kunden_praezedenzfaelle` gefiltert auf `kunde_id` UND `handler_slug = 'W2_presseanfragen_drafter'` UND **`status = 'freigegeben'`** (nicht `vorlaeufig`/`abgeleitet`) — nur menschlich bestätigte frühere Ausgaben dürfen als Kalibrierungs-Referenz in einen neuen Draft einfließen, konsistent mit Quer-Prinzip 1 ("ein Handler MUSS dem Element ansehen können, wie sehr er darauf bauen darf"). Ein nur-abgeleiteter Präzedenzfall wird wie ein fehlender behandelt (leeres Array, bestehender Fallback-Hinweis aus `kontext.ts` greift unverändert).

## Deterministisch erzwungene Grenzen (`kunden_grenzen`)

Der Panel-Punkt ("verbotene Aussagen und Pflichtbausteine müssen deterministisch erzwingbar sein, nicht LLM-Ermessen") lässt sich eins-zu-eins auf den bereits bestehenden `code_baustein`-Mechanismus der W2-Regel-Engine abbilden (`packages/handlers/src/w2/regel-engine/bausteine.ts`, `BAUSTEIN_REGISTRY`), statt einen zweiten, parallelen Enforcement-Pfad zu bauen:

- Zwei neue, generische Bausteine: `kundengrenze_verbotene_aussage` (Parameter `{ phrase: string }`, schlägt fehl, wenn `phrase` case-insensitiv irgendwo im Draft-Text vorkommt) und `kundengrenze_pflichtbaustein` (Parameter `{ text: string }`, schlägt fehl, wenn `text` NICHT vorkommt). Beide sind reine String-Prüfungen ohne LLM-Aufruf, exakt wie die bestehenden Bausteine (`keine_tier_nennung` etc.).
- `KundenProfilRepository.deterministischeGrenzenAlsPruefregeln(kundeId, handlerSlug)` liest `kunden_grenzen` gefiltert auf `kunde_id`, `typ IN ('verbotene_aussage', 'pflichtbaustein')` und `ist_deterministisch_erzwungen = true`, und übersetzt jede Zeile in ein synthetisches `Pruefregel`-Objekt (`typ: 'code_baustein'`, `baustein_name: 'kundengrenze_verbotene_aussage'` bzw. `'kundengrenze_pflichtbaustein'`, `parameter: { phrase: inhalt }` bzw. `{ text: inhalt }`). Diese Zeilen existieren NICHT in der `pruefregeln`-Tabelle (keine zusätzliche Schreib-Synchronisation zwischen `kunden_grenzen` und `pruefregeln` nötig), sondern werden zur Laufzeit in `w2-orchestrierung.ts` mit den geladenen `pruefregeln`-Zeilen zusammengeführt (`[...pruefregeln, ...deterministischeGrenzen]`), bevor `fuehreW2Aus` aufgerufen wird.
- Effekt: eine `kunden_grenzen`-Zeile mit `ist_deterministisch_erzwungen = true` greift unabhängig vom Review-LLM (die Regel-Engine prüft `code_baustein`-Regeln immer per String-Match, nie per LLM-Ermessen, siehe `pruefung.ts`) und unabhängig vom Status des Elements (eine Sicherheits-/Compliance-Grenze wird nicht dadurch schwächer, dass sie z. B. noch `vorlaeufig` ist — anders als bei Präzedenzfällen/Positionierung, wo der Status die Verlässlichkeit für RAG-Zwecke steuert, steuert er hier NICHT, ob die Grenze durchgesetzt wird. Das ist eine bewusste Abweichung vom sonstigen "Status filtert Verwendung"-Muster: eine noch nicht freigegebene, aber bereits als deterministisch markierte Grenze soll lieber zu viel als zu wenig blockieren).
- `ist_deterministisch_erzwungen = false`-Zeilen (weichere Grenzen, z. B. "Thema eher vermeiden") fließen NICHT in die Regel-Engine ein — sie sind reine Beraterinnen-Information (Ebene 4, Konsolen-UI, Folge-Auftrag).

## Kommt in Folge-Aufträgen (bewusst NICHT Teil dieser Decision)

- **Ebene 3, KI-Befüllung:** Dokument-Upload und Website-Scraping mit KI-Auswertung, Ergebnis grundsätzlich mit `status = 'abgeleitet'` gespeichert (nie direkt `freigegeben`). Braucht eigene Entscheidungen zu Datei-Storage (Supabase Storage, DSGVO-Löschfristen analog `AGENTS.md` §8.3), Scraping-Rechtslage pro Zielseite, und welches LLM/welchen Prompt die Extraktion übernimmt.
- **Ebene 4, Konsolen-UI:** Profil-Editor für die Beraterin (Status-Übergänge auslösen, Listen-Elemente pflegen, Warnhinweise bei rein abgeleiteten Daten anzeigen). Braucht eigene UI/UX-Entscheidungen (Next.js-Routen, Formulare, Optimistic-Update-Verhalten) und hängt von den in dieser Decision festgelegten Repository-Methoden ab, ohne dass diese Decision die UI vorwegnimmt.
- **W1-Anbindung:** der Auftrag nennt W1 explizit als nächsten Nutznießer (Tonalität, Boilerplate). Diese Decision legt die Tabellen so an, dass W1 dieselben Repository-Methoden (`profilLaden`, ggf. eine analoge `w1KontextLaden`-Methode) nutzen kann, baut die W1-Anbindung selbst aber nicht, weil W1 laut `BUILD_PLAN_v0.1.md` noch nicht gebaut ist (kein Handler-Code zum Andocken vorhanden).

## Abweichungen von der wörtlichen Auftragsbeschreibung

- **`grundton` als Postgres-Enum statt Text:** der Auftrag nennt "sachlich/warm-handwerklich/technisch-praezise/aktivistisch als Start-Enum, aber erweiterbar". Diese Decision modelliert das als echten Postgres-`ENUM`-Typ (`kunden_profil_grundton`), analog zu `vorgang_typ` (`2026-07-10_datenmodell.md`) statt als `text`-Spalte ohne DB-Constraint. Begründung: die vier Werte sind eine geschlossene Start-Taxonomie mit harter Validierungs-Absicht ("Start-Enum"), das ist näher am `vorgang_typ`-Fall (DB-Enum, weil die Eskalations-Hardrule daran hängt) als am `typ_sekundaer`-Fall (bewusst offener Text, weil keine geschlossene Taxonomie existiert). "Erweiterbar" wird dadurch erfüllt, dass `ALTER TYPE kunden_profil_grundton ADD VALUE '...'` eine gewöhnliche künftige Migration ist, kein Schema-Bruch.
- **`kunden_freigabekette` ohne eigene `status`-Spalte:** alle anderen Listen-Tabellen bekommen `status`, weil sie inhaltliche Aussagen sind (KI-vorschlagbar, menschlich bestätigbar). Die Freigabekette ist reine Prozess-Konfiguration (wer segnet in welcher Reihenfolge ab), kein Wissens-Element, das ein Handler mit unterschiedlicher Verlässlichkeit lesen würde. Trotzdem NICHT über die absolute Formulierung "JEDES Profil-Element trägt einen Status" gestellt: die Tabelle bekommt der Vollständigkeit halber ebenfalls eine `status`-Spalte (Default `'vorlaeufig'`), wird aber von keinem Handler-Lesepfad in dieser Decision ausgewertet, weil kein Handler in Ebene 1+2 eine Freigabekette konsumiert (das ist Ebene 4/Konsolen-Workflow).
- **`kunden_medien_kontext`-Spaltenwahl:** der Auftrag beschreibt diese Tabelle nur in Prosa ("relevante Medien / Journalisten-Beziehungen / Medien-Prioritaets-Filter"), ohne Feldliste. Diese Decision modelliert `medium_name`, `journalist_name`, `beziehungsnotiz`, `prioritaet` (`hoch`/`mittel`/`niedrig`, wie `vorgang_prioritaet`) als plausible, aber nicht spec-wörtliche erste Ausprägung. Sollte beim tatsächlichen W2-Journalisten-Feature-Ausbau (`journalisten_profil`-Stub in `packages/handlers/src/w2/types.ts` ist aktuell `verfuegbar: false`) verbindlich nachgeschärft werden.

## Konsequenzen

- Zehn neue Tabellen, alle mit `agentur_id`-Konsistenz-Trigger und SELECT-only-RLS-Policy (Service-Role schreibt), gleiches Muster wie `pruefregeln`/`llm_nutzung`.
- `packages/handlers/src/w2` bleibt bis auf die zwei neuen Bausteine in `regel-engine/bausteine.ts` unverändert — kein Risiko für bestehende W2-Tests durch diese Änderung selbst (die W2-Orchestrierungs-Tests in `packages/persistence` werden angepasst, weil sich die Signatur von `FuehreW2AusEingabe` ändert).
- `KundenProfilRepository.w2KontextLaden`/`w2KontextQuellenProviderErstellen` sind der erste konkrete Beweis, dass das Kundenprofil tatsächlich ein Handler bedient — der Vertrag für W1 (nächster Nutznießer) folgt demselben Muster, sobald W1 existiert.
- Fehlender Kern-Datensatz (`kunden_profil`-Zeile existiert noch nicht für einen Kunden, z. B. direkt nach Onboarding vor jeder Befüllung) führt zu `profilLaden` -> `null` bzw. `w2KontextLaden` -> Kern-Feldern als `null`/leeren Listen, NICHT zu einem Fehler — deckt sich mit "gestuft befüllbar" auch im Extremfall "noch gar nichts befüllt".

**Offene Fragen (für Bastian):**

@thehartworker Entscheidung nötig: Zwei Punkte, bei denen diese Decision eine Annahme trifft, die du bestätigen oder korrigieren solltest, bevor Ebene 3 (KI-Befüllung) darauf aufbaut:

1. **`sprachregelungen_slug` als Feld-Leiche im `W2Input`-Typ:** siehe Abschnitt "Handler-Anbindung" oben — das Feld bleibt im Typ bestehen, wird aber inhaltlich nicht mehr ausgewertet (nur noch `kunde_slug` durchgereicht), damit `packages/handlers` unangetastet bleibt. Alternative wäre, den Typ in `packages/handlers/src/w2/types.ts` jetzt zu bereinigen (Feld entfernen) — das würde aber `packages/handlers` anfassen, was der Auftrag ausdrücklich vermeiden wollte ("Handler-Code bleibt LLM-fokussiert"). Soll die Bereinigung in einem separaten, kleinen Folge-PR passieren, oder ist die Feld-Leiche für dich akzeptabel, solange sie kommentiert ist?
2. **`ist_deterministisch_erzwungen`-Grenzen ignorieren den eigenen Status:** eine `kunden_grenzen`-Zeile mit Status `abgeleitet` (KI-vorgeschlagen, noch nicht bestätigt) wird trotzdem sofort in der Regel-Engine scharf geschaltet, siehe Begründung oben ("lieber zu viel als zu wenig blockieren"). Das bedeutet: sobald Ebene 3 (KI-Befüllung, Folge-Auftrag) beginnt, automatisiert `kunden_grenzen`-Zeilen mit `ist_deterministisch_erzwungen = true` vorzuschlagen, kann eine falsch erkannte KI-Grenze sofort echte Drafts blockieren, bevor eine Beraterin sie geprüft hat. Ist das die gewünschte Ausfallrichtung (Sicherheit vor Verfügbarkeit), oder soll `ist_deterministisch_erzwungen` erst ab Status `freigegeben` greifen (dann bräuchte Ebene 3 zwingend einen Freigabe-Schritt, bevor eine neue harte Grenze überhaupt wirkt)?
