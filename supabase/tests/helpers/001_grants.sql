-- Tabellen-Grants für anon/authenticated/service_role, NUR für die
-- Test-Suite. Muss NACH den Projekt-Migrations laufen (die Tabellen müssen
-- existieren).
--
-- Postgres prüft Tabellen-Rechte VOR RLS-Policies: ohne diese Grants würde
-- jeder Zugriff bereits mit "permission denied for table" scheitern, bevor
-- überhaupt eine Policy ausgewertet wird, und die Test-Suite würde die
-- RLS-Policies gar nicht prüfen, sondern nur die fehlenden Grants. In einer
-- echten Supabase-Instanz vergibt die Plattform selbst vergleichbar breite
-- Tabellen-Grants an authenticated/anon und verlässt sich für die eigentliche
-- Zugriffskontrolle auf RLS, siehe docs/decisions/2026-07-10_rls-policies.md.
-- Diese Datei bildet das nach, bewusst etwas großzügiger als eine
-- produktive Supabase-Instanz (kein Feintuning pro Tabelle), damit die
-- Test-Suite ausschließlich die RLS-Policies selbst prüft, nicht zusätzlich
-- eine von dieser Datei nachgebildete Grant-Konfiguration.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- pgTAP installiert seine Assertion-Funktionen (plan(), ok(), is(), ...) in
-- das Schema, das beim CREATE EXTENSION aktiv ist (hier: public, siehe
-- CI-Job). Ohne EXECUTE-Grant könnte die Rolle "authenticated" die
-- Test-Funktionen selbst nicht aufrufen, sobald ein Test per
-- tests.authenticate_as() in ihre Rolle wechselt.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
