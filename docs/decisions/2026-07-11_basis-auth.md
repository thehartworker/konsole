# Basis-Auth für die Intake-Konsole

**Datum:** 2026-07-11
**Status:** vorgeschlagen

**Kontext:** Issue #20 (Woche 2, PR 2) verlangt eine Supabase-Auth-Einrichtung, mit der sich Nutzer einloggen können und ihre `agentur_id`/`rolle` zuverlässig für die RLS-Helfer `current_agentur_id()`/`current_rolle()` verfügbar sind. `docs/decisions/2026-07-10_rls-policies.md` legt diese beiden Funktionen bereits als `SECURITY DEFINER`-SQL-Funktionen fest, die aus der `nutzer`-Tabelle über `auth.uid()` lesen (nicht aus JWT-Claims). `nutzer.id` referenziert `auth.users.id` direkt (Migration `20260711130000_enums_und_basistabellen.sql`). Diese Decision legt fest, **wie** die Zeile in `nutzer` entsteht, wenn ein neuer `auth.users`-Eintrag angelegt wird, und wie Nutzer sich einloggen.

**Optionen:**

1. **Custom Access Token Hook:** Supabase-Hook, der `agentur_id`/`rolle` bei jeder Token-Ausstellung in die JWT-Claims schreibt. Die RLS-Helfer würden dann `auth.jwt() ->> 'agentur_id'` statt eines `nutzer`-Lookups lesen.
2. **`nutzer`-Tabellen-Verknüpfung per Datenbank-Trigger:** ein `AFTER INSERT`-Trigger auf `auth.users`, der bei jeder Nutzer-Anlage automatisch eine `nutzer`-Zeile erzeugt, mit `agentur_id`/`rolle`/`name` aus `raw_user_meta_data`. Die RLS-Helfer bleiben wie in der bestehenden Decision (Live-Lookup aus `nutzer` über `auth.uid()`).
3. Wie Option 2, aber ohne Trigger: Anwendungscode (Next.js Server Action) legt nach jedem Login/Signup die `nutzer`-Zeile explizit an.

**Entscheidung:** Option 2. Ein `AFTER INSERT`-Trigger auf `auth.users`, der `raw_user_meta_data` liest und synchron dieselbe Transaktion eine `nutzer`-Zeile anlegt.

Begründung gegen Option 1: `docs/decisions/2026-07-10_rls-policies.md` hat sich bereits für den Live-Lookup aus `nutzer` entschieden (`current_agentur_id()`/`current_rolle()` fragen bei jedem Policy-Check die Tabelle ab, nicht das JWT). Diese Wahl war implizit, aber sie ist bereits gebaut und von der PR-1-Test-Suite bewiesen. Ein Custom Access Token Hook würde dieselbe Information zusätzlich in die Claims duplizieren, ohne dass die RLS-Policies sie nutzen — reiner Mehraufwand ohne Sicherheitsgewinn. Der Live-Lookup hat zudem einen echten Vorteil gegenüber JWT-Claims: ändert ein Chef die Rolle einer Beraterin, greift die Änderung sofort bei der nächsten Query, nicht erst nach Ablauf/Refresh des bestehenden Access-Tokens (JWTs aus Supabase Auth sind standardmäßig eine Stunde gültig). Ein Hook wäre nötig, wenn die Policies selbst `auth.jwt()` läsen — das ist hier nicht der Fall und soll es auch nicht werden, um diese Inkonsistenz zu vermeiden.

