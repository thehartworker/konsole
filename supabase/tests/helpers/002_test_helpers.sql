-- Test-Helfer für die RLS-Test-Suite.
--
-- tests.authenticate_as(p_nutzer_id) simuliert eine eingeloggte Supabase-
-- Session für den übergebenen nutzer.id-Wert: setzt die JWT-Claim-GUCs, die
-- auth.uid() ausliest (siehe 000_auth_roles_and_uid.sql), und wechselt per
-- SET LOCAL ROLE in die Rolle "authenticated", damit RLS-Policies wie in
-- einer echten PostgREST-Session ausgewertet werden (nicht als Owner/
-- Superuser, der RLS umgehen würde). SET LOCAL gilt nur bis zum Ende der
-- laufenden Transaktion, jede *.test.sql-Datei läuft deshalb in einem
-- eigenen BEGIN/ROLLBACK, siehe supabase/tests/README.md.

CREATE SCHEMA IF NOT EXISTS tests;

CREATE OR REPLACE FUNCTION tests.authenticate_as(p_nutzer_id uuid) RETURNS void
  LANGUAGE plpgsql AS
$$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_nutzer_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_nutzer_id, 'role', 'authenticated')::text,
    true
  );
  SET LOCAL ROLE authenticated;
END;
$$;

CREATE OR REPLACE FUNCTION tests.clear_authentication() RETURNS void
  LANGUAGE plpgsql AS
$$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RESET ROLE;
END;
$$;
