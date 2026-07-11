# Datenmodell für die Intake-Konsole

**Datum:** 2026-07-10
**Status:** vorgeschlagen

**Kontext:** Nach `AGENTS.md` §3.2 braucht jedes substanzielle Feature ein Konzept-Dokument, bevor Code gebaut wird. `BUILD_PLAN_v1.0.md` Woche 1 (Donnerstag) und Woche 2 verlangen ein konzeptionell fixiertes Datenmodell, bevor die Migrations gebaut werden. Diese Decision fixiert die Tabellen, Spalten, Werte-Taxonomien und Indizes für die drei Mandantenfähigkeits-Ebenen aus `SAAS_SPEC_v1.0_CONSOLE.md` §9 (Agentur, Endkunde, Nutzer), den Vorgangs-Klassifikations-Layer (§3), die Backend-Handler-Aufruf-Schnittstelle (§4) und das Audit-Backend (§10).

**Optionen:**

1. Ein einziges breites `vorgaenge`-Dokument-Schema (jsonb-lastig), bei dem Klassifikations-Output, Anliegen und Handler-Aufrufe als verschachteltes JSON in einer Zeile liegen.
2. Normalisiertes relationales Schema mit eigenen Tabellen für Vorgänge, Anliegen, Handler-Aufrufe und Audit-Log, mit `jsonb`-Spalten nur für wirklich unstrukturierte oder Handler-spezifische Payloads.
3. Normalisiertes Schema wie Option 2, aber zusätzlich mit `agentur_id` auf jeder mandanten-relevanten Tabelle dupliziert (statt nur auf `vorgaenge` und über Joins abgeleitet).

**Entscheidung:** Option 3. Ein normalisiertes Schema, bei dem `agentur_id` auf jeder Tabelle liegt, die RLS-Policies referenzieren (auch wenn sie über `vorgang_id` transitiv aus `vorgaenge` ableitbar wäre).

Begründung gegen Option 1: `anliegen[]` ist laut `SAAS_SPEC_v1.0_CONSOLE.md` §3.1 eine Eins-zu-viele-Beziehung (mehrere Anliegen pro Vorgang, jedes mit eigenem Handler-Vorschlag und eigenem Status), und `handler_aufrufe` brauchen eigene Status-Übergänge und Retry-Zähler (§4.3, §4.4, §12.3). Ein verschachteltes Dokument macht `FOR UPDATE SKIP LOCKED`-Picking (§12.1) und partielle Status-Updates unnötig kompliziert.

Begründung für Option 3 gegenüber Option 2: Supabase RLS-Policies, die durch mehrere Joins bis zur Agentur zurückhangeln müssen, sind langsamer und fehleranfälliger (jede Policy braucht dann einen Sub-Select über zwei bis drei Tabellen). Eine denormalisierte `agentur_id` pro Zeile macht jede Policy zu einem einzeiligen Vergleich. Der Preis dafür ist ein zusätzliches Feld pro Tabelle plus ein Trigger oder eine Anwendungs-Invariante, die sicherstellt, dass `agentur_id` beim Insert korrekt aus dem Parent übernommen wird. Das ist ein kleiner Preis gegenüber dem RLS-Risiko (siehe `docs/decisions/2026-07-10_rls-policies.md`, dort auch als "keine Umgehung der Row-Level-Security" aus `AGENTS.md` §4 eingeordnet).

### Sprachregel-Anwendung

Tabellen- und Domänen-Feldnamen folgen `AGENTS.md` §3.4: Domänen-Bezeichner deutsch (`vorgaenge`, `anliegen`, `kunden`, `kunden_kontakte`, `sensitivity`, `typ_primaer`), technisches Gerüst englisch (`id`, `created_at`, `updated_at`, `deleted_at`, `status`).

### Tabellenübersicht

```
agenturen
kunden
kunden_kontakte
nutzer
nutzer_kunden_zuweisungen
nutzer_vorgang_freigaben     -- Guest-Zugriff auf einzelne Vorgänge
vorgaenge
anliegen
handler_aufrufe
audit_log
```

Bewusst **nicht** in dieser Decision (Scope-Grenze, folgt in separaten Decisions vor dem jeweiligen Bau-Schritt): Kanal-Konfiguration pro Kunde (§11.2, E-Mail-Alias/WhatsApp-Nummer/SharePoint-Ordner), Backend-Handler-Konfiguration pro Kunde (welche der sechs Handler sind aktiviert), Kontext-Dokumente/RAG-Wissensbasis pro Kunde. Diese drei gehören zum Onboarding-Flow (Woche 6 laut `BUILD_PLAN_v1.0.md`) und brauchen eigene Konzept-Arbeit, die dieses Datenmodell nicht vorwegnehmen soll.