Begründung gegen Option 3: Anwendungscode, der nach jedem Signup manuell eine `nutzer`-Zeile nachzieht, ist genau das Muster, das `AGENTS.md` §4 für RLS ablehnt ("keine Umgehung ... auch nicht kurz für Debugging") auf eine Ebene höher übertragen: ein vergessener Aufruf in einem einzigen Code-Pfad (z. B. ein zukünftiger zweiter Onboarding-Flow) hinterlässt einen `auth.users`-Eintrag ohne `nutzer`-Zeile. Für so einen Nutzer liefern `current_agentur_id()`/`current_rolle()` `NULL`, und jede RLS-Policy dieses Projekts fällt beim `NULL`-Vergleich sicher auf "kein Zugriff" zurück (sicherer Default) — aber der Nutzer wäre trotzdem eingeloggt und sähe eine leere, nicht erklärte Konsole, ohne dass irgendwo ein Fehler sichtbar würde. Ein Datenbank-Trigger macht die Verknüpfung strukturell unumgehbar, unabhängig davon, über welchen Code-Pfad (Admin-API, Supabase-Dashboard, künftiger zweiter Server-Endpunkt) der `auth.users`-Eintrag entsteht.

### Provisionierung: kein öffentlicher Self-Signup in v1

`SAAS_SPEC_v1.0_CONSOLE.md` §9.2 beschreibt Nutzer-Anlage ausschließlich als Chef-Aktion ("kann Beraterinnen einladen"), nicht als öffentliches Registrierungsformular. Deshalb:

- `supabase/config.toml` setzt `enable_signup = false`: der öffentliche `auth.signUp()`-Endpunkt ist deaktiviert, niemand kann sich ohne Einladung selbst registrieren.
- Jede Nutzer-Anlage läuft über die Supabase Admin-API (`auth.admin.inviteUserByEmail()` bzw. `auth.admin.createUser()`), aufgerufen mit dem `service_role`-Key ausschließlich von einem serverseitigen, privilegierten Kontext (nie im Browser, nie im Next.js-Client-Bundle). Der Aufruf übergibt `user_metadata` mit `agentur_id`, `rolle`, `name` (und bei `rolle = 'guest'` zusätzlich `guest_ablauf_at`) — genau die Felder, die der Trigger unten liest.
- Der allererste Chef-Zugang pro Agentur (Bootstrapping, bevor irgendein Chef existiert, der einladen könnte) ist laut `GESELLSCHAFT_UND_PILOT_v1.0.md` ohnehin ein manueller Onboarding-Schritt ("Chef-Rolle für die Auftraggeberin, Login-Daten" als Punkt der Onboarding-Checkliste). Dieser erste Zugang wird über denselben privilegierten Admin-API-Aufruf angelegt, nur manuell statt über eine spätere Invite-UI. Eine Invite-UI selbst (Chef lädt weitere Beraterinnen über die Konsole ein) ist nicht Teil dieser PR, weil sie eine `nutzer`-Schreib-Policy braucht, die `docs/decisions/2026-07-10_rls-policies.md` bewusst offengelassen hat ("Bewusst keine INSERT/UPDATE-Policy ... nur in Prosa beschrieben"). Bis dahin läuft jede Nutzer-Anlage über ein privilegiertes Skript/eine Admin-Route mit `service_role`.

### Trigger-Verhalten (fail-closed)

