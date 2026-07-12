# Kundenprofil Ebene 3: KI-Befüllung per Dokument-Upload und Website-Scraping

**Datum:** 2026-07-12
**Status:** vorgeschlagen

**Kontext:** Issue #37. Das Profil-Fundament (Ebene 1+2, `docs/decisions/2026-07-12_kundenprofil.md`) liegt auf `main`: zehn Tabellen, `KundenProfilRepository`, der Status-Mechanismus `freigegeben/vorlaeufig/abgeleitet`. Bisher wird das Profil ausschließlich manuell befüllt (Service-Role-Schreibzugriff, kein Editier-UI). Dieser Auftrag baut den ersten automatischen Befüllungs-Pfad: aus hochgeladenen Kundendokumenten und aus der Kunden-Website, jeweils per KI-Auswertung. Jedes so gewonnene Element wird ausschließlich mit `status = 'abgeleitet'` geschrieben, nie `freigegeben` -- die menschliche Bestätigung ist explizit Ebene 4 (Konsolen-UI, eigener Folge-Auftrag).

**Umfang dieser Decision:** alle drei Architektur-Teile (Text-Beschaffung, KI-Auswertung, Persistenz) werden hier vollständig entworfen. Die Umsetzung ist bewusst auf zwei PRs verteilt (siehe "Vorgehen" unten) -- diese Decision nimmt aber keine Abkürzung: auch der in PR 2 gebaute Teil ist hier bereits verbindlich festgelegt, damit PR 2 keine neue Design-Entscheidung braucht, nur Umsetzung.

## Die drei Teile

### Teil 1: Text-Beschaffung

Zwei injizierbare Provider-Interfaces in `packages/profil-extraktion/src/types.ts`, analog zum bestehenden `W2KontextQuellenProvider`-Muster (`packages/handlers/src/w2/types.ts`): die KI-Auswertung (Teil 2) hängt nur vom Interface ab, nie von der konkreten Infrastruktur.

```typescript
export interface DokumentTextProvider {
  textExtrahieren(datei: HochgeladeneDatei): Promise<ExtrahierterText>;
}

export interface WebsiteTextProvider {
  textDerRelevantenSeitenLaden(website: KundenWebsiteQuelle): Promise<ExtrahierterText[]>;
}
```

**PR 1 (dieser PR) liefert:**
- Die Interfaces selbst.
- Die *reine, ohne Netzwerk-Call testbare* Rechtslage-Logik für das Website-Scraping (siehe unten, `packages/profil-extraktion/src/website-regeln.ts`): robots.txt-Parsing, Domain-Zugehörigkeits-Check, Seiten-Auswahl-Filter. Das ist die Logik, die entscheidet, OB und WAS gescraped werden dürfte -- sie ist reine Funktion (String rein, Entscheidung raus), unabhängig davon, wer den Netzwerk-Call tatsächlich macht.
- Fake-Implementierungen beider Provider in `packages/profil-extraktion/src/testing/` (definierter Text, kein echter Datei-/Netzwerk-Zugriff), für alle Tests von Teil 2.

**PR 2 liefert:** die produktiven Implementierungen (echtes PDF-/Word-Parsing für `DokumentTextProvider`, echter `fetch()` plus robots.txt-Abruf für `WebsiteTextProvider`), die die Regeln aus PR 1 tatsächlich anwenden, plus die Anbindung an Storage/Persistenz (Teil 3).

**Website-Scraping-Rechtslage (verbindlich, aus dem Auftrag übernommen, nicht neu erfunden):**
- NUR die eigene Kunden-Website (die vom Kunden/der Agentur explizit angegebene Domain, kein Crawling zu fremden Domains, keine Subdomain-Erratung).
- Nur öffentlich zugängliche Seiten, robots.txt wird respektiert (ein `Disallow`-Eintrag, der auf den gewählten User-Agent oder `*` matcht, blockiert den Pfad hart, keine Umgehung).
- Kein aggressives Crawling: eine feste, kleine Seiten-Allowlist (Startseite, Über-uns, Impressum, Presse/News -- per Pfad-Muster erkannt, siehe `website-regeln.ts`), kein rekursives Link-Folgen über diese Seiten hinaus.
- Rate-Limit (PR 2, Infrastruktur-Detail: z. B. 1 Request/Sekunde) und eindeutige User-Agent-Kennzeichnung (`Konsole-Profil-Bot/1.0 (+Kontakt-URL)`), damit der Kunde den Zugriff einem legitimen Zweck zuordnen kann.
- Keine Login-Umgehung, keine bezahlten/geschützten Bereiche.

