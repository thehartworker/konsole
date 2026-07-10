# Row-Level-Security-Konzept für die Intake-Konsole

**Datum:** 2026-07-10
**Status:** vorgeschlagen

## Kontext

Aufbauend auf [`2026-07-10_datenmodell.md`](./2026-07-10_datenmodell.md): jede der elf dort definierten Tabellen braucht RLS-Policies, die die Mandanten-Trennung (härteste Grenze), die Kunden-Zuweisung (Ebene 2) und die Sensitivity-Sichtbarkeit (Ebene 3) durchsetzen. AGENTS.md §4 nennt "Keine Umgehung der Row-Level-Security" als absolute Regel. Wie bei Decision 1 gilt derselbe Vorbehalt: `SAAS_SPEC_v0.1_CONSOLE.md` §9 (Mandanten- und Rollenmodell) ist nicht im Repo verfügbar, das exakte Drei-Ebenen-Modell (§9.1) und die genauen Rollen-Berechtigungen (§9.2/§9.3) sind daher aus dem Issue-Text und aus BUILD_PLAN_v1.0.md rekonstruiert, nicht aus der Original-Spec gelesen.

## Optionen

**Wie werden App-Rollen technisch abgebildet?**

1. **Native Postgres-Rollen** (`CREATE ROLE owner`, `GRANT owner TO ...`, Policies mit `TO owner, manager`): sauber getrennt, aber Supabase Auth vergibt allen eingeloggten Nutzer:innen dieselbe Postgres-Rolle (`authenticated`). Um native Rollen zu nutzen, müsste bei jedem Login ein `SET ROLE` je nach `agentur_nutzer.rolle` erfolgen — zusätzliche Komplexität in der Auth-Middleware, und Rollenwechsel (Beförderung editor → manager) würde eine Session-Invalidierung brauchen.
2. **App-Level-Rolle als Datenspalte** (`agentur_nutzer.rolle`), alle Policies laufen `TO authenticated` und prüfen die Rolle per Helper-Funktion innerhalb der `USING`/`WITH CHECK`-Klausel. Rollenwechsel wirkt sofort (keine Session-Abhängigkeit), Standard-Muster in Supabase-Projekten.

**Entscheidung:** Option 2. Alle Policies unten sind `TO authenticated` formuliert, die Rollenprüfung passiert über Helper-Funktionen. Das ist der in der Supabase-Community etablierte Weg und vermeidet die Session-Invalidierungs-Problematik von Option 1.

## Entscheidung

### Helper-Funktionen (Grundlage für alle Policies)

```sql
-- agentur_id des eingeloggten Nutzers
create function app.current_agentur_id() returns uuid
  language sql stable security definer
  set search_path = public
  as $$
    select agentur_id from agentur_nutzer
    where auth_user_id = auth.uid() and deleted_at is null and aktiv
  $$;

-- Rolle des eingeloggten Nutzers
create function app.current_rolle() returns text
  language sql stable security definer
  set search_path = public
  as $$
    select rolle from agentur_nutzer
    where auth_user_id = auth.uid() and deleted_at is null and aktiv
  $$;

-- agentur_nutzer.id des eingeloggten Nutzers
create function app.current_nutzer_id() returns uuid
  language sql stable security definer
  set search_path = public
  as $$
    select id from agentur_nutzer
    where auth_user_id = auth.uid() and deleted_at is null and aktiv
  $$;

-- hat der eingeloggte Nutzer eine aktive Zuweisung zu diesem Kunden?
create function app.hat_zuweisung(p_kunde_id uuid) returns boolean
  language sql stable security definer
  set search_path = public
  as $$
    select exists (
      select 1 from nutzer_kunden_zuweisung
      where agentur_nutzer_id = app.current_nutzer_id()
        and kunde_id = p_kunde_id
        and deleted_at is null
    )
  $$;
```

**Warum `security definer`:** `agentur_nutzer` und `nutzer_kunden_zuweisung` sind selbst RLS-geschützte Tabellen. Ohne `security definer` würde die Helper-Funktion beim Lookup wieder auf RLS treffen, das für den Lookup selbst schon `app.current_agentur_id()` bräuchte — eine Zirkel-Abhängigkeit. `security definer`-Funktionen laufen mit den Rechten des Funktions-Eigentümers (nicht des aufrufenden Nutzers) und umgehen damit gezielt und kontrolliert genau diesen einen engen Lookup. Das ist eine bewusste, eng begrenzte Ausnahme von "keine Umgehung von RLS" (AGENTS.md §4), keine allgemeine Umgehung: die Funktionen geben ausschließlich Daten über den *aufrufenden* Nutzer selbst zurück, nie über andere.

