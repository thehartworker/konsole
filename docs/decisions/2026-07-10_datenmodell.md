# Relationales Datenmodell für die Intake-Konsole

**Datum:** 2026-07-10
**Status:** vorgeschlagen

## Kontext

Woche 2 (siehe `BUILD_PLAN_v1.0.md`, Woche 2 "Datenmodell, Mandanten-Trennung, Basis-Auth") verlangt ein konzeptionell fixiertes relationales Datenmodell, bevor Migrations gebaut werden (AGENTS.md §3.2, Konzept-vor-Code). Diese Entscheidung deckt die zehn im Issue geforderten Kern-Tabellen ab, plus eine zusätzliche Tabelle (`vorgang_freigaben`), die nötig ist, um die Guest-Rolle aus der RLS-Anforderung (Decision 2) überhaupt konkret abzubilden.

**Wichtiger Vorbehalt:** `SAAS_SPEC_v0.1_CONSOLE.md`, `WORKFLOW_HANDLERS_v0.1.md` und `GESELLSCHAFT_UND_PILOT_v0.1.md` existieren nicht im Repository (Stand dieses Commits), obwohl AGENTS.md, README.md und alle vier bisherigen Design-Decisions durchgängig auf sie verweisen, teils mit konkreten Paragraphen. Nur `BUILD_PLAN_v1.0.md` ist vorhanden. Ich konnte SAAS_SPEC §2 (Input-Vertrag), §3.4 (Klassifikations-Output-Schema), §4.2 (Handler-Aufruf-Schnittstelle), §9 (Mandanten- und Rollenmodell), §10 (Audit-Backend) und §12 (Operative Semantik) nicht im Original nachlesen. Dieses Dokument stützt sich stattdessen auf:

- die im Issue-Text wörtlich ausgeschriebenen Auszüge (sensitivity-Werte, Picking-Priorität, Rollen-Namen),
- AGENTS.md §4 (Soft-Delete), §8.3 (Löschfristen), §8.4 (DSGVO-Löschprozess),
- `BUILD_PLAN_v1.0.md` (Wochenziele, grobe Rollenliste "Chef, Manager, Editor, Reader, Guest"),
- die bestehenden Decisions unter `docs/decisions/`.

Alle Stellen, an denen ich ohne Spec-Grundlage eine Annahme treffen musste, sind unten als Platzhalter markiert und am Ende in der Liste offener Fragen gesammelt.

## Optionen (übergreifende Struktur-Entscheidungen)

Statt einer einzigen Options-Liste für das gesamte Modell hier die Struktur-Fragen, die für mehrere Tabellen gleichzeitig gelten:

1. **Primärschlüssel:** `uuid` (via `gen_random_uuid()`) vs. `bigint identity`. Entscheidung: `uuid` durchgängig, weil IDs teils an den Client zurückgegeben werden (Vorgangs-Links, Freigabe-Links für Gäste) und `bigint`-IDs dort Enumerierbarkeit ermöglichen würden (Kunde X kann Kunde X+1 erraten). `uuid` passt außerdem zum Supabase-Standardmuster.
2. **Mandanten-Bezug pro Tabelle:** direkte `agentur_id`-Spalte auf jeder mandantenbezogenen Tabelle (denormalisiert) vs. `agentur_id` nur auf `agenturen`/`agentur_nutzer`/`kunden` und für alle anderen Tabellen über Joins herleiten (`vorgaenge` → `kunden` → `agentur_id`, `anliegen` → `vorgaenge` → ..., `handler_aufrufe` → `anliegen` → ...). Entscheidung: **Denormalisierung**, siehe Begründung unten bei "Mandanten-Trennung als Design-Prinzip".
3. **Retention-Modellierung:** eigene Spalte pro Zeile vs. Cron-Job mit fester Formel vs. Partitionierung. Entscheidung: Kombination, siehe Abschnitt "Retention und Löschfristen" unten.
4. **Soft-Delete vs. Append-only:** `deleted_at`-Pattern für alle Tabellen außer `audit_log` (das ist strukturell append-only und braucht kein `deleted_at`, siehe Decision 2).

### Mandanten-Trennung als Design-Prinzip

Jede mandantenbezogene Tabelle bekommt eine eigene, direkt gesetzte `agentur_id uuid not null references agenturen(id)`-Spalte, auch wenn sie über eine Kette von Fremdschlüsseln (z. B. `vorgaenge → kunden → agenturen`) implizit herleitbar wäre. Begründung: RLS-Policies (Decision 2) prüfen die Mandanten-Grenze auf jeder einzelnen Tabelle, bei jeder Zeile, bei jedem Zugriff. Eine Policy mit einem zwei- oder dreistufigen Join (`vorgaenge → kunden → agenturen`) ist langsamer als ein einfacher Spaltenvergleich und schwerer zu auditieren ("sehe ich auf einen Blick, dass diese Policy die Mandanten-Grenze durchsetzt?"). Für eine Zeile, deren Fehlkonfiguration eine agenturübergreifende Datenpanne bedeuten würde, ist die einfachste und am leichtesten prüfbare Policy die richtige. `agentur_id` wird beim Insert gesetzt und ist danach unveränderlich (kein Anwendungsfall für eine Änderung; eine `UPDATE`-Policy sollte das explizit ausschließen, siehe Decision 2).