`website-regeln.ts` bildet drei reine Funktionen:
- `parseRobotsTxt(robotsTxtInhalt: string): RobotsRegelwerk` -- minimaler `Disallow`/`Allow`/`User-agent`-Parser (kein vollständiger RFC-Parser, deckt die gängigen Fälle ab, mit Kommentar zur bewussten Beschränkung).
- `istPfadErlaubt(regelwerk: RobotsRegelwerk, pfad: string, userAgent: string): boolean`.
- `istGleicheKundenDomain(url: string, erlaubteDomain: string): boolean` -- exakte Host-Übereinstimmung oder `www.`-Präfix-Toleranz, explizit KEIN Subdomain-Wildcard (verhindert, dass z. B. `blog.konkurrent-verlinkt-auf.kunden-domain.example` fälschlich als "eigene Domain" durchgeht).
- `waehleRelevanteSeiten(kandidatenPfade: string[], regelwerk: RobotsRegelwerk, userAgent: string): string[]` -- filtert Kandidaten gegen die feste Allowlist-Musterliste (`/`, `/ueber-uns`, `/about`, `/impressum`, `/presse`, `/news`, `/aktuelles`, jeweils case-insensitive, mit und ohne Trailing-Slash) UND gegen robots.txt, gedeckelt auf maximal 6 Seiten.

### Teil 2: KI-Auswertung (`packages/profil-extraktion`, das Herzstück)

Neues Package, analog zu `packages/classifier` strukturiert (`types.ts`, `schema.ts`, `prompt.ts`, eine Orchestrierungs-Datei, `testing/`):

- `extrahiereProfilVorschlag(text, quelle, llmProvider, optionen)` baut den Prompt, ruft `LLMProvider.strukturierteCompletion` (aus `packages/llm`, damit Retry-Wrapper und Token-Erfassung automatisch gelten, siehe `AnthropicProvider`), parsed JSON, validiert per Zod, wendet das Konservativ-Prinzip als Nachbearbeitungsschritt an (siehe unten) und gibt ein `ProfilExtraktionsErgebnis` zurück (Erfolg mit Vorschlag + Token-Verbrauch + Modell, oder Fehlschlag mit Grund, analog zu `KlassifikationsResultat` in `packages/classifier/src/classify.ts`).
- **Modell:** Opus-Klasse (`DEFAULT_MODELL_PROFIL_EXTRAKTION`, Fallback `claude-opus-4-5-20250929`, überschreibbar per `ANTHROPIC_MODEL_PROFIL_EXTRAKTION`-Env), weil Extraktions-Fehler sich laut Auftrag durch alle späteren Handler-Outputs ziehen -- gleiche Modell-Wahl-Begründung wie `W2` (`DEFAULT_MODELL_W2_DRAFT`).
- **Token-Budget:** `max_tokens = 12000` (über dem AGENTS.md-§7.3-Minimum von 8000, weil ein Extraktions-Output potenziell neun Listen-Kategorien gleichzeitig befüllt, mehr Ausgabe-Volumen als ein einzelner Klassifikations-Call).
- **Retry:** kommt automatisch über `AnthropicProvider` (nutzt intern `callLLMWithRetry`), die Extraktions-Logik selbst muss keinen eigenen Retry bauen, exakt wie `klassifiziereNachricht`.

**Extraktions-Schema** (Zod, `packages/profil-extraktion/src/schema.ts`), bewusst 1:1 auf die Kundenprofil-Tabellenstruktur gemappt, damit PR 2 die Vorschläge ohne Zwischentransformation auf `KundenProfilRepository`-Schreibpfade abbilden kann:

```
{
  fakten: { rechtsform, sitz, geschaeftsbeschreibung } (je string | null),
  stimme: { grundton (Enum wie kunden_profil_grundton | null), anrede_konvention ("du"|"sie"|null), gendering_konvention (string | null), zielsprache_absender_texte (string | null) },
  strategie: { positionierung (string | null), usp (string | null) },
  boilerplate: [{ typ: "kurz"|"lang", sprache, text }],
  kennzahlen: [{ bezeichnung, wert, stichtag: string | null, quelle: string | null }],
  sprecher: [{ name, rolle, exakte_schreibweise, zitat_freigabe (boolean) }],
  kernbotschaften: [{ text, reihenfolge }],
  themen: [{ thema, sprachregelung, reaktives_statement, positionierung_vorhanden }],
  grenzen: [{ typ (kunden_grenzen_typ), inhalt, textart_geltungsbereich }],
  medien_kontext: [{ medium_name, journalist_name, beziehungsnotiz, prioritaet }],
  unklare_hinweise: string[]
}
```

`corporate_design_ref` ist bewusst NICHT Teil des Extraktions-Schemas: es ist eine Datei-/Asset-Referenz, aus Fließtext nicht sinnvoll ableitbar, ein Halluzinations-Risiko ohne Gegenwert. Bleibt manuell befüllt (Ebene 2).

**Konservativ-Prinzip (verbindlich, zweistufig durchgesetzt, nicht nur als Prompt-Bitte):**

1. **Prompt-Ebene** (`prompt.ts`): der System-Prompt weist explizit an, jedes Feld, das nicht sicher aus dem Text belegbar ist, als `null` (Skalar-Felder) bzw. wegzulassen (Listen-Elemente) auszugeben, statt zu raten. Wörtliche Passage im Prompt: "Ein leeres Feld ist immer besser als ein erfundener Wert. Du wirst NICHT dafür bewertet, wie viele Felder du befüllst, sondern dafür, dass jedes befüllte Feld im Text tatsächlich belegt ist."
2. **Code-Ebene, zusätzlich zum Prompt** (`konservativ.ts`): eine reine Nachbearbeitungs-Funktion `wendeKonservativesPrinzipAn(rohVorschlag)`, die NICHT dem Modell vertraut, auch wenn der Prompt befolgt wurde:
   - **Kennzahlen:** ein Kennzahl-Element ohne NICHT-LEEREN `stichtag` UND NICHT-LEERE `quelle` wird verworfen (nicht nur maskiert -- komplett aus dem Ergebnis-Array entfernt), Panel-Prinzip "kein Raten bei Zahlen" wörtlich aus dem Auftrag. Grund für Verwerfen statt Zod-Fehler des ganzen Outputs: ein einzelner unbelegter Zahlenwert soll nicht die restlichen, gültigen neun Kategorien mit zu Fall bringen (siehe "Abweichungen" unten). Die Anzahl verworfener Kennzahlen wird im Ergebnis mitgeliefert (`verworfeneKennzahlen: number`), damit der Aufrufer (später Ebene 4) das nicht stillschweigend verliert.
   - **Grenzen:** `ist_deterministisch_erzwungen` wird für JEDES KI-vorgeschlagene Grenzen-Element hart auf `false` gesetzt, unabhängig davon, was das Modell dazu ausgibt (das Feld ist im Extraktions-Schema selbst gar nicht erst vorhanden, das Modell kann es also nicht einmal vorschlagen). Begründung: `docs/decisions/2026-07-12_kundenprofil.md` hat als offene Frage #2 markiert, dass eine `ist_deterministisch_erzwungen = true`-Zeile unabhängig vom eigenen Status sofort scharf geschaltet wird (Regel-Engine prüft ohne Status-Rücksicht). Ein KI-Vorschlag darf diese scharfe Durchsetzung nicht selbst aktivieren können, sonst würde eine falsch erkannte KI-Grenze sofort echte Drafts blockieren, ohne dass je ein Mensch das Feld überhaupt gesehen hat. Das Scharf-Schalten bleibt ausschließlich ein manueller Schritt (Ebene 4). Dies ist unabhängig von Bastians Antwort auf die offene Frage in der Vorgänger-Decision: selbst wenn er entscheidet, dass `ist_deterministisch_erzwungen` weiterhin statusunabhängig gilt, darf eine KI so ein Flag nicht selbst setzen.