```sql
-- konzeptionell, siehe Migration für die konkrete Fassung
CREATE FUNCTION handle_new_user() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF NEW.raw_user_meta_data ->> 'agentur_id' IS NULL
     OR NEW.raw_user_meta_data ->> 'rolle' IS NULL THEN
    RAISE EXCEPTION 'auth.users-Anlage ohne agentur_id/rolle in user_metadata ist nicht erlaubt (nutzer-Verknuepfung, siehe 2026-07-11_basis-auth.md)';
  END IF;

  INSERT INTO nutzer (id, agentur_id, name, rolle, guest_ablauf_at)
  VALUES (
    NEW.id,
    (NEW.raw_user_meta_data ->> 'agentur_id')::uuid,
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.email),
    (NEW.raw_user_meta_data ->> 'rolle')::rolle,
    NULLIF(NEW.raw_user_meta_data ->> 'guest_ablauf_at', '')::timestamptz
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

Bewusst **fail-closed**: fehlt `agentur_id` oder `rolle` in den Metadaten, schlägt der komplette Insert (inklusive des `auth.users`-Eintrags, weil derselbe Transaktions-Kontext gilt) fehl, statt einen halb-provisionierten Nutzer ohne Agentur-Bindung zu erzeugen. Ein `guest` ohne `guest_ablauf_at` wird nicht gesondert abgefangen (die Spalte ist nullable), weil `nutzer_vorgang_freigaben` und `darf_vorgang_sehen()` die Sichtbarkeit ohnehin ausschließlich über die einzelne Freigabe (`ablauf_at`), nicht über `nutzer.guest_ablauf_at` selbst steuern (siehe RLS-Decision) — dieses Feld ist informativ für die Konsolen-UI, keine Sicherheitsgrenze.

`SECURITY DEFINER` ist hier notwendig (analog zu `current_agentur_id()` etc.), weil der Trigger während des Inserts in `auth.users` läuft, einer Tabelle im `auth`-Schema, auf die die Anwendungsrolle keinen Schreibzugriff auf `public.nutzer` voraussetzen soll. Kein Parameter-Durchgriff: die Funktion nimmt keine Eingabe außer der `NEW`-Zeile selbst entgegen, die von GoTrue (Supabase Auth), nicht vom Aufrufer der RLS-geschützten Endpunkte, gesetzt wird.

### Login-Flow (Next.js App Router, serverseitig)

`@supabase/ssr` mit Cookie-basiertem Server-Client (kein `localStorage`-Session-Handling im Client-Bundle, damit Server Components/Server Actions die Session lesen können). Ablauf:

1. `/login`-Seite (Server Component) rendert ein Formular.
2. Formular-Submit ruft eine Server Action auf, die `supabase.auth.signInWithPassword({ email, password })` gegen den Server-Client aufruft. Supabase Auth setzt die Session-Cookies serverseitig.
3. Middleware (`src/middleware.ts`) erneuert die Session bei jedem Request (Supabase-Standard-Pattern für `@supabase/ssr`) und leitet nicht eingeloggte Nutzer von geschützten Routen auf `/login` um.
4. Jede weitere Server-seitige Query (z. B. die Vorgangs-Liste in PR 3) nutzt denselben Cookie-gebundenen Server-Client, sodass Postgres den `auth.uid()` der eingeloggten Session sieht und RLS greift.

**Konsequenzen:**

- Jede künftige Nutzer-Anlage (Invite-UI, zweiter Bootstrapping-Weg, Test-Fixtures gegen eine echte Supabase-Instanz) muss `agentur_id` und `rolle` in `user_metadata` mitgeben, sonst schlägt der Insert fehl. Das ist beabsichtigt (fail-closed), aber ein Punkt, den zukünftige Onboarding-Flows kennen müssen.
- Rollenänderungen durch einen Chef sind in dieser PR noch nicht über die Konsole möglich (keine `nutzer`-Schreib-Policy, siehe oben). Bis dahin sind Rollenänderungen ein privilegierter `service_role`-Vorgang (direktes `UPDATE nutzer SET rolle = ...`), keine Anwendungs-Policy-Lücke, sondern bewusst aufgeschobener Scope aus der RLS-Decision.
- Die Invite-/Einladungs-UI selbst (Chef lädt Beraterinnen über die Konsole ein) ist nicht Teil dieser PR und braucht eine eigene Design-Decision, sobald sie gebaut wird (inklusive der noch offenen `nutzer`-Schreib-Policy).
- Passwort-Reset läuft über den Supabase-Auth-Standardflow (E-Mail mit Reset-Link), ohne Zusatz-Code in dieser PR; nur die Konfiguration (E-Mail-Provider aktiv, Signup deaktiviert) wird hier gesetzt.

**Offene Fragen (für Bastian):** keine strategischen. Eine technische Anmerkung: Supabase versendet Einladungs-/Reset-E-Mails über einen Default-SMTP-Server mit niedrigem Rate-Limit; für den MENSCH-Piloten (Woche 6 laut Bauplan) sollte rechtzeitig ein eigener SMTP-Provider in den Supabase-Auth-Einstellungen hinterlegt werden. Das ist ein Betriebs-/Ops-Punkt, keine Entscheidung, die diese PR blockiert.