---

## Entscheidung: Tabellen

### 1. `agenturen`

Mandanten (die Agenturen selbst).

| Spalte | Typ | Nullable | Default | FK |
|---|---|---|---|---|
| `id` | uuid | nein | `gen_random_uuid()` | PK |
| `name` | text | nein | — | |
| `slug` | text | nein | — | unique, für Subdomain/Routing (siehe offene Frage zu Deployment-Decision) |
| `status` | text | nein | `'aktiv'` | check in `('aktiv','onboarding','pausiert','gekuendigt')` |
| `vertragsbeginn` | date | nein | — | |
| `vertragsende` | date | ja | — | |
| `avv_unterzeichnet_at` | timestamptz | ja | — | |
| `created_at` | timestamptz | nein | `now()` | |
| `updated_at` | timestamptz | nein | `now()` | |
| `deleted_at` | timestamptz | ja | — | |

**Indizes:**
- `unique index on (slug) where deleted_at is null` — Routing-Lookup bei jedem Request (Subdomain oder Pfad-Präfix → Agentur), muss konstant schnell sein.
- `index on (status) where deleted_at is null` — Admin-Übersicht "alle aktiven Agenturen".

### 2. `agentur_nutzer`

Beraterinnen (inklusive Chef/Owner), mit Rollen.

| Spalte | Typ | Nullable | Default | FK |
|---|---|---|---|---|
| `id` | uuid | nein | `gen_random_uuid()` | PK |
| `agentur_id` | uuid | nein | — | → `agenturen(id)` |
| `auth_user_id` | uuid | nein | — | → `auth.users(id)`, unique |
| `email` | text | nein | — | |
| `name` | text | nein | — | |
| `rolle` | text | nein | — | check in `('owner','manager','editor','reader','guest')` |
| `guest_gueltig_bis` | timestamptz | ja | — | nur relevant für `rolle = 'guest'` |
| `eingeladen_von` | uuid | ja | — | → `agentur_nutzer(id)` |
| `aktiv` | boolean | nein | `true` | |
| `created_at` | timestamptz | nein | `now()` | |
| `updated_at` | timestamptz | nein | `now()` | |
| `deleted_at` | timestamptz | ja | — | |

**Indizes:**
- `unique index on (auth_user_id) where deleted_at is null` — das ist der kritischste Index im ganzen Modell: jede RLS-Policy auf jeder anderen Tabelle löst pro Zeile (mindestens einmal pro Statement, gecacht via `stable`-Funktion) einen Lookup `auth.uid() → (agentur_id, rolle)` aus. Ohne diesen Index wird jede RLS-Prüfung im System zum Sequential Scan.
- `index on (agentur_id) where deleted_at is null` — "alle Nutzer:innen einer Agentur", Team-Verwaltungs-Ansicht.

**Annahme:** eine `auth.users`-Zeile gehört zu genau einer Agentur (1:1 über `auth_user_id`). Freelancer:innen, die für mehrere Agenturen arbeiten, sind damit nicht abgebildet — offene Frage.

### 3. `kunden`

Endkunden der Agenturen.

| Spalte | Typ | Nullable | Default | FK |
|---|---|---|---|---|
| `id` | uuid | nein | `gen_random_uuid()` | PK |
| `agentur_id` | uuid | nein | — | → `agenturen(id)` |
| `name` | text | nein | — | |
| `branche` | text | ja | — | |
| `ist_pharma_kontext` | boolean | nein | `false` | steuert die Compliance-Erweiterung aus AGENTS.md §9 (`regulatorisch_relevant`) |
| `status` | text | nein | `'onboarding'` | check in `('onboarding','aktiv','pausiert','beendet')` |
| `onboarding_abgeschlossen_at` | timestamptz | ja | — | |
| `created_at` | timestamptz | nein | `now()` | |
| `updated_at` | timestamptz | nein | `now()` | |
| `deleted_at` | timestamptz | ja | — | |

**Indizes:**
- `index on (agentur_id) where deleted_at is null` — Kernquery jeder Konsolen-Sitzung: "alle Kunden meiner Agentur" (weiter gefiltert über `nutzer_kunden_zuweisung` für Ebene 2).

### 4. `kunden_kontakte`

Ansprechpartner:innen beim Kunden.