**Warum `stable`:** Postgres cached das Ergebnis einer `stable`-Funktion innerhalb eines einzelnen Statements. Bei einer Abfrage über tausend `vorgaenge`-Zeilen wird der Lookup also nicht tausendmal ausgeführt, sondern einmal pro Statement.

### Sichtbarkeits-Ebenen (Zusammenfassung, gilt für alle Tabellen unten)

- **Ebene 1 — Mandant:** `agentur_id = app.current_agentur_id()`. Ohne Ausnahme, für jede Rolle, auf jeder Tabelle.
- **Ebene 2 — Kunden-Zuweisung:** `editor` und `reader` sehen nur Zeilen, deren `kunde_id` (direkt oder über eine Elterntabelle) eine aktive `nutzer_kunden_zuweisung` hat. `owner` und `manager` sind von dieser Einschränkung ausgenommen (Annahme, siehe offene Fragen unten — Issue spricht nur von "Beraterinnen sehen nur ihre zugewiesenen Kunden", nennt owner/manager nicht explizit als Ausnahme, aber Abschnitt zu sensitiven Vorgängen setzt voraus, dass owner/manager grundsätzlich mehr sehen als die zuständige Beraterin allein).
- **Ebene 3 — Sensitivity:** bei `sensitivity <> 'normal'` zusätzlich zu Ebene 1+2 eingeschränkt auf `owner`, `manager` und die "zuständige Beraterin" (angenommen: `vorgaenge.zugewiesen_an = app.current_nutzer_id()`).
- **Guest:** eigene, sehr enge Policies unabhängig von Ebene 2/3, siehe unten.

---

### 1. `agenturen`

| Op | owner | manager | editor | reader | guest |
|---|---|---|---|---|---|
| SELECT | eigene Agentur | eigene Agentur | eigene Agentur | eigene Agentur | eigene Agentur |
| INSERT | nein (Onboarding läuft über Service-Role) | nein | nein | nein | nein |
| UPDATE | eigene Agentur, begrenzte Spalten (`name`, nicht `status`/`vertragsende`) | nein | nein | nein | nein |
| DELETE | nein | nein | nein | nein | nein |

```sql
create policy agenturen_select on agenturen for select to authenticated
  using (id = app.current_agentur_id());

create policy agenturen_update_owner on agenturen for update to authenticated
  using (id = app.current_agentur_id() and app.current_rolle() = 'owner')
  with check (id = app.current_agentur_id());
```

Kein INSERT/DELETE-Policy für `authenticated` — neue Agenturen entstehen nur über einen Onboarding-Prozess mit Service-Role (bypasst RLS ohnehin), Löschung einer ganzen Agentur ist ein administrativer Vorgang außerhalb der App.

### 2. `agentur_nutzer`

| Op | owner | manager | editor | reader | guest |
|---|---|---|---|---|---|
| SELECT | alle in eigener Agentur | alle in eigener Agentur | alle in eigener Agentur (für Zuweisungs-/Mention-Anzeige) | alle in eigener Agentur | nur eigene Zeile |
| INSERT | ja (einladen) | ja | nein | nein | nein |
| UPDATE | jede Zeile, inkl. `rolle` | jede Zeile, inkl. `rolle`, außer eigene Beförderung zu `owner` (Annahme, siehe offene Fragen) | nur eigene Zeile, außer `rolle` | nur eigene Zeile, außer `rolle` | nur eigene Zeile, außer `rolle` |
| DELETE (soft) | ja | ja | nein | nein | nein |

```sql
create policy agentur_nutzer_select on agentur_nutzer for select to authenticated
  using (
    agentur_id = app.current_agentur_id()
    or auth_user_id = auth.uid()
  );

create policy agentur_nutzer_insert on agentur_nutzer for insert to authenticated
  with check (
    agentur_id = app.current_agentur_id()
    and app.current_rolle() in ('owner', 'manager')
  );

-- Admin-Update: owner/manager können jede Zeile inkl. rolle ändern
create policy agentur_nutzer_update_admin on agentur_nutzer for update to authenticated
  using (agentur_id = app.current_agentur_id() and app.current_rolle() in ('owner', 'manager'))
  with check (agentur_id = app.current_agentur_id());

-- Selbst-Update: jede Rolle darf die eigene Zeile ändern, aber NICHT die eigene `rolle`
create policy agentur_nutzer_update_self on agentur_nutzer for update to authenticated
  using (auth_user_id = auth.uid())
  with check (
    auth_user_id = auth.uid()
    and rolle = (select rolle from agentur_nutzer where auth_user_id = auth.uid())
  );
```