### `agenturen`

Ebene 1 der Mandantenfähigkeit (§9.1).

```typescript
interface Agentur {
  id: string;                 // uuid, pk
  name: string;
  slug: string;                // unique, für Subdomain konsole.<slug>.<saas-domain>
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
```

### `kunden`

Ebene 2 der Mandantenfähigkeit (§9.1). Entspricht `kunde_id` / `kunde_slug` aus dem Nachrichten- und Klassifikations-Schema (§2.3, §3.4).

```typescript
interface Kunde {
  id: string;
  agentur_id: string;          // fk agenturen
  name: string;
  slug: string;                 // unique je agentur_id, z.B. "baeckerei-hoffmann"
  autonomie_level: 1 | 2 | 3;   // §5.1, Default 1 (Shadow-Mode)
  retention_monate: number;     // §8.4, Default 24, Minimum 6
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
```

### `kunden_kontakte`

Kontaktdatenbank pro Kunde (§11.2: "mindestens 1 Person, empfohlen 3 bis 8"). Wird für `aufgeloester_name` / `aufgeloeste_rolle` in eingehenden Nachrichten (§2.3) und für die Absender-Ansprache in der Antwort-Nachricht (§7.1) verwendet.

```typescript
interface KundenKontakt {
  id: string;
  kunde_id: string;             // fk kunden
  agentur_id: string;           // denormalisiert für RLS, siehe Optionen-Begründung
  name: string;
  rolle: "geschaeftsfuehrung" | "marketing_leitung" | "presse_verantwortliche" | "assistenz" | "sonstige";
  email: string | null;
  telefon: string | null;
  ist_hauptkontakt: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
```

**Zu 2a (Platzhalter-Taxonomie `kunden_kontakte.rolle`):** Die Spec gibt keine geschlossene Rollen-Liste für Kunden-Ansprechpartner:innen vor (anders als bei `anliegen.backend_handler_vorschlag` oder `handler_aufrufe.status`, wo die Spec eine explizite Enumeration liefert). Die fünf Werte oben sind aus dem Spec-Kontext abgeleitet: `geschaeftsfuehrung` und `marketing_leitung` kommen direkt aus dem Beispiel-Input in §2.5 und §3.4 (Sabine Kramer als Marketing-Leitung, Klaus Hoffmann als CEO/Geschäftsführung), `presse_verantwortliche` aus den Presseanfragen-Trigger-Bedingungen in `WORKFLOW_HANDLERS_v1.0.md` (W2), `assistenz` und `sonstige` als Auffangwerte. Das ist eine Modellierungs-Entscheidung, keine wörtliche Spec-Ableitung, deshalb hier explizit benannt statt stillschweigend als "aus der Spec" behauptet.

### `nutzer`

Ebene 3 der Mandantenfähigkeit (§9.1, §9.2). Referenziert Supabase Auth (`auth.users`).

```typescript
interface Nutzer {
  id: string;                   // uuid, = auth.users.id
  agentur_id: string;
  name: string;
  rolle: "chef" | "manager" | "editor" | "reader" | "guest";
  guest_ablauf_at: string | null;  // nur bei rolle = "guest", §9.2 Externe Rolle
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
```

Rollen-Mapping zu Spec-Begriffen (§9.2): `chef` = Chef-Rolle/Owner, `manager` = Etatdirektor:innen-Rolle/Manager, `editor` = Berater:innen-Rolle/Editor, `reader` = Assistenz-Rolle/Reader, `guest` = Externe Rolle/Guest.

### `nutzer_kunden_zuweisungen`

Bildet "Beraterinnen können nur die Kunden sehen, denen sie zugewiesen sind" (§9.1) und die analoge Manager-Zuweisung (§9.2: "Kann Vorgänge aller ihm zugewiesenen Kunden sehen") ab. Gilt für `editor` und `manager`, nicht für `chef` (sieht agenturweit, siehe Decision 2).

```typescript
interface NutzerKundenZuweisung {
  id: string;
  nutzer_id: string;             // fk nutzer
  kunde_id: string;               // fk kunden
  agentur_id: string;             // denormalisiert für RLS
  created_at: string;
  deleted_at: string | null;      // Entzug einer Zuweisung ist Soft-Delete, kein Delete
}
```