| Spalte | Typ | Nullable | Default | FK |
|---|---|---|---|---|
| `id` | uuid | nein | `gen_random_uuid()` | PK |
| `agentur_id` | uuid | nein | — | → `agenturen(id)`, denormalisiert (siehe oben) |
| `kunde_id` | uuid | nein | — | → `kunden(id)` |
| `name` | text | nein | — | |
| `rolle` | text | ja | — | z. B. `'entscheider'`, `'ansprechpartner'` — Werte-Taxonomie nicht spezifiziert, Platzhalter |
| `email` | text | ja | — | |
| `telefon` | text | ja | — | |
| `whatsapp_nummer` | text | ja | — | E.164-Format angenommen |
| `bevorzugter_kanal` | text | ja | — | check in `('email','whatsapp','sharepoint','manuell')` |
| `einwilligung_pilot_am` | timestamptz | ja | — | DSGVO-Einwilligung für Pilot-Teilnahme (BUILD_PLAN Woche 4: "Endkunden-Zustimmung eingeholt") |
| `anonymisiert_at` | timestamptz | ja | — | gesetzt durch DSGVO-Löschprozess, siehe unten |
| `created_at` | timestamptz | nein | `now()` | |
| `updated_at` | timestamptz | nein | `now()` | |
| `deleted_at` | timestamptz | ja | — | |

**Indizes:**
- `index on (kunde_id) where deleted_at is null` — Kontaktliste pro Kunde.
- `unique index on (lower(email)) where email is not null and deleted_at is null` — globale Kanal-Identität für das Matching eingehender E-Mails auf einen bekannten Kontakt (Annahme: E-Mail-Adressen sind über Agenturen hinweg eindeutig einer Person zugeordnet, nicht nur pro Kunde).
- `unique index on (whatsapp_nummer) where whatsapp_nummer is not null and deleted_at is null` — analog für WhatsApp-Matching.

**Offene Frage:** ob das globale Unique-Constraint auf `email`/`whatsapp_nummer` richtig ist, hängt von der Ingestion-Architektur ab (wird die Agentur aus der empfangenden Mailbox/Nummer bestimmt, oder aus dem Absender?). Ohne SAAS_SPEC §2 nicht verifizierbar.

### 5. `kunden_konfiguration`

Autonomie-Level, aktive Kanäle, aktive Handler, Retention. Eine Zeile pro Kunde (1:1).

| Spalte | Typ | Nullable | Default | FK |
|---|---|---|---|---|
| `id` | uuid | nein | `gen_random_uuid()` | PK |
| `agentur_id` | uuid | nein | — | → `agenturen(id)`, denormalisiert |
| `kunde_id` | uuid | nein | — | → `kunden(id)`, unique |
| `autonomie_level` | smallint | nein | `1` | check `between 1 and 3` (Stufe 1 Shadow-Mode laut BUILD_PLAN Woche 7) |
| `aktive_kanaele` | text[] | nein | `'{}'` | Werte aus `('email','whatsapp','sharepoint','manuell')` |
| `aktive_handler` | text[] | nein | `'{}'` | Werte aus `('w1','w2','w3','w4','w5','w6')` |
| `retention_transkript_monate` | smallint | nein | `24` | check `>= 6` (AGENTS.md §8.3: min. 6, Standard 24) |
| `retention_audit_log_jahre_nach_vertragsende` | smallint | nein | `3` | AGENTS.md §8.3: "Vertragsdauer plus 3 Jahre" |
| `sla_frist_stunden_default` | smallint | ja | — | Basiswert zur Berechnung von `vorgaenge.sla_frist_at`, konkrete Formel nicht spezifiziert |
| `created_at` | timestamptz | nein | `now()` | |
| `updated_at` | timestamptz | nein | `now()` | |
| `deleted_at` | timestamptz | ja | — | |

**Indizes:**
- `unique index on (kunde_id) where deleted_at is null` — erzwingt 1:1, und ist gleichzeitig der Zugriffspfad "Konfiguration für Kunde X".

### 6. `nutzer_kunden_zuweisung`

Welche Beraterin sieht welchen Kunden (Ebene 2 aus SAAS_SPEC §9.1, laut Issue-Text).

| Spalte | Typ | Nullable | Default | FK |
|---|---|---|---|---|
| `id` | uuid | nein | `gen_random_uuid()` | PK |
| `agentur_id` | uuid | nein | — | → `agenturen(id)`, denormalisiert |
| `agentur_nutzer_id` | uuid | nein | — | → `agentur_nutzer(id)` |
| `kunde_id` | uuid | nein | — | → `kunden(id)` |
| `zugewiesen_von` | uuid | ja | — | → `agentur_nutzer(id)` |
| `created_at` | timestamptz | nein | `now()` | |
| `deleted_at` | timestamptz | ja | — | Entzug der Zuweisung ist ein Soft-Delete, kein Update |

