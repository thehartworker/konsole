# RLS-Policies für die Intake-Konsole

**Datum:** 2026-07-10
**Status:** vorgeschlagen

**Kontext:** `AGENTS.md` §4 verbietet jede Umgehung der Row-Level-Security ("auch nicht 'kurz für Debugging'. RLS ist die Sicherheit."). `SAAS_SPEC_v1.0_CONSOLE.md` §9 definiert drei Mandantenfähigkeits-Ebenen und fünf Rollen mit unterschiedlichen Sichtbarkeits- und Bearbeitungsrechten. Diese Decision setzt das Rollenmodell aus §9.2/§9.3 in konkrete RLS-Policies für die Tabellen aus `docs/decisions/2026-07-10_datenmodell.md` um.

**Optionen:**

1. RLS-Policies ausschließlich auf `agentur_id` (reine Mandantentrennung zwischen Agenturen), Kunden- und Rollen-Filterung in der Anwendungsschicht (Next.js API Routes).
2. Vollständige RLS-Policies pro Tabelle und Rolle, inklusive Kunden-Zuweisung und Sensitivity-Filterung direkt in Postgres, Anwendungsschicht verlässt sich auf RLS als harte Grenze.
3. Wie Option 2, aber mit einer zusätzlichen Sicht (`view`) pro Rolle statt direkter Policies auf den Basistabellen.

**Entscheidung:** Option 2. Vollständige RLS-Policies direkt auf den Basistabellen, für jede Rolle aus §9.2 einzeln definiert.

Begründung gegen Option 1: Agentur-Trennung allein reicht nicht, weil §9.1 explizit eine zweite Trennungsebene verlangt ("Beraterinnen können nur die Kunden sehen, denen sie zugewiesen sind") und §9.3 eine dritte, vorgangsspezifische Einschränkung für sensitive Vorgänge. Wenn diese Filterung nur in der Anwendungsschicht liegt, ist ein vergessener `WHERE`-Zusatz in einer einzigen API-Route ein Datenleck zwischen Kunden oder eine Sensitivity-Verletzung. Das widerspricht `AGENTS.md` §4 direkt ("Keine Umgehung der Row-Level-Security"), weil ein rein anwendungsseitiger Filter faktisch eine Umgehung ist, sobald er einmal fehlt.

Begründung gegen Option 3: eine zusätzliche View-Schicht pro Rolle verdoppelt die Wartungsfläche (Migration ändert Tabelle, View muss synchron nachgezogen werden) ohne zusätzlichen Sicherheitsgewinn gegenüber Policies direkt auf der Tabelle. Supabase/PostgREST unterstützt granulare `USING`/`WITH CHECK`-Klauseln pro Policy nativ, das deckt den Bedarf ohne Extra-Schicht.

### Grundprinzip: Rollen-Hierarchie und Sichtbarkeits-Scopes

Aus §9.2/§9.3 destilliert:

| Rolle | Sicht auf `vorgaenge` | Sicht auf `audit_log` |
|---|---|---|
| `chef` | alle Vorgänge der eigenen Agentur | alle Einträge der eigenen Agentur |
| `manager` | alle Vorgänge der ihm zugewiesenen Kunden, inklusive sensitive | alle Einträge der ihm zugewiesenen Kunden |
| `editor` | Vorgänge der ihm zugewiesenen Kunden, sensitive nur wenn `zustaendige_nutzer_id = self` | nur eigene Aktionen |
| `reader` | wie `editor`, aber nur lesend (keine UPDATE/INSERT-Policies) | nur eigene Aktionen |
| `guest` | nur einzeln freigegebene Vorgänge über `nutzer_vorgang_freigaben`, ungelaufen (`ablauf_at > now()`) | kein Zugriff |