### `nutzer_vorgang_freigaben`

Bildet die Externe Rolle/Guest ab: "Kann nur explizit freigegebene einzelne Vorgänge sehen, nicht die ganze Konsole. Zeitlich begrenzt (Ablaufdatum pro Zugang)" (§9.2).

```typescript
interface NutzerVorgangFreigabe {
  id: string;
  nutzer_id: string;              // fk nutzer, rolle = "guest"
  vorgang_id: string;              // fk vorgaenge
  agentur_id: string;              // denormalisiert für RLS
  ablauf_at: string;                // Pflichtfeld, "Ablaufdatum pro Zugang"
  freigegeben_durch: string;        // fk nutzer, wer hat freigegeben
  created_at: string;
}
```

### `vorgaenge`

Kern-Entität. Vereint das Nachrichten-Input-Schema (§2.3) mit den Klassifikations-Output-Feldern (§3.4), die nicht anliegen-spezifisch sind.

```typescript
interface Vorgang {
  id: string;                     // = vorgang_id aus §2.3
  agentur_id: string;
  kunde_id: string;
  kanal: "email" | "whatsapp_text" | "whatsapp_audio" | "dateiablage" | "manuell";
  absender_identifikator: string;
  absender_name: string | null;          // aufgeloester_name
  absender_rolle: string | null;         // aufgeloeste_rolle
  eingang_at: string;
  betreff: string | null;
  inhalt_text: string;
  inhalt_originalsprache: string | null;
  anhaenge: unknown[];                    // jsonb, Metadaten wie in §2.3
  metadaten_kanalspezifisch: Record<string, unknown>;  // jsonb
  audio_originaldauer_sekunden: number | null;
  audio_transkript_qualitaet: "gut" | "maessig" | "schlecht" | "n/a" | null;

  // Klassifikations-Ergebnis (§3.4), null bis Klassifikation abgeschlossen
  sprache_ausgang: string | null;
  typ_primaer: VorgangTyp | null;
  typ_sekundaer: string | null;           // siehe Anmerkung unten, bewusst kein Enum
  confidence: number | null;               // 0-100
  sensitivity: "normal" | "vertraulich" | "krise" | "besonders_geschuetzt" | "regulatorisch_relevant";
  prioritaet: "hoch" | "mittel" | "niedrig" | null;
  routing_rolle: string | null;            // routing.rolle aus §3.4, z.B. "senior_beraterin"
  zustaendige_nutzer_id: string | null;    // fk nutzer, aufgelöst aus routing.person_slug
  routing_verteiler: string[] | null;      // fk[] nutzer, routing.verteiler

  // Betriebs-Semantik (§12.1, §2.4)
  klassifikation_status: "queued" | "in_progress" | "done" | "failed";
  klassifikation_gestartet_at: string | null;
  klassifikation_beendet_at: string | null;
  sla_frist_at: string | null;
  status: "eingegangen" | "klassifiziert" | "in_bearbeitung" | "uebernommen" | "abgeschlossen" | "abgelehnt";
  abgelehnt_grund: string | null;          // §2.4, z.B. "unbekannter Absender", "spam_markiert"

  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

type VorgangTyp = "Anfrage" | "Projekt-Briefing" | "To-Do" | "FYI" | "Freigabe" | "Issue" | "Krise" | "Sonstiges";
```

**Zu 2a (Platzhalter-Taxonomie `typ_primaer`/`typ_sekundaer`):** Der Auftrag nennt neun Werte aus §3.4 (Anfrage, Presseanfrage, Projekt-Briefing, To-Do, FYI, Freigabe, Issue, Krise, Sonstiges) für beide Felder gemeinsam. Beim Durcharbeiten der vollständigen Spec zeigt sich: acht dieser Werte (`Anfrage`, `Projekt-Briefing`, `To-Do`, `FYI`, `Freigabe`, `Issue`, `Krise`, `Sonstiges`) treten überall dort auf, wo die Spec konkret `typ_primaer` referenziert (§3.3 Eskalations-Hardrule, §5.3 Checkpoint 3, §6.3, W1/W3/W6-Trigger in `WORKFLOW_HANDLERS_v1.0.md`). `Presseanfrage` tritt dagegen ausschließlich als `typ_sekundaer`-Beispiel auf (§3.4-Beispiel-Output, W2-Trigger: "`typ_primaer = "Anfrage"` und `typ_sekundaer = "Presseanfrage"`"). Eine vollständige, geschlossene Werte-Liste für `typ_sekundaer` jenseits dieses einen Beispiels liefert keine der vier Spec-Dateien.