**Indizes:**
- `unique index on (agentur_nutzer_id, kunde_id) where deleted_at is null` — verhindert doppelte aktive Zuweisung, UND ist gleichzeitig der Index, den jede RLS-Policy auf `vorgaenge`/`kunden`/etc. für die Ebene-2-Prüfung braucht (`EXISTS (... WHERE agentur_nutzer_id = app.current_nutzer_id() AND kunde_id = ziel.kunde_id AND deleted_at is null)`). Das ist nach dem `auth_user_id`-Index der zweitwichtigste Index im Modell.
- `index on (kunde_id) where deleted_at is null` — Rückwärts-Lookup "welche Beraterinnen sehen Kunde X", für Admin-Ansichten und zum Ermitteln der "zuständigen Beraterin" bei sensitiven Vorgängen.

### 7. `vorgaenge`

Der zentrale Vorgang: eingehende Nachricht plus Klassifikations-Metadaten.

| Spalte | Typ | Nullable | Default | FK |
|---|---|---|---|---|
| `id` | uuid | nein | `gen_random_uuid()` | PK |
| `agentur_id` | uuid | nein | — | → `agenturen(id)`, denormalisiert |
| `kunde_id` | uuid | nein | — | → `kunden(id)` |
| `kunden_kontakt_id` | uuid | ja | — | → `kunden_kontakte(id)`; `null` wenn Absender nicht zuordenbar oder nach Anonymisierung |
| `kanal` | text | nein | — | check in `('email','whatsapp','sharepoint','manuell')` |
| `kanal_referenz` | text | ja | — | Message-ID / WhatsApp-Message-ID, für idempotente Ingestion |
| `eingang_at` | timestamptz | nein | — | Zeitpunkt des Eingangs beim Kanal (nicht `created_at` der Zeile) |
| `rohinhalt` | text | ja | — | Nachrichtentext/Transkript; `null` nach Retention-Ablauf (siehe unten), nicht identisch mit Soft-Delete |
| `inhalt_geloescht_at` | timestamptz | ja | — | gesetzt, wenn `rohinhalt` retention-bedingt geleert wurde |
| `anhang_pfade` | text[] | nein | `'{}'` | Pfade in Supabase Storage |
| `sender_identitaet_anonymisiert` | boolean | nein | `false` | DSGVO-Löschprozess-Flag |
| `sender_anzeige_name` | text | ja | — | Snapshot des Absendernamens zum Eingangszeitpunkt; wird bei Anonymisierung überschrieben |
| `klassifikation_status` | text | nein | `'ausstehend'` | check in `('ausstehend','klassifiziert','fehlgeschlagen','manuell_erfasst')` |
| `klassifikation_rohantwort` | jsonb | ja | — | Zod-validierter LLM-Output, für Audit/Debugging |
| `sensitivity` | text | nein | `'normal'` | check in `('normal','vertraulich','krise','besonders_geschuetzt','regulatorisch_relevant')` |
| `sensitivity_rang` | smallint | nein | generiert, siehe unten | `generated always as (...) stored`, für Sortierung |
| `sla_frist_at` | timestamptz | ja | — | |
| `status` | text | nein | `'neu'` | check in `('neu','in_bearbeitung','wartet_auf_freigabe','abgeschlossen','archiviert')` |
| `zugewiesen_an` | uuid | ja | — | → `agentur_nutzer(id)`, die "zuständige Beraterin" |
| `gepickt_von` | uuid | ja | — | → `agentur_nutzer(id)` |
| `gepickt_at` | timestamptz | ja | — | |
| `abgeschlossen_at` | timestamptz | ja | — | |
| `created_at` | timestamptz | nein | `now()` | |
| `updated_at` | timestamptz | nein | `now()` | |
| `deleted_at` | timestamptz | ja | — | |

**`sensitivity_rang` (generierte Spalte):**

```sql
sensitivity_rang smallint generated always as (
  case sensitivity
    when 'krise' then 1
    when 'besonders_geschuetzt' then 2
    when 'regulatorisch_relevant' then 3
    when 'vertraulich' then 4
    else 5 -- 'normal'
  end
) stored
```

**Annahme (nicht im Issue-Text spezifiziert):** Rangfolge der fünf `sensitivity`-Werte für das Picking ist `krise` > `besonders_geschuetzt` > `regulatorisch_relevant` > `vertraulich` > `normal`. Das Issue nennt nur "erstens sensitivity", nicht die Reihenfolge innerhalb der fünf Werte. Diese Rangfolge braucht Bastians Bestätigung (siehe offene Fragen).

**Picking-Index (SAAS_SPEC §12.1, `FOR UPDATE SKIP LOCKED`):**

```sql
create index idx_vorgaenge_picking
  on vorgaenge (sensitivity_rang asc, sla_frist_at asc nulls last, eingang_at asc)
  where status = 'neu' and deleted_at is null;
```

Picking-Query-Skizze:

```sql
select id from vorgaenge
where status = 'neu' and deleted_at is null
  and kunde_id = any(:zugewiesene_kunden_ids)
order by sensitivity_rang asc, sla_frist_at asc nulls last, eingang_at asc
limit 1
for update skip locked;
```

Der Index ist bewusst **nicht** zusätzlich nach `kunde_id` partitioniert. Begründung: die Menge der Zeilen mit `status = 'neu'` ist im erwarteten Betrieb (wenige Kunden pro Agentur, Vorgänge werden zeitnah bearbeitet) klein, ein Index-Scan mit Nachfilterung auf `kunde_id = any(...)` bleibt günstig, und die Sortierreihenfolge aus dem Index bleibt erhalten. Wächst die "neu"-Queue pro Agentur stark (z. B. durch einen Ausfall der Beraterinnen-Kapazität), sollte dieser Index um `agentur_id` als führende Spalte erweitert werden — als Konsequenz unten vermerkt.

**Offene Frage:** ob Picking pro Beraterin (gefiltert auf `nutzer_kunden_zuweisung`) oder pro Agentur (irgendeine verfügbare Beraterin pickt aus dem gesamten Agentur-Pool) laufen soll, ist nicht spezifiziert. Die Query-Skizze oben geht von "pro Beraterin, gefiltert auf zugewiesene Kunden" aus.

**Weitere Indizes:**
- `index on (zugewiesen_an) where status <> 'abgeschlossen' and deleted_at is null` — "meine offenen Vorgänge", die Standard-Dashboard-Query jeder Beraterin.
- `index on (kunde_id, eingang_at desc) where deleted_at is null` — Vorgangs-Historie pro Kunde.
- `unique index on (kanal, kanal_referenz) where kanal_referenz is not null and deleted_at is null` — idempotente Ingestion, verhindert doppelte Vorgänge bei Webhook-Retries.
- `index on (agentur_id, sensitivity) where deleted_at is null` — RLS-Unterstützung für die Sensitivity-Sichtbarkeitsprüfung (Decision 2) und Reporting ("wie viele sensitive Vorgänge diese Woche").

### 8. `anliegen`

Mehrere pro Vorgang, aus dem Klassifikations-Output.

| Spalte | Typ | Nullable | Default | FK |
|---|---|---|---|---|
| `id` | uuid | nein | `gen_random_uuid()` | PK |
| `agentur_id` | uuid | nein | — | → `agenturen(id)`, denormalisiert |
| `vorgang_id` | uuid | nein | — | → `vorgaenge(id)` |
| `reihenfolge` | smallint | nein | `1` | Position innerhalb des Vorgangs |
| `kategorie` | text | nein | — | Werte-Taxonomie nicht spezifiziert, Platzhalter (siehe offene Fragen) |
| `zusammenfassung` | text | nein | — | LLM-generierte Kurzfassung |
| `vorgeschlagener_handler` | text | ja | — | check in `('w1','w2','w3','w4','w5','w6')` oder `null` |
| `konfidenz` | numeric(4,3) | ja | — | check `between 0 and 1` |
| `status` | text | nein | `'offen'` | check in `('offen','in_bearbeitung','beantwortet','verworfen')` |
| `created_at` | timestamptz | nein | `now()` | |
| `updated_at` | timestamptz | nein | `now()` | |
| `deleted_at` | timestamptz | ja | — | |

**Indizes:**
- `index on (vorgang_id) where deleted_at is null` — alle Anliegen eines Vorgangs (Detail-Ansicht), sortiert per `reihenfolge`.
- `index on (agentur_id, vorgeschlagener_handler) where status = 'offen' and deleted_at is null` — handler-spezifische Arbeitslisten ("alle offenen W2-Anliegen dieser Agentur").

### 9. `handler_aufrufe`

Queue-Tabelle für die Backend-Handler.

| Spalte | Typ | Nullable | Default | FK |
|---|---|---|---|---|
| `id` | uuid | nein | `gen_random_uuid()` | PK |
| `agentur_id` | uuid | nein | — | → `agenturen(id)`, denormalisiert |
| `anliegen_id` | uuid | nein | — | → `anliegen(id)` |
| `handler` | text | nein | — | check in `('w1','w2','w3','w4','w5','w6')` |
| `status` | text | nein | `'ausstehend'` | check in `('ausstehend','laeuft','erfolgreich','fehlgeschlagen','abgebrochen')` |
| `versuch` | smallint | nein | `0` | Retry-Zähler, siehe AGENTS.md §7.4 (max. 6) |
| `naechster_versuch_at` | timestamptz | ja | — | Backoff-Scheduling |
| `eingang_at` | timestamptz | nein | `now()` | Zeitpunkt der Einreihung |
| `gestartet_at` | timestamptz | ja | — | |
| `abgeschlossen_at` | timestamptz | ja | — | |
| `input_payload` | jsonb | nein | — | Handler-Aufruf-Input gemäß SAAS_SPEC §4.2 |
| `output_payload` | jsonb | ja | — | Zod-validiertes Handler-Ergebnis |
| `fehler_meldung` | text | ja | — | |
| `created_at` | timestamptz | nein | `now()` | |
| `updated_at` | timestamptz | nein | `now()` | |
| `deleted_at` | timestamptz | ja | — | |