Anmerkung zu `manager`/`audit_log`: §10.1 sagt wörtlich nur "Audit-Log ist für Chef und Manager voll einsehbar, für Beraterinnen nur die eigenen Aktionen", ohne die Kunden-Zuweisung beim Audit-Log erneut zu erwähnen. Diese Decision überträgt die Kunden-Zuweisungs-Einschränkung aus §9.2 konsistent auf den Manager-Zugriff auf `audit_log`, weil ein agenturweit uneingeschränktes Audit-Log für Manager sonst mehr Sichtbarkeit gäbe, als der Manager laut §9.2 sonst überall sonst hat (Bruch in der sonst durchgängigen Kunden-Scoping-Logik). Das ist eine Konsistenz-Interpretation, keine wörtliche zweite Spec-Stelle, deshalb hier explizit benannt.

Anmerkung zu `reader`/`guest` und `audit_log`: §10.1 nennt beide nicht. Diese Decision gibt `reader` dieselbe Sichtbarkeit wie `editor` (nur eigene Aktionen, konsistent zur sonstigen "wie editor, nur lesend"-Logik von §9.2) und `guest` gar keinen Zugriff auf `audit_log` (restriktivster Default, konsistent mit der zeitlich und inhaltlich engen Zweckbindung der Externen Rolle).

### Policies je Tabelle

Alle Policies setzen voraus, dass `auth.uid()` dem `nutzer.id` entspricht und dass eine Hilfsfunktion `current_agentur_id()` sowie `current_rolle()` aus dem `nutzer`-Datensatz des eingeloggten Nutzers ableiten (als `SECURITY DEFINER`-Funktion, um rekursive RLS-Lookups auf `nutzer` selbst zu vermeiden).

```sql
-- Hilfsfunktionen (konzeptionell, konkrete Migration folgt separat)
CREATE FUNCTION current_agentur_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER AS
  $$ SELECT agentur_id FROM nutzer WHERE id = auth.uid() AND deleted_at IS NULL $$;

CREATE FUNCTION current_rolle() RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER AS
  $$ SELECT rolle FROM nutzer WHERE id = auth.uid() AND deleted_at IS NULL $$;

CREATE FUNCTION ist_kunde_zugewiesen(p_kunde_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER AS
  $$ SELECT EXISTS (
       SELECT 1 FROM nutzer_kunden_zuweisungen
       WHERE nutzer_id = auth.uid() AND kunde_id = p_kunde_id AND deleted_at IS NULL
     ) $$;

CREATE FUNCTION darf_vorgang_sehen(p_vorgang_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER AS
  $$
    SELECT EXISTS (
      SELECT 1 FROM vorgaenge v
      WHERE v.id = p_vorgang_id
        AND v.agentur_id = current_agentur_id()
        AND (
          current_rolle() = 'chef'
          OR (current_rolle() = 'manager' AND ist_kunde_zugewiesen(v.kunde_id))
          OR (
            current_rolle() IN ('editor', 'reader')
            AND ist_kunde_zugewiesen(v.kunde_id)
            AND (v.sensitivity = 'normal' OR v.zustaendige_nutzer_id = auth.uid())
          )
          OR (
            current_rolle() = 'guest'
            AND EXISTS (
              SELECT 1 FROM nutzer_vorgang_freigaben f
              WHERE f.vorgang_id = v.id
                AND f.nutzer_id = auth.uid()
                AND f.ablauf_at > now()
            )
          )
        )
    )
  $$;
```

`darf_vorgang_sehen()` kapselt die vollständige Sichtbarkeits-Logik aus `vorgaenge_lesen` (Agentur-Check, Rollen-Check, Kunden-Zuweisung, Sensitivity-Regel, Guest-Freigabe) an einer einzigen Stelle. `vorgaenge_lesen` selbst sowie jede Tabelle, deren Sichtbarkeit vollständig vom referenzierten Vorgang abhängt (`anliegen`, `handler_aufrufe`), rufen dieselbe Funktion auf, statt die Logik zu duplizieren oder — wie zuvor bei `anliegen`/`handler_aufrufe` — nur einen reinen `EXISTS`-Check gegen `vorgaenge` zu machen, der lediglich Existenz, nicht Sichtbarkeit prüft.