Deswegen: `typ_primaer` wird als Postgres-Enum mit den acht Werten oben modelliert (harte Validierung auf DB-Ebene sinnvoll, weil die Eskalations-Hardrule aus §3.3 direkt an diesem Feld hängt). `typ_sekundaer` bleibt als `text`-Spalte ohne DB-Enum, weil die Spec hier keine geschlossene Taxonomie vorgibt und die Backend-Handler in Woche 3 bis 8 sukzessive gebaut werden (`WORKFLOW_HANDLERS_v1.0.md`, Übergreifende Bau-Reihenfolge) — die Zod-Schema-Validierung im Klassifikations-Layer (`AGENTS.md` §3.3/§4) ist der richtige Ort, um `typ_sekundaer`-Werte pro Handler-Trigger zu validieren, ohne dass jede neue Sub-Kategorie eine Datenbank-Migration braucht. Diese Entscheidung wird in `docs/decisions/2026-07-10_rls-policies.md` nicht berührt, ist aber notiert, damit sie nicht zwischen den beiden Decisions auseinanderläuft.

**Zu 2b (Picking-Scope-Korrektur):** In der vorigen Session (laut Aufgabenstellung) war die Annahme, dass die Klassifikations-Queue pro Beraterin gepickt wird. Das ist falsch. Nach §12.1 gilt: "Die Klassifikations-Layer picken atomar ... damit bei parallelen Klassifikations-Workern kein Vorgang doppelt bearbeitet wird", mit Priorität "erstens sensitivity, zweitens `sla_frist_at ASC NULLS LAST`, drittens `eingang_at ASC`". Zu diesem Zeitpunkt existiert `zustaendige_nutzer_id` noch nicht (das Routing ist ja gerade erst das *Ergebnis* der Klassifikation, siehe `routing` im §3.4-Output). Ein Picking-Filter nach Beraterin wäre also nicht nur konzeptionell falsch, sondern zum Zeitpunkt des Pickings technisch unmöglich (die Spalte ist noch `null`).

Der Picking-Index ist deshalb bewusst **ohne** `nutzer_id`- oder `kunde_id`-Filter, nur nach Agentur (ein Klassifikations-Worker-Pool arbeitet agenturweit, nicht pro Kunde) und Status:

```sql
CREATE INDEX vorgaenge_picking_idx ON vorgaenge (agentur_id, sla_frist_at ASC NULLS LAST, eingang_at ASC)
  WHERE klassifikation_status = 'queued';
```

Die Picking-Query (konzeptionell, analog `pick_next_inquiry` aus dem Meta-System):

```sql
SELECT id FROM vorgaenge
WHERE agentur_id = $1
  AND klassifikation_status = 'queued'
ORDER BY
  (sensitivity != 'normal') DESC,   -- sensitive Vorgänge zuerst, siehe Anmerkung unten
  sla_frist_at ASC NULLS LAST,
  eingang_at ASC
LIMIT 1
FOR UPDATE SKIP LOCKED;
```

Anmerkung zur Sensitivity-Sortierung: §12.1 sagt "erstens sensitivity", ohne eine Rangfolge zwischen `vertraulich`, `krise`, `besonders_geschuetzt` und `regulatorisch_relevant` festzulegen. Da alle vier laut §3.3/§5.3 gleichermaßen den Menschen-Abzweig auslösen (keine abgestufte Behandlung in der Spec beschrieben), werden sie beim Picking als gleichrangig behandelt (binäres `normal` vs. `nicht normal`), Tie-Break über `sla_frist_at`/`eingang_at`. Das ist eine direkte, nicht spekulative Lesart von §12.1, deshalb keine offene Frage mehr (siehe unten).

Die Anzeige in der Konsole (welche Beraterin sieht welchen Vorgang) ist danach reine RLS-Frage, siehe `docs/decisions/2026-07-10_rls-policies.md`.

### `anliegen`

Eins-zu-viele zu `vorgaenge` (§3.1: "Mehrere Anliegen in einer Nachricht sauber trennen").