**Zod-Validierung:** `ProfilExtraktionsVorschlagSchema.safeParse`, wie in `klassifiziereNachricht` -- ein Schema-Verstoß (falscher Enum-Wert, fehlendes Pflichtfeld) führt zu `status: 'fehlgeschlagen'` mit Rohtext und bereits verbrauchtem Token-Verbrauch (der Call ist ja gelaufen und wurde abgerechnet, das muss trotzdem in `llm_nutzung` landen, siehe Teil 3). Kein teilweises Schema-Escape für Struktur-Fehler -- nur die Kennzahlen-Filterung oben ist eine bewusste Ausnahme, weil sie kein Strukturfehler ist, sondern eine Inhalts-Plausibilitätsprüfung nach erfolgreicher Struktur-Validierung.

### Teil 3: Persistenz (PR 2, hier bereits vollständig entschieden)

- Validierte, konservativ gefilterte Vorschläge werden über `KundenProfilRepository` geschrieben. Jedes Element: `status = 'abgeleitet'`, nie direkt `'freigegeben'` -- die Repository-Methoden (`feldStatusSetzen`/`elementStatusSetzen`) unterstützen das bereits (Default ist `'abgeleitet'`, siehe Ebene-1+2-Decision), PR 2 ergänzt neue Insert-Methoden für die neun Listen-Tabellen (aktuell hat `KundenProfilRepository` nur Status-Übergänge, kein Insert -- das wird in PR 2 nachgezogen, weil Ebene 1+2 kein Editier-UI und damit keinen Insert-Pfad brauchte).
- **`quelle`-Spalte:** die Listen-Tabellen haben aktuell KEINE `quelle`-Spalte (außer `kunden_kennzahlen.quelle`, das ist die inhaltliche Beleg-Quelle der Zahl selbst, z. B. "Geschäftsbericht 2025", nicht die technische Herkunft "dokument-upload"). PR 2 braucht deshalb eine kleine Schema-Ergänzung: eine `herkunft`-Spalte (`text`, nullable, Werte `'dokument-upload'` / `'website-scraping'` / `null` für manuell) auf allen neun Listen-Tabellen plus im `feld_status`-jsonb-Eintrag der Kern-Tabelle (dort existiert `quelle` im `KundenProfilFeldStatusEintrag`-Typ bereits, muss nur tatsächlich befüllt werden). Diese Migration ist Teil von PR 2, nicht dieser PR (kein Bedarf ohne Schreibpfad).
- **Nicht-Überschreiben-Regel:** ein bereits existierendes Element mit `status = 'freigegeben'` (menschlich bestätigt) wird NIE durch einen abgeleiteten Vorschlag ersetzt oder verdrängt.
  - Für die Kern-Tabelle (`kunden_profil`, ein Feld pro Spalte): wenn `feld_status[feldname].status === 'freigegeben'`, wird der neue KI-Wert für dieses Feld komplett übersprungen (kein Update, auch kein Nebenbei-Vorschlag -- es gibt in der Kern-Tabelle keinen Platz für "mehrere Werte desselben Feldes nebeneinander", ein Skalar-Feld hat nur einen Wert). Ist der bestehende Status `'vorlaeufig'` oder `'abgeleitet'`, wird überschrieben (ein neuerer, evtl. besserer abgeleiteter Vorschlag ersetzt einen älteren abgeleiteten Vorschlag -- beide sind ja gleichermaßen unbestätigt).
  - Für Listen-Tabellen (mehrere Zeilen erlaubt): hier gibt es das "ein Feld, ein Wert"-Platzproblem nicht. Ein neuer KI-Vorschlag wird immer als NEUE Zeile danebengelegt (`status = 'abgeleitet'`), unabhängig vom Status bestehender Zeilen. Begründung: eine Liste ("3-5 Kernbotschaften", "mehrere Kennzahlen") verträgt mehrere Einträge nebeneinander, im Gegensatz zum Kern-Feld. Ein bereits `freigegeben`er Sprecher-Eintrag wird also nie geändert oder gelöscht, ein KI-Vorschlag für einen (ggf. denselben) Sprecher landet als zusätzliche `abgeleitet`-Zeile. Dedublizierung (z. B. "ist das derselbe Sprecher wie Zeile X?") ist explizit NICHT Teil dieses Auftrags -- das ist Ebene-4-UI-Aufgabe (die Beraterin sieht zwei ähnliche Zeilen und entscheidet, welche sie freigibt/löscht). Diese Entscheidung ist unten nochmal als Rückfrage an Bastian markiert, weil sie zu doppelten Zeilen führen KANN, falls ein Kunde mehrfach hochlädt/rescraped wird.