Warum `SECURITY DEFINER` hier sicher ist: die Funktion nimmt genau einen Parameter entgegen (`p_vorgang_id`), keinen Nutzer- oder Rollen-Parameter. Jede interne Prüfung hängt an `auth.uid()` (Session-gebunden, nicht durch den Aufrufer überschreibbar) und an `v.agentur_id = current_agentur_id()`. Ein Aufrufer kann also höchstens eine beliebige `vorgang_id` übergeben, aber die Funktion liefert für einen Vorgang einer fremden Agentur oder eines nicht zugewiesenen Kunden `false`, weil dieselbe Agentur-/Rollen-/Zuweisungs-Prüfung greift wie in `vorgaenge_lesen`. Es gibt keinen Parameter-Durchgriff, über den sich eine höhere Berechtigung als die eigene Session erschleichen ließe.

#### `agenturen`

```sql
CREATE POLICY agentur_lesen ON agenturen FOR SELECT
  USING (id = current_agentur_id());
```

Kein Rollen-Unterschied. Alle Rollen sehen nur die eigene Agentur, niemand sieht andere Agenturen (Mandantentrennung Ebene 1, §9.1). Kein `INSERT`/`UPDATE`/`DELETE` über die Anwendungsschicht (Agentur-Anlage läuft über einen privilegierten Onboarding-Prozess außerhalb von RLS).

#### `kunden`

```sql
CREATE POLICY kunden_lesen ON kunden FOR SELECT
  USING (
    agentur_id = current_agentur_id()
    AND (current_rolle() IN ('chef') OR ist_kunde_zugewiesen(id))
  );

CREATE POLICY kunden_schreiben ON kunden FOR UPDATE
  USING (agentur_id = current_agentur_id() AND current_rolle() IN ('chef', 'manager'))
  WITH CHECK (agentur_id = current_agentur_id());
```

`chef` sieht alle Kunden der Agentur (§9.2: "kann Kunden anlegen"). `manager` und `editor` nur zugewiesene Kunden (§9.1). `reader`/`guest` folgen derselben Lese-Policy wie `editor` (kein `ist_kunde_zugewiesen`-Sonderfall nötig, weil Zuweisung für alle Nicht-Chef-Rollen gleich geprüft wird). Konfiguration (`UPDATE`) nur `chef` und `manager` bei zugewiesenen Kunden (§9.2: Editor "kann keine Kunden-Konfigurationen ändern").

#### `kunden_kontakte`

```sql
CREATE POLICY kunden_kontakte_lesen ON kunden_kontakte FOR SELECT
  USING (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR ist_kunde_zugewiesen(kunde_id))
  );
```

Gleiche Scoping-Logik wie `kunden`, weil Kontaktdaten pro Kunde denselben Sichtbarkeits-Scope teilen wie der Kunde selbst.

#### `nutzer`

```sql
CREATE POLICY nutzer_lesen ON nutzer FOR SELECT
  USING (agentur_id = current_agentur_id());
```

Jeder in der Agentur sieht die Team-Liste der eigenen Agentur (nötig für Zuweisungs-UI, Verteiler-Anzeige). Keine sensitiven Daten in dieser Tabelle. `INSERT`/`UPDATE` (Einladen, Rollen ändern) nur `chef` (§9.2: "kann Beraterinnen einladen, Berechtigungen setzen").

#### `nutzer_kunden_zuweisungen`

```sql
CREATE POLICY zuweisungen_lesen ON nutzer_kunden_zuweisungen FOR SELECT
  USING (agentur_id = current_agentur_id() AND (current_rolle() IN ('chef', 'manager') OR nutzer_id = auth.uid()));
```