```typescript
interface Anliegen {
  id: string;
  vorgang_id: string;
  agentur_id: string;             // denormalisiert für RLS
  beschreibung: string;
  prioritaet: "hoch" | "mittel" | "niedrig";
  frist_erschlossen: string | null;   // Datum, aufgelöste relative Frist
  frist_annahme: string | null;       // Text, z.B. "\"bis Freitag\" bezogen auf laufende Woche"
  backend_handler_vorschlag: HandlerSlug | null;
  backend_handler_input: Record<string, unknown>;   // jsonb, handler-spezifisch
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

type HandlerSlug =
  | "W1_pressemitteilung_drafter"
  | "W2_presseanfragen_drafter"
  | "W3_monitoring_digest"
  | "W4_journalisten_intelligence"
  | "W5_terminbriefing"
  | "W6_multichannel_transformer";
```

**Zu 2a (Platzhalter-Taxonomie `backend_handler_vorschlag`):** `W1_pressemitteilung_drafter` und `W2_presseanfragen_drafter` sind wörtlich aus dem §3.4-Beispiel-Output übernommen. Für W3 bis W6 liefert keine der vier Spec-Dateien einen wörtlichen Slug im selben `W<n>_<name>`-Muster (geprüft per Volltextsuche über alle vier Dateien: keine Treffer für `W3_`, `W4_`, `W5_`, `W6_`). Die vier Slugs oben sind nach demselben Namensmuster wie W1/W2 aus den Handler-Titeln in `WORKFLOW_HANDLERS_v1.0.md` gebildet (W3 Media Monitoring Digest → `W3_monitoring_digest`, W4 Journalisten- und Medien-Intelligence → `W4_journalisten_intelligence`, W5 Terminbriefing → `W5_terminbriefing`, W6 Long-Form-zu-Multi-Channel-Transformer → `W6_multichannel_transformer`). Das ist eine Namenskonvention, die aus der Spec plausibel abgeleitet ist, aber keine wörtliche Spec-Vorgabe für diese vier — sollte spätestens beim jeweiligen Handler-Bau (`WORKFLOW_HANDLERS_v1.0.md`, Bau-Reihenfolge Woche 3 bis 8) verbindlich mit Bastian bestätigt werden, weil der Handler-Slug Teil der öffentlichen Aufruf-Schnittstelle wird.

### `handler_aufrufe`

Entspricht `HandlerAufruf` aus §4.2.

```typescript
interface HandlerAufruf {
  id: string;                      // aufruf_id
  vorgang_id: string;
  anliegen_id: string;
  agentur_id: string;               // denormalisiert für RLS
  kunde_id: string;                  // denormalisiert, = konsolen_kontext.kunde_id
  handler_slug: HandlerSlug;
  input: Record<string, unknown>;    // jsonb
  zustaendige_nutzer_id: string;      // = konsolen_kontext.zustaendige_person_slug, aufgelöst
  prioritaet: "hoch" | "mittel" | "niedrig";
  sla_frist_at: string | null;
  status: "queued" | "in_progress" | "done" | "failed" | "escalated";
  ergebnis: Record<string, unknown> | null;   // jsonb, HandlerErgebnis aus §4.2
  fehler: string | null;
  zombie_zyklen: number;             // §12.3 Timeout- und Zombie-Handling, Default 0
  gestartet_at: string | null;
  beendet_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
```

**Zu 2a (Platzhalter-Taxonomie `status`):** direkt aus §4.2 übernommen (`queued`, `in_progress`, `done`, `failed`, `escalated`) — keine Änderung nötig, war in der vorigen Session vermutlich schon korrekt, weil §4.2 explizit im ursprünglichen Auszug enthalten war.

### `audit_log`

Append-only pro Agentur, entspricht §10.

```typescript
interface AuditLogEintrag {
  id: string;
  agentur_id: string;
  vorgang_id: string | null;         // null bei nicht-vorgangs-gebundenen Einträgen (z.B. reiner Login-Zugriff)
  nutzer_id: string | null;           // null bei System-/Klassifikations-Aktionen ohne Mensch
  aktion: AuditAktion;
  aktion_payload: Record<string, unknown>;   // jsonb
  anonymisiert: boolean;               // DSGVO-Ausnahme von Immutability, siehe unten
  created_at: string;
}

type AuditAktion =
  | "vorgang_empfangen"
  | "vorgang_abgelehnt"
  | "klassifikation_abgeschlossen"
  | "handler_aufgerufen"
  | "handler_status_geaendert"
  | "freigabe_erteilt"
  | "freigabe_editiert"
  | "weiterleitung"
  | "uebernahme"
  | "antwort_versendet"
  | "vorgang_zugriff"
  | "dsgvo_anonymisierung";
```