Zwei separate UPDATE-Policies (Admin + Self) statt einer kombinierten: Postgres verknüpft mehrere permissive Policies für dieselbe Operation mit `OR`, das ist hier korrekt — entweder die Admin-Bedingung oder die Selbst-Bedingung muss zutreffen. Die `with check` auf der Self-Policy verhindert gezielt Privilege-Escalation (eine editor-Zeile kann sich nicht selbst zu `owner` machen), ohne ein separates Trigger-basiertes Konzept zu brauchen.

### 3. `kunden`

| Op | owner | manager | editor | reader | guest |
|---|---|---|---|---|---|
| SELECT | alle in Agentur | alle in Agentur | nur zugewiesene | nur zugewiesene | nur der Kunde des freigegebenen Vorgangs |
| INSERT | ja | ja | nein | nein | nein |
| UPDATE | ja | ja | nur zugewiesene, begrenzte Felder (Annahme: Stammdaten, nicht `status`) | nein | nein |
| DELETE (soft) | ja | nein (Annahme: Kunden-Löschung ist Chef-Sache) | nein | nein | nein |

```sql
create policy kunden_select on kunden for select to authenticated
  using (
    agentur_id = app.current_agentur_id()
    and (
      app.current_rolle() in ('owner', 'manager')
      or app.hat_zuweisung(id)
      or exists (
        select 1 from vorgang_freigaben vf
        join vorgaenge v on v.id = vf.vorgang_id
        where v.kunde_id = kunden.id
          and vf.gast_nutzer_id = app.current_nutzer_id()
          and vf.gueltig_bis > now()
          and vf.deleted_at is null
      )
    )
  );

create policy kunden_insert on kunden for insert to authenticated
  with check (agentur_id = app.current_agentur_id() and app.current_rolle() in ('owner', 'manager'));

create policy kunden_update on kunden for update to authenticated
  using (
    agentur_id = app.current_agentur_id()
    and (app.current_rolle() in ('owner', 'manager') or (app.current_rolle() = 'editor' and app.hat_zuweisung(id)))
  )
  with check (agentur_id = app.current_agentur_id());

create policy kunden_delete on kunden for delete to authenticated
  using (agentur_id = app.current_agentur_id() and app.current_rolle() = 'owner');
```

### 4. `kunden_kontakte`

Gleiches Muster wie `kunden`, Sichtbarkeit über `kunde_id`:

| Op | owner | manager | editor | reader | guest |
|---|---|---|---|---|---|
| SELECT | alle in Agentur | alle in Agentur | nur zugewiesene Kunden | nur zugewiesene Kunden | nein |
| INSERT | ja | ja | nur zugewiesene Kunden | nein | nein |
| UPDATE | ja | ja | nur zugewiesene Kunden | nein | nein |
| DELETE (soft) | ja | ja | nein | nein | nein |

```sql
create policy kunden_kontakte_select on kunden_kontakte for select to authenticated
  using (
    agentur_id = app.current_agentur_id()
    and (app.current_rolle() in ('owner', 'manager') or app.hat_zuweisung(kunde_id))
  );

create policy kunden_kontakte_write on kunden_kontakte for insert to authenticated
  with check (
    agentur_id = app.current_agentur_id()
    and (app.current_rolle() in ('owner', 'manager') or (app.current_rolle() = 'editor' and app.hat_zuweisung(kunde_id)))
  );

create policy kunden_kontakte_update on kunden_kontakte for update to authenticated
  using (
    agentur_id = app.current_agentur_id()
    and (app.current_rolle() in ('owner', 'manager') or (app.current_rolle() = 'editor' and app.hat_zuweisung(kunde_id)))
  )
  with check (agentur_id = app.current_agentur_id());

create policy kunden_kontakte_delete on kunden_kontakte for delete to authenticated
  using (agentur_id = app.current_agentur_id() and app.current_rolle() in ('owner', 'manager'));
```

Guest bekommt hier bewusst **kein** SELECT: die Freigabe gilt für einen Vorgang, nicht für die volle Kontaktdatenbank eines Kunden. Anzeige des Absender-Namens im freigegebenen Vorgang läuft über `vorgaenge.sender_anzeige_name` (denormalisierter Snapshot), nicht über einen Join auf `kunden_kontakte`.

### 5. `kunden_konfiguration`

Sensible Einstellungen (Autonomie-Level, aktive Handler) — enger als `kunden` selbst:

| Op | owner | manager | editor | reader | guest |
|---|---|---|---|---|---|
| SELECT | alle in Agentur | alle in Agentur | nur zugewiesene | nur zugewiesene | nein |
| INSERT | ja | ja | nein | nein | nein |
| UPDATE | ja | ja | nein | nein | nein |
| DELETE (soft) | ja | nein | nein | nein | nein |

```sql
create policy kunden_konfiguration_select on kunden_konfiguration for select to authenticated
  using (
    agentur_id = app.current_agentur_id()
    and (app.current_rolle() in ('owner', 'manager') or app.hat_zuweisung(kunde_id))
  );

create policy kunden_konfiguration_write on kunden_konfiguration for insert to authenticated
  with check (agentur_id = app.current_agentur_id() and app.current_rolle() in ('owner', 'manager'));

create policy kunden_konfiguration_update on kunden_konfiguration for update to authenticated
  using (agentur_id = app.current_agentur_id() and app.current_rolle() in ('owner', 'manager'))
  with check (agentur_id = app.current_agentur_id());
```

**Begründung, warum `editor` hier nur lesen darf:** Autonomie-Level und aktive Handler bestimmen, wie viel das System *ohne* menschliche Prüfung tut — eine Fehlkonfiguration hat direkte Kunden-Auswirkung. Das ist eine Annahme (im Issue nicht explizit geregelt), aber konsistent mit der generellen Linie "sensible operative Hebel bleiben bei owner/manager".

### 6. `nutzer_kunden_zuweisung`

| Op | owner | manager | editor | reader | guest |
|---|---|---|---|---|---|
| SELECT | alle in Agentur | alle in Agentur | nur eigene Zuweisungen | nur eigene Zuweisungen | nein |
| INSERT | ja | ja | nein | nein | nein |
| UPDATE | — (kein Update-Fall, nur Insert/Soft-Delete) | | | | |
| DELETE (soft) | ja | ja | nein | nein | nein |

```sql
create policy zuweisung_select on nutzer_kunden_zuweisung for select to authenticated
  using (
    agentur_id = app.current_agentur_id()
    and (app.current_rolle() in ('owner', 'manager') or agentur_nutzer_id = app.current_nutzer_id())
  );

create policy zuweisung_insert on nutzer_kunden_zuweisung for insert to authenticated
  with check (agentur_id = app.current_agentur_id() and app.current_rolle() in ('owner', 'manager'));

create policy zuweisung_delete on nutzer_kunden_zuweisung for delete to authenticated
  using (agentur_id = app.current_agentur_id() and app.current_rolle() in ('owner', 'manager'));
```

Kein UPDATE-Policy: eine Zuweisung wird laut Datenmodell nicht geändert, sondern soft-deleted und bei Bedarf neu angelegt (Historie bleibt nachvollziehbar — "wer hatte wann Zugriff auf welchen Kunden" ist selbst eine relevante Audit-Frage).

### 7. `vorgaenge`

Die wichtigste und komplexeste Policy-Gruppe, wegen Ebene 3 (Sensitivity).

| Op | owner | manager | editor | reader | guest |
|---|---|---|---|---|---|
| SELECT | alle in Agentur | alle in Agentur | zugewiesene Kunden, sensitive nur wenn `zugewiesen_an = ich` | zugewiesene Kunden, sensitive nur wenn `zugewiesen_an = ich` | nur der freigegebene Vorgang |
| INSERT | ja | ja | ja, für zugewiesene Kunden (manuelle Ablage) | nein | nein |
| UPDATE | ja | ja | zugewiesene Kunden, sensitive nur wenn `zugewiesen_an = ich` | nein | nein |
| DELETE (soft) | ja | ja | nein | nein | nein |

```sql
create policy vorgaenge_select on vorgaenge for select to authenticated
  using (
    agentur_id = app.current_agentur_id()
    and (
      app.current_rolle() in ('owner', 'manager')
      or (
        app.hat_zuweisung(kunde_id)
        and (sensitivity = 'normal' or zugewiesen_an = app.current_nutzer_id())
      )
      or exists (
        select 1 from vorgang_freigaben vf
        where vf.vorgang_id = vorgaenge.id
          and vf.gast_nutzer_id = app.current_nutzer_id()
          and vf.gueltig_bis > now()
          and vf.deleted_at is null
      )
    )
  );

create policy vorgaenge_insert on vorgaenge for insert to authenticated
  with check (
    agentur_id = app.current_agentur_id()
    and (
      app.current_rolle() in ('owner', 'manager')
      or (app.current_rolle() = 'editor' and app.hat_zuweisung(kunde_id))
    )
  );

create policy vorgaenge_update on vorgaenge for update to authenticated
  using (
    agentur_id = app.current_agentur_id()
    and (
      app.current_rolle() in ('owner', 'manager')
      or (
        app.current_rolle() = 'editor'
        and app.hat_zuweisung(kunde_id)
        and (sensitivity = 'normal' or zugewiesen_an = app.current_nutzer_id())
      )
    )
  )
  with check (agentur_id = app.current_agentur_id());

create policy vorgaenge_delete on vorgaenge for delete to authenticated
  using (agentur_id = app.current_agentur_id() and app.current_rolle() in ('owner', 'manager'));
```