`chef`/`manager` sehen alle Zuweisungen (Steuerungs-Überblick), `editor`/`reader` nur die eigenen. `INSERT`/`UPDATE`/`DELETE` (Zuweisen/Entziehen) nur `chef` (agenturweit) und `manager` (nur für Kunden, die der Manager selbst zugewiesen hat, §9.2 "kann Aufgaben an Beraterinnen weiterleiten").

#### `vorgaenge`

Das ist die Policy mit der in Aufgabe 2b korrigierten Semantik: Picking (Decision 1) ist agenturweit ohne Rollen-Filter, aber die RLS-Sicht für die Konsolen-Anzeige ist rollenabhängig gefiltert. Beides betrifft dieselbe Tabelle, aber unterschiedliche Zugriffspfade: der Klassifikations-Worker läuft mit einer Service-Role (bypassed RLS, wie in Supabase üblich für Hintergrund-Jobs), die Konsolen-UI läuft mit der Nutzer-Session und unterliegt der Policy unten.

```sql
CREATE POLICY vorgaenge_lesen ON vorgaenge FOR SELECT
  USING (darf_vorgang_sehen(id));

CREATE POLICY vorgaenge_schreiben ON vorgaenge FOR UPDATE
  USING (
    agentur_id = current_agentur_id()
    AND (
      -- chef: alle Vorgänge der Agentur bearbeiten
      current_rolle() = 'chef'
      -- manager: Vorgänge zugewiesener Kunden bearbeiten, inklusive sensitive
      OR (current_rolle() = 'manager' AND ist_kunde_zugewiesen(kunde_id))
      -- editor: Vorgänge zugewiesener Kunden, sensitive nur wenn zuständige Person
      OR (
        current_rolle() = 'editor'
        AND ist_kunde_zugewiesen(kunde_id)
        AND (sensitivity = 'normal' OR zustaendige_nutzer_id = auth.uid())
      )
      -- reader, guest: kein Zweig hier, siehe Anmerkung unten
    )
  )
  WITH CHECK (agentur_id = current_agentur_id());
```

`vorgaenge_lesen` ruft `darf_vorgang_sehen()` auf (siehe Helper-Funktionen oben) statt die Sichtbarkeits-Logik inline zu wiederholen. Das ist dieselbe Logik wie zuvor, jetzt an einer Stelle definiert, sodass `anliegen_lesen` und `handler_aufrufe_lesen` (unten) dieselbe Funktion statt eines reinen Existenz-Checks verwenden können.

`vorgaenge_schreiben` ist bewusst in getrennte, klar lesbare Rollen-Zweige geschrieben (statt einer verschachtelten ODER-Kette mit Manager-Ausnahme), analog zur Struktur, die `darf_vorgang_sehen()` für die Lese-Policy kapselt:

- **chef:** alle Vorgänge der Agentur bearbeiten.
- **manager:** Vorgänge zugewiesener Kunden bearbeiten, inklusive sensitive (kein Sensitivity-Zweig nötig, Manager steht explizit in der "darf sensitive sehen/bearbeiten"-Liste aus §9.3).
- **editor:** Vorgänge zugewiesener Kunden, sensitive nur wenn `zustaendige_nutzer_id = auth.uid()`.
- **reader:** keine Schreib-Policy (§9.2: "Kann Vorgänge sehen, aber nicht freigeben").
- **guest:** keine Schreib-Policy (§9.2 beschreibt die Externe Rolle rein lesend über freigegebene Einzel-Vorgänge, keine Bearbeitungsrechte erwähnt).

#### `anliegen` und `handler_aufrufe`

```sql
CREATE POLICY anliegen_lesen ON anliegen FOR SELECT
  USING (
    agentur_id = current_agentur_id()
    AND darf_vorgang_sehen(vorgang_id)
  );

CREATE POLICY handler_aufrufe_lesen ON handler_aufrufe FOR SELECT
  USING (
    agentur_id = current_agentur_id()
    AND darf_vorgang_sehen(vorgang_id)
  );
```