**Zu 2a (Platzhalter-Taxonomie `aktion`):** abgeleitet aus der Aufzählung in §10.1 ("Was wird geloggt"): Vorgang-Empfang → `vorgang_empfangen`, Klassifikations-Ergebnis → `klassifikation_abgeschlossen`, Backend-Handler-Aufrufe → `handler_aufgerufen` plus `handler_status_geaendert` für die Statusänderungen aus §10.1 letzter Punkt, Menschliche Aktionen (Freigabe, Edit, Weiterleitung, Übernahme) → `freigabe_erteilt`/`freigabe_editiert`/`weiterleitung`/`uebernahme`, Antwort-Versand → `antwort_versendet`, Zugriffe auf Vorgänge → `vorgang_zugriff`. `vorgang_abgelehnt` zusätzlich aus §2.4 (Ablehnungs-Fälle werden "im Audit-Log als 'abgelehnt' markiert"). `dsgvo_anonymisierung` zusätzlich aus §8.4/§10.2 (Log-Einträge werden bei DSGVO-Löschung anonymisiert, nicht gelöscht).

Das `anonymisiert`-Flag markiert die einzige laut §10.2 zulässige Ausnahme von "Log-Einträge werden niemals editiert oder gelöscht": bei einer DSGVO-Löschung wird der `aktion_payload` in-place anonymisiert (Absender-Identität ersetzt), die Zeile bleibt aber bestehen und der Flag wird gesetzt. Das ist explizit keine Verletzung von `AGENTS.md` §4 ("Kein Direct-Delete in der Datenbank"), sondern der dort selbst benannte Ausnahmefall ("außer im expliziten DSGVO-Löschungs-Prozess").

**Konsequenzen:**

- Jede mandanten-relevante Tabelle trägt `agentur_id` direkt (Option 3), auch wenn sie über `vorgang_id` oder `kunde_id` transitiv ableitbar wäre. Anwendungscode (Insert-Pfade in `packages/classifier` und `packages/handlers`) muss `agentur_id` konsistent aus dem Parent übernehmen. Ein Datenbank-Trigger, der das bei jedem Insert erzwingt (statt sich auf Anwendungsdisziplin zu verlassen), ist ein sinnvoller Härtungs-Schritt für die Migration, aber kein Gegenstand dieser Decision.
- `typ_sekundaer` ist bewusst `text` statt Enum, siehe Begründung oben. Das bedeutet: die harte Validierung dieses Felds liegt vollständig beim Zod-Schema im Klassifikations-Layer, nicht in der Datenbank. Wenn sich das als unzureichend erweist (z.B. Tippfehler-Varianten in der Praxis), kann das später per Check-Constraint nachgezogen werden.
- Die vier Handler-Slugs für W3 bis W6 sind eine plausible, aber nicht Spec-wörtliche Ableitung (siehe oben) und sollten beim jeweiligen Handler-Bau verbindlich bestätigt werden.
- Verschlüsselung at-rest (AES-256 vs. HSM) ist in dieser Decision nicht spezifiziert, weil `SAAS_SPEC_v1.0_CONSOLE.md` §13 Frage 3 das explizit als offene, noch nicht panel-vorentschiedene Bastian-Frage führt (siehe "Offene Fragen" unten).
- Das eigentliche Routing-Verfahren (wie genau `zustaendige_nutzer_id` aus `routing.person_slug` ermittelt wird, z.B. Skill-basiert, Round-Robin, oder manuelle Manager-Zuweisung) ist Klassifikations-Layer-Logik (`AGENTS.md` §7), nicht Datenmodell-Scope. Diese Decision legt nur die Spalte fest, die das Ergebnis aufnimmt.

**Offene Fragen (für Bastian):**

1. **Verschlüsselung at-rest:** normale AES-256 im DB-Layer (Barkhau-Empfehlung in `SAAS_SPEC_v1.0_CONSOLE.md` §13 Frage 3) oder HSM-basiert? Die Spec selbst führt das explizit als ungeklärt und schlägt AES-256 für v1 vor, HSM für v2/Enterprise. Diese Decision geht von der Panel-Empfehlung (AES-256, Supabase-Standard-Verschlüsselung) aus, bis Bastian das final bestätigt oder abweicht.

Alle anderen in der vorigen Session vermutlich offenen Fragen zu diesem Datenmodell (Werte-Taxonomien, Picking-Scope, Handler-Slug-Namensmuster) sind oben direkt aus der jetzt vollständigen Spec beantwortet und deshalb nicht mehr Teil dieser Liste.