**Reader-INSERT bewusst ausgeschlossen:** Reader ist laut Rollen-Namen eine Lese-Rolle; das Issue nennt keine explizite Bestätigung dafür, aber es wäre inkonsistent, wenn "reader" schreiben dürfte. Falls das falsch ist, siehe offene Fragen.

Die `vorgaenge_update`-Policy vermischt Ebene 2 und Ebene 3 in einer `USING`-Klausel; das ist die Kern-Policy, die in Decision-2-Tests am intensivsten geprüft werden muss (siehe Test-Strategie unten), weil ein Fehler hier bedeutet, dass eine unzuständige Beraterin einen `krise`-Vorgang lesen oder ändern könnte.

Für Ingestion (E-Mail/WhatsApp-Webhook, LLM-Klassifikation) ist keine dieser Policies relevant — diese Prozesse laufen über die Service-Role (Supabase `service_role`-Key in einer Edge Function), die RLS grundsätzlich umgeht. Das ist eine bewusste, dokumentierte Ausnahme (kein Nutzer-Kontext vorhanden, es gibt keinen `auth.uid()` für einen Webhook), keine Aufweichung der Policy selbst.

### 8. `anliegen`

Erbt die Sichtbarkeit vom übergeordneten `vorgang` (kein eigenes `kunde_id`/`sensitivity`-Feld, daher Join, aber `agentur_id` bleibt denormalisiert für die Mandanten-Prüfung):

```sql
create policy anliegen_select on anliegen for select to authenticated
  using (
    agentur_id = app.current_agentur_id()
    and exists (
      select 1 from vorgaenge v
      where v.id = anliegen.vorgang_id
        -- v ist bereits durch dessen eigene RLS-Policy gefiltert;
        -- dieser Join re-implementiert absichtlich dieselbe Bedingung,
        -- weil RLS-Policies sich nicht gegenseitig als Sicherheitsgarantie verlassen dürfen
        and (
          app.current_rolle() in ('owner', 'manager')
          or (
            app.hat_zuweisung(v.kunde_id)
            and (v.sensitivity = 'normal' or v.zugewiesen_an = app.current_nutzer_id())
          )
          or exists (
            select 1 from vorgang_freigaben vf
            where vf.vorgang_id = v.id
              and vf.gast_nutzer_id = app.current_nutzer_id()
              and vf.gueltig_bis > now()
              and vf.deleted_at is null
          )
        )
    )
  );
```

INSERT/UPDATE/DELETE folgen demselben Muster wie `vorgaenge_insert`/`_update`/`_delete`, mit demselben Join. Aus Platzgründen hier nicht ausgeschrieben, gleiches Prinzip.

**Wichtiger Hinweis:** die Wiederholung der `vorgaenge`-Bedingung in der `anliegen`-Policy ist beabsichtigt, keine Redundanz zum Löschen. Eine RLS-Policy auf Tabelle B darf sich nicht darauf verlassen, dass Tabelle A "schon gefiltert" wurde — Postgres wertet Policies pro Tabelle unabhängig aus, ein `JOIN` auf eine andere Tabelle sieht immer *alle* Zeilen dieser Tabelle für den Zweck der `EXISTS`-Prüfung selbst, es sei denn man formuliert das (wie hier) explizit über die eigentliche Sichtbarkeitsbedingung.

### 9. `handler_aufrufe`

Rein systemgesteuerte Queue: kein INSERT/UPDATE für App-Rollen, nur Monitoring-SELECT.

| Op | owner | manager | editor | reader | guest |
|---|---|---|---|---|---|
| SELECT | alle in Agentur | alle in Agentur | zugewiesene Kunden (über `anliegen` → `vorgaenge`) | zugewiesene Kunden | nein |
| INSERT/UPDATE/DELETE | nein (nur Service-Role/Worker) | nein | nein | nein | nein |

```sql
create policy handler_aufrufe_select on handler_aufrufe for select to authenticated
  using (
    agentur_id = app.current_agentur_id()
    and (
      app.current_rolle() in ('owner', 'manager')
      or exists (
        select 1 from anliegen a
        join vorgaenge v on v.id = a.vorgang_id
        where a.id = handler_aufrufe.anliegen_id
          and app.hat_zuweisung(v.kunde_id)
          and (v.sensitivity = 'normal' or v.zugewiesen_an = app.current_nutzer_id())
      )
    )
  );
```