**Korrektur gegenüber der vorigen Fassung:** Die vorige Fassung prüfte hier nur `EXISTS (SELECT 1 FROM vorgaenge v WHERE v.id = anliegen.vorgang_id)`, also lediglich, ob der referenzierte Vorgang existiert, nicht ob der eingeloggte Nutzer ihn sehen darf. Der Kommentar in der vorigen Fassung behauptete, die `vorgaenge`-RLS greife "transitiv" über die referenzierte Zeile — das ist falsch: eine `USING`-Klausel auf `anliegen` löst keine erneute RLS-Auswertung auf `vorgaenge` aus, ein reiner `EXISTS`-Join sieht die Zielzeile unabhängig von deren eigener Policy. Das war ein Sicherheitsloch: ein `editor`, der einen sensitiven Vorgang nicht sehen darf (weil er nicht die zuständige Person ist), konnte über diese Policy trotzdem die `beschreibung` der `anliegen` und das komplette Handler-Ergebnis aus `handler_aufrufe` lesen, weil der reine Existenz-Check den Sensitivity-Schutz aus §9.3 nicht nachbildet.

`anliegen` und `handler_aufrufe` haben keine eigene Sensitivity-Spalte, sie erben die Sichtbarkeits-Entscheidung vollständig vom referenzierten `vorgang_id`. Die Policies oben prüfen deshalb `agentur_id` direkt (billiger Vorab-Filter, gleiche Performance-Begründung wie zuvor) und zusätzlich `darf_vorgang_sehen(vorgang_id)`, das dieselbe vollständige Rollen-, Zuweisungs- und Sensitivity-Logik wie `vorgaenge_lesen` anwendet, statt sie zu duplizieren oder nur die Existenz der Zielzeile zu prüfen.

#### `nutzer_vorgang_freigaben`

```sql
CREATE POLICY freigaben_lesen ON nutzer_vorgang_freigaben FOR SELECT
  USING (
    agentur_id = current_agentur_id()
    AND (current_rolle() IN ('chef', 'manager') OR nutzer_id = auth.uid())
  );

CREATE POLICY freigaben_anlegen ON nutzer_vorgang_freigaben FOR INSERT
  WITH CHECK (
    agentur_id = current_agentur_id()
    AND current_rolle() IN ('chef', 'manager')
    AND freigegeben_durch = auth.uid()
  );
```

`chef`/`manager` sehen alle Freigaben ihrer Agentur bzw. ihrer zugewiesenen Kunden (Überblick, wer welchem Guest was freigegeben hat). `guest` sieht nur die eigenen Freigaben (nötig, damit die Konsolen-UI dem Guest anzeigen kann, welche Vorgänge für ihn freigegeben sind und wann der Zugang abläuft).

**Korrektur gegenüber der vorigen Fassung:** Freigaben anlegen dürfen nur noch `chef` und `manager`, nicht mehr `editor`. Die vorige Fassung erlaubte auch dem `editor`, Guest-Freigaben zu erstellen, mit der Begründung, §9.2 nenne keine explizite Einschränkung. Das geht bei vertraulichkeits-sensitiven Kunden (Pharma-Kontext MENSCH) zu weit: Guest-Freigaben sind vertraulichkeits-relevant, weil sie einen Außen-Zugriff auf einen Vorgang eröffnen, und ein `editor` soll keine Außen-Zugriffe erzeugen können, ohne dass Chef oder Manager das kontrollieren. Reader/Guest selbst dürfen weiterhin keine eigenen oder fremden Freigaben erzeugen, sonst könnte ein Guest sich selbst Zugriff auf weitere Vorgänge verschaffen.

#### `audit_log`

```sql
CREATE POLICY audit_log_lesen ON audit_log FOR SELECT
  USING (
    agentur_id = current_agentur_id()
    AND (
      current_rolle() IN ('chef')
      OR (current_rolle() = 'manager' AND (vorgang_id IS NULL OR EXISTS (
            SELECT 1 FROM vorgaenge v WHERE v.id = audit_log.vorgang_id AND ist_kunde_zugewiesen(v.kunde_id)
          )))
      OR (current_rolle() IN ('editor', 'reader') AND nutzer_id = auth.uid())
    )
  );
```