**Picking-Index (analog zu `vorgaenge`, SAAS_SPEC §4.2/§12.1):**

```sql
create index idx_handler_aufrufe_picking
  on handler_aufrufe (handler, naechster_versuch_at asc nulls first, eingang_at asc)
  where status = 'ausstehend' and deleted_at is null;
```

Führend nach `handler`, weil jeder Handler-Worker nur seine eigene Warteschlange pollt (`WHERE handler = 'w2' AND status = 'ausstehend' ...`). `naechster_versuch_at asc nulls first` sorgt dafür, dass Erstversuche (kein Backoff gesetzt) vor wartenden Retries drankommen.

**Weitere Indizes:**
- `index on (anliegen_id) where deleted_at is null` — Rückverweis, "alle Handler-Aufrufe zu diesem Anliegen".
- `index on (agentur_id, handler, status) where deleted_at is null` — Monitoring/Dashboards.

### 10. `audit_log`

Append-only Audit-Trail.

| Spalte | Typ | Nullable | Default | FK |
|---|---|---|---|---|
| `id` | uuid | nein | `gen_random_uuid()` | PK |
| `agentur_id` | uuid | nein | — | → `agenturen(id)`, denormalisiert (kein Join für RLS-Sichtbarkeitsprüfung nötig) |
| `akteur_id` | uuid | ja | — | → `agentur_nutzer(id)`, `null` bei System-/Handler-Aktionen |
| `akteur_typ` | text | nein | `'nutzer'` | check in `('nutzer','system','handler')` |
| `aktion` | text | nein | — | z. B. `'vorgang.erstellt'`, `'anliegen.beantwortet'`, `'dsgvo.loeschung_durchgefuehrt'` — Taxonomie nicht spezifiziert, Platzhalter |
| `ziel_typ` | text | nein | — | z. B. `'vorgang'`, `'anliegen'`, `'kunde'`, `'agentur_nutzer'` |
| `ziel_id` | uuid | ja | — | kein FK (Ziel kann aus verschiedenen Tabellen stammen, und darf nach Löschung des Ziels weiter referenzierbar bleiben) |
| `kunde_id` | uuid | ja | — | → `kunden(id)`, denormalisiert, für kundenbezogene Audit-Ansichten |
| `payload` | jsonb | ja | — | Vorher/Nachher-Diff oder Kontext |
| `ip_adresse` | inet | ja | — | |
| `erzeugt_at` | timestamptz | nein | `now()` | bewusst kein `created_at`, um zu signalisieren: dieses Feld ist der unveränderliche Ereigniszeitpunkt |

Kein `updated_at`, kein `deleted_at` — die Tabelle ist strukturell append-only (siehe Decision 2 für die RLS-Konsequenz und den DSGVO-Sonderfall).

**Indizes:**
- `index on (agentur_id, erzeugt_at desc)` — Haupt-Log-Ansicht pro Mandant, chronologisch (owner/manager).
- `index on (akteur_id, erzeugt_at desc)` — "meine eigenen Aktionen" (editor).
- `index on (ziel_typ, ziel_id)` — Audit-Trail zu einem konkreten Objekt (z. B. "alle Log-Einträge zu Vorgang X").

**Retention/Partitionierung:** siehe eigener Abschnitt unten.

### 11. `vorgang_freigaben` (Ergänzung, nicht in der Mindest-Liste des Issues)

Diese Tabelle ist nicht explizit im Issue verlangt, aber ohne sie lässt sich die Guest-Anforderung aus Decision 2 ("nur explizit freigegebene einzelne Vorgänge, zeitlich begrenzt") nicht konkret modellieren. Das Issue verlangt "mindestens" die zehn genannten Tabellen, daher als Ergänzung aufgenommen und hier explizit markiert.

| Spalte | Typ | Nullable | Default | FK |
|---|---|---|---|---|
| `id` | uuid | nein | `gen_random_uuid()` | PK |
| `agentur_id` | uuid | nein | — | → `agenturen(id)`, denormalisiert |
| `vorgang_id` | uuid | nein | — | → `vorgaenge(id)` |
| `gast_nutzer_id` | uuid | nein | — | → `agentur_nutzer(id)`, muss `rolle = 'guest'` haben (keine DB-Constraint dafür vorgesehen, Anwendungslogik) |
| `freigegeben_von` | uuid | nein | — | → `agentur_nutzer(id)` |
| `gueltig_bis` | timestamptz | nein | — | |
| `created_at` | timestamptz | nein | `now()` | |
| `deleted_at` | timestamptz | ja | — | manueller Widerruf vor Ablauf |