Kein Schreib-Policy für `authenticated`: die Handler-Worker laufen mit Service-Role. Damit ist ausgeschlossen, dass eine Beraterin über die Konsole direkt einen Handler-Aufruf manipuliert (z. B. `output_payload` fälschen).

### 10. `audit_log`

Append-only. Kein UPDATE-, kein DELETE-Policy für irgendeine Rolle. Kein direktes INSERT-Policy für `authenticated` — Einträge entstehen ausschließlich über `security definer`-Trigger-Funktionen auf den überwachten Tabellen (laufen mit den Rechten des Funktions-Eigentümers, nicht des Nutzers, und umgehen RLS auf `audit_log` genauso wie oben bei den Helper-Funktionen).

| Op | owner | manager | editor | reader | guest |
|---|---|---|---|---|---|
| SELECT | alle in Agentur | alle in Agentur | nur eigene Aktionen | nein (Annahme, siehe offene Fragen) | nein |
| INSERT | nein (nur via Trigger-Funktion) | nein | nein | nein | nein |
| UPDATE | nein | nein | nein | nein | nein |
| DELETE | nein | nein | nein | nein | nein |

```sql
create policy audit_log_select on audit_log for select to authenticated
  using (
    agentur_id = app.current_agentur_id()
    and (
      app.current_rolle() in ('owner', 'manager')
      or (app.current_rolle() = 'editor' and akteur_id = app.current_nutzer_id())
    )
  );

-- bewusst: keine INSERT/UPDATE/DELETE-Policy für `authenticated`.
-- Ohne passende Policy verweigert RLS die Operation per Default (deny-by-default).
```

**DSGVO-Sonderfall (Löschantrag, siehe Decision 1):** die Funktion `dsgvo_anonymisiere_kontakt(...)` ist `security definer` und läuft mit den Rechten ihres Eigentümers, der (anders als `authenticated`) nicht durch die obigen Policies eingeschränkt ist. Sie selbst führt aber kein `UPDATE` auf `audit_log` aus — sie fügt einen neuen `audit_log`-Eintrag *hinzu* (`aktion = 'dsgvo.loeschung_durchgefuehrt'`), der die Anonymisierung dokumentiert. `audit_log` selbst bleibt damit lückenlos append-only, auch im DSGVO-Fall. Die "Ausnahme über eine SECURITY DEFINER-Funktion" aus dem Issue bezieht sich strukturell auf die Änderung an `kunden_kontakte`/`vorgaenge`, nicht auf eine Änderung an `audit_log` selbst — das ist eine Klarstellung, die im Issue-Text nicht ganz eindeutig war (siehe PR-Beschreibung).

### 11. `vorgang_freigaben`

| Op | owner | manager | editor | reader | guest |
|---|---|---|---|---|---|
| SELECT | alle in Agentur | alle in Agentur | eigene erstellte Freigaben | nein | nur eigene erhaltene Freigaben |
| INSERT | ja | ja | ja, für Vorgänge zugewiesener Kunden | nein | nein |
| UPDATE | — (kein Anwendungsfall, nur Soft-Delete) | | | | |
| DELETE (soft, = Widerruf) | ja | ja | eigene erstellte Freigaben | nein | nein |

```sql
create policy freigaben_select on vorgang_freigaben for select to authenticated
  using (
    agentur_id = app.current_agentur_id()
    and (
      app.current_rolle() in ('owner', 'manager')
      or freigegeben_von = app.current_nutzer_id()
      or gast_nutzer_id = app.current_nutzer_id()
    )
  );

create policy freigaben_insert on vorgang_freigaben for insert to authenticated
  with check (
    agentur_id = app.current_agentur_id()
    and freigegeben_von = app.current_nutzer_id()
    and (
      app.current_rolle() in ('owner', 'manager')
      or exists (
        select 1 from vorgaenge v
        where v.id = vorgang_freigaben.vorgang_id and app.hat_zuweisung(v.kunde_id)
      )
    )
  );

create policy freigaben_delete on vorgang_freigaben for delete to authenticated
  using (
    agentur_id = app.current_agentur_id()
    and (app.current_rolle() in ('owner', 'manager') or freigegeben_von = app.current_nutzer_id())
  );
```

---

## Konsequenzen