`guest` bekommt keine `audit_log`-Policy (kein Zugriff, siehe Tabelle oben). Kein `UPDATE`/`DELETE` für irgendeine Rolle: `audit_log` ist strikt append-only (§10.2), Anonymisierung bei DSGVO-Löschung läuft über eine privilegierte Service-Funktion außerhalb der normalen Nutzer-RLS, nicht über eine reguläre `UPDATE`-Policy für Endnutzer-Rollen.

**Konsequenzen:**

- Der Klassifikations-Hintergrund-Job und die Handler-Worker laufen mit der Supabase Service-Role (RLS-Bypass), weil sie agenturweit über alle Kunden hinweg picken müssen (Decision 1, §12.1) und zum Picking-Zeitpunkt noch kein `zustaendige_nutzer_id` existiert, gegen den eine Nutzer-Session-Policy filtern könnte. Das ist kein "Umgehen der RLS" im Sinne von `AGENTS.md` §4 (das Verbot zielt auf Endnutzer-Zugriffe, nicht auf privilegierte, klar abgegrenzte Hintergrund-Prozesse), aber es bedeutet: der Worker-Code selbst trägt die Verantwortung für korrekte `agentur_id`-Filterung, weil ihn Postgres nicht mehr schützt. Das sollte in einer Test-Suite mit RLS-Assertions (`BUILD_PLAN_v1.0.md` Woche 2, Panel-Empfehlung Wächter) explizit mitgetestet werden, auch für den Service-Role-Pfad.
- Jede neue Tabelle mit `agentur_id` (siehe Decision 1) braucht mindestens eine `SELECT`-Policy nach demselben Muster, sonst blockiert RLS standardmäßig jeden Zugriff (Supabase-Default: RLS aktiviert, keine Policy = kein Zugriff für alle außer Service-Role). Das ist die sichere Ausfallrichtung, aber ein Onboarding-Schritt für zukünftige Migrations, den diese Decision hier explizit macht, nicht implizit lässt.
- `ist_kunde_zugewiesen()`, `current_rolle()` und `darf_vorgang_sehen()` als `SECURITY DEFINER`-Funktionen sind ein bewusster Bruch mit "RLS soll möglichst einfach sein": die ersten beiden sind nötig, um rekursive Policy-Auswertung auf `nutzer` selbst zu vermeiden (eine Policy auf `nutzer`, die wieder `nutzer` abfragt, um die eigene Rolle zu bestimmen, wäre zirkulär), `darf_vorgang_sehen()` kapselt die vollständige Sichtbarkeits-Logik für `vorgaenge` an einer Stelle, damit `anliegen_lesen`/`handler_aufrufe_lesen` sie wiederverwenden können, statt sie zu duplizieren oder nur einen Existenz-Check zu machen (siehe Korrektur oben zum vorigen RLS-Loch). Das ist Standard-Supabase-Praxis, aber sollte in der Migration mit Kommentar versehen werden, warum `SECURITY DEFINER` in jedem Fall sicher ist: kein Parameter-Durchgriff auf beliebige `nutzer_id`, nur `auth.uid()`, und bei `darf_vorgang_sehen()` zusätzlich kein Parameter-Durchgriff außer der `vorgang_id` selbst, die intern wieder gegen `agentur_id = current_agentur_id()` geprüft wird.

**Offene Fragen (für Bastian):** keine mehr offen für diese Decision. Die einzige übergreifende offene Frage (Verschlüsselung at-rest) ist in `docs/decisions/2026-07-10_datenmodell.md` dokumentiert, weil sie Datenmodell- statt RLS-Scope ist (RLS regelt wer eine Zeile sehen darf, nicht wie sie auf der Platte liegt).