- **Token-Erfassung:** ein `llm_nutzung`-Eintrag pro Extraktions-Call, `handler_slug = 'profil_extraktion'` (text, kein Enum-Wert -- gleiches Muster wie `'klassifikation'` in `20260712080000_llm_nutzung.sql`, dort ist `handler_slug` bewusst `text` statt des `handler_slug`-Enums, weil weder Klassifikation noch Profil-Extraktion ein W1-W6-Backend-Handler ist), `kunde_id` aus dem verarbeiteten Kunden, `vorgang_id = NULL` (kein Vorgang-Bezug, Profil-Pflege läuft außerhalb der Intake-Pipeline). Wird auch bei `status: 'fehlgeschlagen'` (Zod-Fehler) geschrieben, wenn Tokens tatsächlich verbraucht wurden (gleiches Prinzip wie `KlassifikationsResultat.tokenVerbrauch` bei Zod-Fehlschlag).

## Datei-Storage

- **Tabelle `kunden_quelldokumente`** (diese PR, `supabase/migrations/20260712120000_kunden_quelldokumente.sql`): Referenz auf ein hochgeladenes Dokument -- `bucket_pfad`, `dateiname`, `mime_typ`, `groesse_bytes`, `upload_zeitpunkt` (= `created_at`, kein Duplikat-Feld), `kunde_id`, `agentur_id` (Options-3-Muster, gleicher Konsistenz-Trigger wie alle anderen Kundenprofil-Tabellen), `hochgeladen_von` (nullable FK auf `nutzer`, `NULL` erlaubt für einen späteren automatisierten Ingest-Pfad ohne menschlichen Uploader), `extraktion_status` (Enum `ausstehend/verarbeitet/fehlgeschlagen`, Default `ausstehend`, damit PR 2 weiß, welche Dokumente schon ausgewertet wurden und welche für eine Re-Auswertung anstehen). RLS: SELECT-only, gleiches Muster wie alle anderen Kundenprofil-Tabellen (Service-Role schreibt).
- **Supabase-Storage-Bucket:** NICHT Teil von `supabase/migrations/` -- die CI-Pipeline dieses Repos (`.github/workflows/ci.yml`, `rls-tests`-Job) wendet jede Datei aus `supabase/migrations/*.sql` gegen einen NACKTEN `postgres:16`-Container an (nur `pgtap`-Extension plus ein manueller `auth`-Schema-Stub, siehe `supabase/tests/helpers/000_auth_roles_and_uid.sql`). Das `storage`-Schema (`storage.buckets`, `storage.objects`) existiert dort nicht -- es wird von Supabase (GoTrue/Storage-API) bereitgestellt, nicht von einer normalen SQL-Migration. Eine Migration, die `storage.buckets` anspricht, würde die `rls-tests`-CI hart brechen (Relation existiert nicht).
  - **Entscheidung:** Bucket-Anlage und `storage.objects`-RLS-Policies liegen in `supabase/storage/kunden_quelldokumente_bucket.sql`, EINMALIG manuell (oder per Supabase-CLI-Migrations-Mechanismus außerhalb dieser CI-Suite) gegen das echte Supabase-Projekt anzuwenden, mit Kommentar-Header, der genau das erklärt. Bucket-Name: `kunden_quelldokumente` (Unterstrich, konsistent mit der Postgres-Identifier-Konvention dieses Repos), `public = false`. Storage-RLS-Policy-Entwurf (dokumentiert, nicht CI-getestet): `SELECT`/`INSERT` nur für `service_role` (kein direkter Endnutzer-Zugriff auf den Bucket, Upload läuft über eine Server-Route mit Service-Role, analog dazu, dass auch die Kundenprofil-Tabellen nur von der Service-Role beschrieben werden). Mandanten-Trennung im Bucket-Pfad selbst: `bucket_pfad` folgt dem Muster `<agentur_id>/<kunde_id>/<dokument_id>-<dateiname>`, sodass eine künftige pfadbasierte Storage-Policy (`storage.foldername(name)`) ohne Schema-Änderung nachgerüstet werden kann.
  - `@thehartworker Entscheidung nötig:` Ist "Bucket-Setup als separates, manuell anzuwendendes SQL-Skript außerhalb der Migrations-Pipeline" für dich akzeptabel, oder soll die CI/das Setup so erweitert werden, dass auch das Storage-Schema in der Test-Pipeline abgebildet wird (z. B. ein zweiter Docker-Layer mit echtem Supabase-Storage-Container statt nacktem Postgres)? Letzteres ist deutlich aufwendiger (kompletter Storage-API-Container statt reinem Postgres) und war außerhalb des Umfangs, den ich für diesen PR als angemessen einschätze.