- Jede Tabelle folgt demselben dreistufigen Muster (Mandant → Kunden-Zuweisung → Sensitivity), was Policies vorhersehbar und review-fähig macht, aber bedeutet auch: eine Änderung an der `hat_zuweisung`-Helper-Funktion wirkt sich auf praktisch jede Tabelle im System aus. Änderungen daran brauchen die volle Test-Suite (unten), nicht nur einen Spot-Check.
- `security definer`-Funktionen sind ein notwendiger, aber sensibler Baustein (vier Helper-Funktionen plus die DSGVO-Anonymisierungs-Funktion). Jede davon ist ein potenzieller RLS-Bypass, falls sie fehlerhaft geschrieben wird (z. B. wenn sie mehr zurückgibt als nur Daten des aufrufenden Nutzers). Code-Review-Fokus für die spätere Migration.
- Reader/Guest sind in mehreren Tabellen komplett ausgeschlossen (`kunden_kontakte`, `kunden_konfiguration`, `handler_aufrufe` für Guest; `audit_log` für Reader). Das ist eine bewusst konservative Grundhaltung — lieber zu wenig Sichtbarkeit vorschlagen und im Review erweitern, als zu viel vorschlagen und eine Datenschutz-Lücke übersehen.
- Die Ingestion-Pipeline (Webhook → Klassifikation → `vorgaenge`-INSERT) läuft vollständig über die Supabase Service-Role außerhalb dieser Policies. Das muss in einer separaten Decision zur Klassifikations-Layer-Schnittstelle (BUILD_PLAN Woche 1, Freitag) sauber von der App-Rollen-RLS abgegrenzt dokumentiert werden, damit niemand versehentlich annimmt, RLS würde auch die Ingestion absichern.

## Test-Strategie

**Werkzeug:** pgTAP (Postgres-natives Test-Framework) oder ein leichtgewichtiger Test-Harness, der pro Testfall via `set local role authenticated; set local request.jwt.claims = '{"sub": "<auth_user_id>"}';` einen konkreten Nutzer simuliert und dann Queries gegen die echten Tabellen fährt. Tests laufen gegen eine Fixture mit **mindestens zwei Agenturen**, damit Mandanten-Leckage überhaupt beobachtbar ist (ein Test mit nur einer Agentur kann eine fehlende `agentur_id`-Prüfung nicht aufdecken).

**Fixture-Minimum:**
- 2 Agenturen (A, B)
- pro Agentur: 1 owner, 1 manager, 2 editor, 1 reader, 1 guest
- pro Agentur: 2 Kunden, davon einer nur editor-1 zugewiesen, der andere nur editor-2
- pro Kunde: je 1 Vorgang mit `sensitivity = 'normal'` und 1 mit `sensitivity = 'krise'`, letzterer `zugewiesen_an` editor-1
- 1 aktive und 1 abgelaufene `vorgang_freigaben`-Zeile für den Guest

**Mindest-Testfälle (pro Tabelle, so weit anwendbar):**