**Indizes:**
- `unique index on (vorgang_id, gast_nutzer_id) where deleted_at is null` — keine doppelten aktiven Freigaben.
- `index on (gast_nutzer_id, gueltig_bis) where deleted_at is null` — die RLS-Prüfung für Gäste liest genau diesen Pfad bei jedem Zugriff.

---

## Retention und Löschfristen (SAAS_SPEC §8.4, hier aus AGENTS.md §8.3 übernommen)

Drei verschiedene Mechanismen für drei verschiedene Anforderungen, keine Einheitslösung:

1. **Rohaudio nach Transkription, gelöscht binnen 5 Minuten:** betrifft Dateien in Supabase Storage (WhatsApp-Sprachnotizen), nicht direkt eine Zeile in diesen zehn Tabellen. Modelliert über eine Storage-Lifecycle-Regel oder einen sehr häufig laufenden Cron-Job auf Storage-Objekte, referenziert über `vorgaenge.anhang_pfade`. Das ist kein DB-Schema-Thema und braucht ein eigenes, kleines Konzept-Dokument (siehe offene Fragen).

2. **Transkript-Inhalte, 24 Monate (konfigurierbar pro Agentur, min. 6):** eigene Spalte plus Cron-Job, kein eigenes `deleted_at`. `kunden_konfiguration.retention_transkript_monate` legt die Frist fest, ein täglicher Job (Supabase `pg_cron`) prüft `vorgaenge.eingang_at + retention_transkript_monate < now()` und leert dann gezielt `vorgaenge.rohinhalt` (auf `null`), setzt `inhalt_geloescht_at`. Bewusst **kein** Soft-Delete der ganzen Zeile: `anliegen`, `handler_aufrufe` und `audit_log` referenzieren weiterhin den Vorgang, und die Metadaten (Klassifikation, Sensitivity, Zeitstempel) bleiben für Statistik/Audit erhalten. Nur der Rohinhalt verschwindet.

3. **Klassifikations-Metadaten, 5 Jahre, anonymisiert nach 24 Monaten:** analog zu Punkt 2 ein zeitgesteuerter Job, der nach 24 Monaten den Absenderbezug kappt (siehe DSGVO-Löschprozess unten, gleicher Mechanismus) und nach 5 Jahren die komplette Zeile soft-deleted (`deleted_at`).

4. **Audit-Log, Vertragsdauer plus 3 Jahre:** hier ist **Partitionierung** die richtige Wahl, nicht nur ein Cron-Job. Begründung: `audit_log` wächst am schnellsten von allen zehn Tabellen (jede Nutzer-Aktion, jeder Handler-Aufruf, jede Systemaktion erzeugt eine Zeile) und wird fast ausschließlich zeitlich gefiltert gelesen (Log-Ansicht, "letzte 90 Tage"). Native Postgres-Partitionierung nach `erzeugt_at` (z. B. monatlich) macht das Löschen alter Daten zu einem `DROP PARTITION` statt einem `DELETE`-Statement über Millionen Zeilen, und hält die "heißen" Partitionen (aktueller Monat) klein und schnell. Der Retention-Zeitpunkt selbst hängt an `agenturen.vertragsende` (Vertragsdauer ist pro Mandant unterschiedlich), das Löschen einer kompletten Partition ist daher nur möglich, wenn *alle* Zeilen darin über ihre Frist hinaus sind — bei vielen Mandanten mit unterschiedlichen Vertragsenden in derselben Partition ist das nicht gegeben. Praktikabler Kompromiss: Partitionierung für Performance (Lesegeschwindigkeit, Wartbarkeit), tatsächliches Löschen einzelner Zeilen weiterhin über einen Cron-Job pro Mandant nach `vertragsende + 3 Jahre`. Das ist ein Kompromiss, kein Widerspruch: Partitionierung hilft beim Lesen und beim irgendwann-vollständigen Aufräumen alter Partitionen (z. B. nach Ablauf aller darin enthaltenen Mandantenfristen), das gezielte Pro-Mandant-Löschen bleibt zeilenbasiert.

## DSGVO-Löschprozess (SAAS_SPEC §8.5, laut Issue: Absender-Identität anonymisieren, Nachrichten-Inhalte behalten)

Strukturell:

1. `kunden_kontakte` ist der Ort, an dem die Identität einer Person lebt (Name, E-Mail, Telefon, WhatsApp-Nummer). Der DSGVO-Löschantrag betrifft immer eine `kunden_kontakte`-Zeile.
2. Eine `SECURITY DEFINER`-Funktion `dsgvo_anonymisiere_kontakt(kontakt_id uuid)` (Konzept, kein Code in dieser Decision) führt aus:
   - `update kunden_kontakte set name = 'Gelöscht', email = null, telefon = null, whatsapp_nummer = null, anonymisiert_at = now() where id = kontakt_id;`
   - `update vorgaenge set sender_anzeige_name = 'Gelöscht', sender_identitaet_anonymisiert = true where kunden_kontakt_id = kontakt_id;`
   - ein `audit_log`-Eintrag mit `aktion = 'dsgvo.loeschung_durchgefuehrt'`.