**DSGVO-Löschfrist (analog AGENTS.md §8.3):**
- Hochgeladene Kundendokumente (Rohdatei im Bucket plus `kunden_quelldokumente`-Zeile) werden **12 Monate nach Upload ODER sofort nach Abschluss des Onboardings, je nachdem was SPÄTER eintritt** hart gelöscht (Bucket-Objekt UND Tabellenzeile, nicht nur Soft-Delete -- siehe unten, das ist die explizite Ausnahme zu "kein Direct-Delete", AGENTS.md §4 nennt den DSGVO-Löschungsprozess als einzige zulässige Ausnahme).
- Begründung für "12 Monate ODER Onboarding-Ende, je später": ein Dokument kann nach Extraktion für eine Re-Auswertung gebraucht werden (Auftrag: "spätere Re-Auswertung"), das Onboarding zieht sich in der Praxis über Wochen, eine feste "Löschung sofort nach erster Auswertung" würde die geforderte Re-Auswertungs-Fähigkeit sofort wieder zunichtemachen. 12 Monate ist zwischen der kürzesten bestehenden Frist (Rohaudio: 5 Minuten, aber das ist ein anderer Datentyp mit anderem Zweck) und der längsten (Transkript-Inhalte: 24 Monate) angesiedelt, näher an Transkript-Inhalten, weil ein Kundendokument (Geschäftsbericht, Boilerplate-PDF) vom Charakter her näher an einem Transkript-Inhalt (Grundlage für abgeleitete Aussagen) ist als an einer flüchtigen Audio-Aufnahme.
- Umsetzung: NICHT Teil dieser PR (kein produktiver Lösch-Job existiert im Repo für irgendeine Frist bisher -- auch die bestehenden §8.3-Fristen aus Ebene 1+2 haben noch keinen automatisierten Cron-Job). `extraktion_status` plus `created_at` reichen als Datenbasis für einen späteren Lösch-Job (`WHERE created_at < now() - interval '12 months'`), das Onboarding-Ende-Signal fehlt aktuell im Datenmodell (kein `onboarding_abgeschlossen_at` auf `kunden`) und ist außerhalb des Umfangs dieses Auftrags.
- `@thehartworker Entscheidung nötig:` 12 Monate ist eine plausible, aber nicht aus einer Spec abgeleitete Zahl (die vier §8.3-Fristen sind alle SAAS_SPEC-Zitate, diese hier ist neu). Ist 12 Monate akzeptabel, oder soll die Frist kürzer/länger sein bzw. konfigurierbar pro Agentur (wie bei "Transkript-Inhalte: 24 Monate, minimum 6 Monate, konfigurierbar")?

## Website-Text: kein Storage

Im Gegensatz zu Dokumenten wird der von `WebsiteTextProvider` gelieferte Seitentext NICHT persistiert (weder Rohtext noch Screenshot) -- nur das Extraktions-ERGEBNIS (die abgeleiteten Profil-Elemente) landet in der DB, mit `herkunft = 'website-scraping'` (PR 2). Begründung: die Website ist jederzeit erneut abrufbar (kein "verloren, wenn nicht gespeichert"-Risiko wie bei einer hochgeladenen Datei, die der Kunde per E-Mail-Anhang schickte), und öffentliche Website-Inhalte dauerhaft in einem eigenen Kunden-Datenspeicher vorzuhalten wäre ein zusätzliches DSGVO-relevantes Vorhalten ohne zwingenden Zweck (Re-Auswertung kann jederzeit erneut scrapen). Falls eine Nachvollziehbarkeits-Anforderung ("welcher Website-Stand hat zu diesem Vorschlag geführt") später doch kommt, ist das eine Erweiterung von `feld_status`/der `herkunft`-Spalte um eine URL plus Zeitstempel, keine neue Speicherentscheidung.