1. **Mandanten-Hard-Boundary:** owner/manager/editor/reader von Agentur A kann über keine der elf Tabellen irgendeine Zeile von Agentur B lesen, ändern, einfügen oder löschen — auch nicht über einen Join-Umweg (z. B. `anliegen` von B über eine erratene `vorgang_id`). Dieser Test läuft für jede Tabelle einzeln, nicht nur stichprobenartig, weil genau das die "härteste Grenze" aus dem Issue ist.
2. **Ebene 2, positiv:** editor-1 sieht/ändert Vorgänge von Kunde 1 (zugewiesen).
3. **Ebene 2, negativ:** editor-1 sieht **keine** Vorgänge von Kunde 2 (nicht zugewiesen), obwohl beide in derselben Agentur sind.
4. **Ebene 3, negativ:** editor-1, zugewiesen zu Kunde 1, sieht **keinen** `krise`-Vorgang von Kunde 1, der einem anderen editor `zugewiesen_an` ist.
5. **Ebene 3, positiv:** editor-1 sieht den `krise`-Vorgang, der ihm selbst `zugewiesen_an` ist.
6. **Owner/Manager-Override:** owner und manager sehen alle Vorgänge (normal und sensitiv) aller Kunden ihrer Agentur, unabhängig von `nutzer_kunden_zuweisung`.
7. **Reader ist rein lesend:** für jede Tabelle mit Reader-Sichtbarkeit schlägt jeder INSERT/UPDATE/DELETE-Versuch fehl.
8. **Guest-Isolation:** Guest sieht ausschließlich den einen freigegebenen Vorgang plus dessen `anliegen`, nicht die übrige Vorgangsliste des Kunden, nicht `kunden_kontakte`, nicht `handler_aufrufe` anderer Vorgänge.
9. **Guest-Ablauf:** nach `gueltig_bis` verliert der Guest den Zugriff auf denselben Vorgang, ohne dass eine Zeile geändert werden musste (reiner Zeit-Effekt der Policy).
10. **Privilege-Escalation:** ein editor kann die eigene `agentur_nutzer.rolle` nicht auf `owner` setzen (auch nicht durch geschickte `UPDATE ... WHERE`-Formulierung).
11. **Audit-Log-Unveränderlichkeit:** kein Test-Nutzer, auch nicht owner, kann einen bestehenden `audit_log`-Eintrag per `UPDATE` oder `DELETE` verändern. Direktes `INSERT` als `authenticated` schlägt ebenfalls fehl (nur der Trigger-Pfad funktioniert).
12. **Audit-Log-Sichtbarkeit:** editor sieht nur `akteur_id = eigene id`-Einträge, owner/manager sehen alle Einträge der Agentur, kein Editor sieht Einträge anderer Editors.
13. **Soft-Delete-Konsistenz:** eine soft-deleted Zeile (`deleted_at is not null`) ist für keine Rolle über die normalen SELECT-Policies sichtbar, auch nicht für owner (offene Frage, ob owner eine "Papierkorb"-Ansicht braucht — aktuell nicht vorgesehen).
14. **`hat_zuweisung`-Regressionstest:** nach Entzug einer Zuweisung (Soft-Delete auf `nutzer_kunden_zuweisung`) verliert der Nutzer sofort (nächstes Statement) den Zugriff, ohne Session-Neustart.
15. **Denormalisierungs-Konsistenz:** ein Test, der stichprobenartig prüft, dass `agentur_id` auf `vorgaenge`/`anliegen`/`handler_aufrufe`/etc. tatsächlich mit der `agentur_id` der referenzierten `kunden`-Zeile übereinstimmt — keine RLS-Policy im engeren Sinn, aber eine Voraussetzung dafür, dass die denormalisierten Policies überhaupt korrekt sind. Sollte zusätzlich als `CHECK`-Constraint oder Trigger in der Migration abgesichert werden, nicht nur getestet.

**CI-Einbindung:** diese Tests laufen bei jedem PR, der `supabase/migrations/**` verändert (AGENTS.md §3.3 "Tests laufen in CI bei jedem PR"), nicht nur bei PRs, die RLS explizit erwähnen — eine unabsichtliche Nebenwirkung einer Migration auf eine andere Tabelle ist genau das Risiko, das BUILD_PLAN Woche 2 als "RLS-Policies sind komplex und fehleranfällig" benennt.

## Offene Fragen für Bastian

1. **Owner/Manager-Ausnahme von Ebene 2:** ist die Annahme korrekt, dass owner/manager *immer* agenturweite Sichtbarkeit haben, unabhängig von `nutzer_kunden_zuweisung`? Das Issue sagt das nicht explizit, ich habe es aus dem Sensitivity-Absatz erschlossen.
2. **Reader-Sichtbarkeit auf `audit_log`:** aktuell komplett ausgeschlossen, weil das Issue nur owner/manager/editor nennt. Absichtlich oder Lücke in der Aufzählung?
3. **Editor-Schreibrechte auf `kunden`/`kunden_kontakte`:** aktuell auf zugewiesene Kunden begrenzt angenommen, im Issue nicht spezifiziert.
4. **Owner-Selbst-Degradierung:** darf ein owner die eigene Rolle ändern (z. B. sich selbst zu manager degradieren)? Aktuell technisch erlaubt (owner ist von der Selbst-Rollenänderungs-Sperre ausgenommen), aber nicht bewusst entschieden.
5. **"Papierkorb"-Ansicht für owner:** soll owner soft-deleted Zeilen einsehen können (z. B. um eine versehentliche Löschung rückgängig zu machen)? Aktuell nicht vorgesehen, könnte eine zwölfte Policy-Kategorie "owner sieht auch deleted_at is not null" pro Tabelle brauchen.
6. **DSGVO-Funktion und Audit-Log:** Klarstellung nötig, ob "Ausnahme über SECURITY DEFINER-Funktion" aus dem Issue tatsächlich nur `kunden_kontakte`/`vorgaenge` meint (wie hier umgesetzt) oder ob auch direkte Änderungen an bestehenden `audit_log`-Zeilen vorgesehen waren.
7. Wie bei Decision 1: ohne `SAAS_SPEC_v0.1_CONSOLE.md` §9 konnte das Drei-Ebenen-Modell nicht im Original verifiziert werden, alle Policies sind aus dem Issue-Text und Analogieschlüssen rekonstruiert.