3. Die `kunden_kontakte`-Zeile selbst und alle `vorgaenge`-Zeilen bleiben bestehen (kein `DELETE`, kein Soft-Delete). `vorgaenge.rohinhalt` bleibt unverändert — der Nachrichteninhalt ist Dokumentationspflicht der Agentur, nicht die Person des Absenders.
4. Diese Funktion ist bewusst getrennt von der regulären Retention-Logik oben (Punkt 3): DSGVO-Löschung ist ereignisgetrieben (auf Antrag), Retention ist zeitgetrieben (automatisch nach Frist). Beide nutzen denselben Anonymisierungs-Mechanismus auf `kunden_kontakte`, aber unterschiedliche Auslöser.

## Konsequenzen

- Zehn geforderte Tabellen plus eine Ergänzung (`vorgang_freigaben`), alle mit `agentur_id` denormalisiert für einfache und schnelle RLS-Policies (Decision 2 baut direkt darauf auf).
- Drei unterschiedliche Retention-Mechanismen (Spalte+Cron für Vorgangs-Inhalte, Partitionierung+Cron für Audit-Log, Storage-Lifecycle für Rohaudio) statt einer Einheitslösung — mehr Konzept-Aufwand jetzt, aber jede Tabelle bekommt den Mechanismus, der zu ihrem Wachstums- und Zugriffsmuster passt.
- Der Picking-Index auf `vorgaenge` ist bewusst nicht nach `agentur_id`/`kunde_id` partitioniert; das ist ein Risiko, falls die "neu"-Queue einer einzelnen Agentur groß wird. Sollte im Pilotbetrieb beobachtet und bei Bedarf nachgezogen werden.
- Mehrere Enum-artige Textspalten (`kategorie` in `anliegen`, `aktion`/`ziel_typ` in `audit_log`) haben keine feste Werte-Taxonomie, weil WORKFLOW_HANDLERS_v0.1.md nicht verfügbar war. Diese müssen nachgezogen werden, sobald diese Spec vorliegt.
- Die Storage-Lifecycle-Regel für Rohaudio (5-Minuten-Löschung) ist nicht Teil dieses Datenmodells und braucht ein eigenes kleines Konzept-Dokument.

## Offene Fragen für Bastian

1. **Fehlende Spec-Dateien:** `SAAS_SPEC_v0.1_CONSOLE.md`, `WORKFLOW_HANDLERS_v0.1.md`, `GESELLSCHAFT_UND_PILOT_v0.1.md` sind nicht im Repo. Ohne sie basiert dieses Dokument auf Annahmen und den im Issue zitierten Auszügen. Bitte committen oder Pfad korrigieren.
2. **Rangfolge der `sensitivity`-Werte** für das Picking (angenommen: `krise` > `besonders_geschuetzt` > `regulatorisch_relevant` > `vertraulich` > `normal`) — bitte bestätigen oder korrigieren.
3. **Picking-Scope:** pro Beraterin (gefiltert auf zugewiesene Kunden) oder pro gesamter Agentur?
4. **Freelancer-Fall:** kann eine Person (`auth_user_id`) mehreren Agenturen zugeordnet sein? Aktuell als 1:1 angenommen.
5. **Werte-Taxonomie** für `anliegen.kategorie`, `audit_log.aktion`, `audit_log.ziel_typ`, `kunden_kontakte.rolle` — aktuell Platzhalter, brauchen Abgleich mit WORKFLOW_HANDLERS-Spec.
6. **SLA-Fristen-Berechnung:** `sla_frist_stunden_default` ist vorgesehen, aber die genaue Formel (pro Sensitivity? pro Kanal? pro Kunde?) ist nicht spezifiziert.
7. **Globale Eindeutigkeit von E-Mail/WhatsApp-Nummer** in `kunden_kontakte` (aktuell global unique statt pro Kunde) — hängt von der noch unbekannten Ingestion-Architektur ab.
8. **Storage-Lifecycle für Rohaudio** (5-Minuten-Löschfrist) ist bewusst nicht Teil dieses Dokuments — separates Konzept nötig, wer erstellt es?
9. **Namenskonvention:** AGENTS.md §3.4 verlangt englische Bezeichner im Code. Dieses Dokument folgt stattdessen den deutschen Tabellen-/Spaltennamen, die das Issue selbst vorgibt (`vorgaenge`, `anliegen`, `sensitivity_rang`, ...). Das ist ein Widerspruch zwischen Issue und AGENTS.md, siehe PR-Beschreibung.