## Vorgehen (zwei PRs)

- **PR 1 (dieser PR):** diese Decision, `kunden_quelldokumente`-Migration plus pgTAP-RLS-Test, `supabase/storage/kunden_quelldokumente_bucket.sql` (dokumentiertes, nicht CI-geprüftes Referenz-Skript), neues Package `packages/profil-extraktion` mit Teil-1-Interfaces plus Website-Rechtslage-Logik plus Teil-2-Extraktions-Modul (Prompt, Schema, Konservativ-Filter, Orchestrierung), Fake-Provider und Mock-LLM-Tests. KEINE echte PDF-/Word-Parsing-Bibliothek, KEIN echter `fetch()`-Aufruf, KEINE Persistenz-Schreibpfade für Profil-Elemente (Teil 3).
- **PR 2 (Folge-PR):** produktive `DokumentTextProvider`/`WebsiteTextProvider`-Implementierungen, `herkunft`-Spalten-Migration, `KundenProfilRepository`-Insert-Methoden für die neun Listen-Tabellen inklusive Nicht-Überschreiben-Logik, Token-Erfassung in `llm_nutzung`, Ende-zu-Ende-Orchestrierung (Upload-Handler -> Storage -> Extraktion -> Persistenz), DB-nahe Tests für RLS/Überschreiben-Regel/Token-Erfassung.

## DB-nahe / sicherheitsrelevante Punkte in diesem PR (markiert für Review)

`@thehartworker Review nötig:` dieser PR fasst `supabase/` (neue Migration, neue RLS-Policy, neues pgTAP-File) und `packages/` (neues Package) an. Worauf beim Review zu achten ist: (1) die `kunden_quelldokumente`-RLS-Policy folgt exakt dem bestehenden SELECT-only-Muster (kein INSERT/UPDATE für Endnutzer-Rollen) -- bitte gegenprüfen, dass kein Endnutzer-Schreibpfad versehentlich offen bleibt; (2) das Storage-Bucket-Skript liegt bewusst außerhalb der Migrations-Pipeline (siehe Rückfrage oben) und wird NICHT von CI geprüft -- bitte bewusst gegenzeichnen, dass das für jetzt okay ist.

## Offene Fragen (für Bastian, zusätzlich zu den beiden oben markierten)

`@thehartworker Entscheidung nötig:` Die Nicht-Überschreiben-Regel für Listen-Tabellen (siehe Teil 3) erzeugt bei wiederholtem Upload/Rescraping potenziell mehrere sehr ähnliche `abgeleitet`-Zeilen nebeneinander (z. B. drei fast identische Kernbotschaften-Vorschläge aus drei verschiedenen Dokumenten). Diese Decision verzichtet bewusst auf Dedublizierung (LLM-basierter "ist das dasselbe?"-Vergleich wäre selbst wieder eine fehleranfällige KI-Entscheidung mit Kosten pro Vergleich) und verschiebt das Aufräumen auf die Beraterin in Ebene 4. Ist dieser "lieber mehrere ähnliche Vorschläge als eine falsch zusammengeführte Dublette"-Kompromiss für dich akzeptabel, oder soll PR 2 eine einfache Vor-Filterung bauen (z. B. exakter Text-Match verwirft Duplikate, kein LLM-Vergleich)?

## Konsequenzen

- Erstes automatisches Befüllungs-Werkzeug für das Kundenprofil, komplementär zur bisher rein manuellen Pflege aus Ebene 1+2.
- `packages/profil-extraktion` ist ab dieser PR die vierte "intelligente Logik, mockbar"-Schicht neben `classifier`/`handlers`/`persistence` -- folgt bewusst demselben Struktur-Muster, keine neue Architektur-Idee.
- PR 2 hat durch diese Decision keinen eigenen Design-Klärungsbedarf mehr, nur noch Umsetzung der hier bereits getroffenen Festlegungen (Ausnahme: die zwei oben markierten offenen Fragen, falls Bastians Antwort Anpassungsbedarf auslöst).
- Ein neuer Datentyp mit eigener, bisher unpräzedenzierter Löschfrist (12 Monate) entsteht -- falls Bastian eine andere Frist wünscht, ist das eine reine Konstanten-Änderung, keine Struktur-Änderung.
