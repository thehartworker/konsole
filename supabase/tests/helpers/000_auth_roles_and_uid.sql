-- Minimaler auth-Schema-Stub, NUR für die RLS-Test-Suite, NICHT für Produktion.
--
-- In einer echten Supabase-Instanz liefert GoTrue das vollständige auth-Schema
-- (auth.users mit vielen Spalten, auth.uid(), auth.jwt(), die drei Standard-
-- Rollen anon/authenticated/service_role, uvm). Die RLS-Policies dieses
-- Projekts (siehe 20260711130200_helper_funktionen_und_rls.sql) rufen aus
-- diesem Schema ausschließlich auth.uid() auf. Dieser Stub bildet deshalb
-- bewusst nur genau das nach, was gebraucht wird:
--   - auth.users als FK-Ziel für nutzer.id (Migration 1)
--   - auth.uid(), auf der current_agentur_id()/current_rolle()/
--     ist_kunde_zugewiesen()/darf_vorgang_sehen() aufbauen (Migration 3)
--   - die drei Rollen anon/authenticated/service_role, gegen die Supabase
--     PostgREST-Zugriffe typischerweise ausführt
--
-- Muss VOR den Projekt-Migrations laufen, weil nutzer.id auf auth.users
-- referenziert.

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT SELECT ON auth.users TO anon, authenticated, service_role;

-- auth.uid() liest den eingeloggten Nutzer aus einer Session-GUC, die
-- PostgREST pro Request setzt. Zwei Varianten waren in freier Wildbahn im
-- Umlauf (voll-JSON "request.jwt.claims" versus geflachtes
-- "request.jwt.claim.sub"); dieser Stub bedient defensiv beide, damit die
-- Test-Suite unabhängig von der genauen GoTrue/PostgREST-Version robust
-- bleibt, siehe tests.authenticate_as() in 002_test_helpers.sql.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE AS
$$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
