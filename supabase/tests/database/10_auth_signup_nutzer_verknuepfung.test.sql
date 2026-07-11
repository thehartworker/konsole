BEGIN;

-- Test-Fall (Issue #20, PR 2): der handle_new_user()-Trigger aus
-- 20260711140000_auth_nutzer_verknuepfung.sql erzeugt bei jeder
-- auth.users-Anlage zuverlaessig eine passende nutzer-Zeile, und die daraus
-- resultierende Session (auth.uid() = neue nutzer.id) bekommt ueber
-- current_agentur_id()/current_rolle() dieselben korrekten Werte wie ein
-- manuell in den Fixtures angelegter Nutzer. Das beweist, dass "ein
-- eingeloggter Nutzer die korrekten RLS-Werte hat" nicht nur fuer
-- vorab-fixturierte Test-Nutzer gilt, sondern fuer den tatsaechlichen
-- Anlage-Weg ueber auth.users.

SELECT plan(12);

-- ============================================================
-- 1. Erfolgreiche Anlage: agentur_id/rolle/name aus user_metadata
-- ============================================================

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (
  'a0000000-0000-0000-0000-000000000301',
  'neue.beraterin@agentur-a-test.example',
  jsonb_build_object(
    'agentur_id', 'a0000000-0000-0000-0000-000000000001',
    'rolle', 'editor',
    'name', 'Neue Beraterin (Test)'
  )
);

SELECT is(
  (SELECT count(*) FROM nutzer WHERE id = 'a0000000-0000-0000-0000-000000000301')::int, 1,
  'handle_new_user() legt bei auth.users-Insert automatisch genau eine nutzer-Zeile an'
);

SELECT is(
  (SELECT agentur_id FROM nutzer WHERE id = 'a0000000-0000-0000-0000-000000000301'),
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'agentur_id wird korrekt aus user_metadata uebernommen'
);

SELECT is(
  (SELECT rolle::text FROM nutzer WHERE id = 'a0000000-0000-0000-0000-000000000301'),
  'editor',
  'rolle wird korrekt aus user_metadata uebernommen'
);

SELECT is(
  (SELECT name FROM nutzer WHERE id = 'a0000000-0000-0000-0000-000000000301'),
  'Neue Beraterin (Test)',
  'name wird korrekt aus user_metadata uebernommen'
);

-- ============================================================
-- 2. guest_ablauf_at wird bei rolle = guest uebernommen
-- ============================================================

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (
  'a0000000-0000-0000-0000-000000000302',
  'gast@agentur-a-test.example',
  jsonb_build_object(
    'agentur_id', 'a0000000-0000-0000-0000-000000000001',
    'rolle', 'guest',
    'name', 'Neuer Gast (Test)',
    'guest_ablauf_at', (now() + interval '30 days')::text
  )
);

SELECT ok(
  (SELECT guest_ablauf_at FROM nutzer WHERE id = 'a0000000-0000-0000-0000-000000000302') > now(),
  'guest_ablauf_at wird aus user_metadata uebernommen und liegt in der Zukunft'
);

-- ============================================================
-- 3. Fail-closed: fehlende agentur_id bzw. fehlende rolle
-- ============================================================

SELECT throws_ok(
  $$ INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (
       'a0000000-0000-0000-0000-000000000303', 'ohne-agentur@example.com',
       jsonb_build_object('rolle', 'editor', 'name', 'Ohne Agentur (Test)')
     ) $$,
  'P0001',
  'auth.users-Insert ohne agentur_id in user_metadata schlaegt fehl (fail-closed)'
);

SELECT throws_ok(
  $$ INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (
       'a0000000-0000-0000-0000-000000000304', 'ohne-rolle@example.com',
       jsonb_build_object('agentur_id', 'a0000000-0000-0000-0000-000000000001', 'name', 'Ohne Rolle (Test)')
     ) $$,
  'P0001',
  'auth.users-Insert ohne rolle in user_metadata schlaegt fehl (fail-closed)'
);

SELECT is(
  (SELECT count(*) FROM auth.users WHERE id IN (
    'a0000000-0000-0000-0000-000000000303', 'a0000000-0000-0000-0000-000000000304'
  ))::int, 0,
  'fehlgeschlagene Inserts hinterlassen keine verwaisten auth.users-Zeilen (derselbe Transaktions-Kontext)'
);

-- ============================================================
-- 4. Die per Trigger angelegte Beraterin bekommt korrekte RLS-Werte und
-- Sichtbarkeit, sobald sie Kunde A1 zugewiesen ist (wie ein "echter" Login).
-- ============================================================

INSERT INTO nutzer_kunden_zuweisungen (nutzer_id, kunde_id) VALUES (
  'a0000000-0000-0000-0000-000000000301', 'a0000000-0000-0000-0000-000000000011'
);

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000301'); -- neue Beraterin

SELECT is(
  current_agentur_id(), 'a0000000-0000-0000-0000-000000000001'::uuid,
  'current_agentur_id() liefert fuer die per Trigger angelegte Beraterin die korrekte Agentur'
);

SELECT is(
  current_rolle(), 'editor',
  'current_rolle() liefert fuer die per Trigger angelegte Beraterin die korrekte Rolle'
);

SELECT is(
  (SELECT count(*) FROM vorgaenge WHERE kunde_id = 'a0000000-0000-0000-0000-000000000011')::int, 1,
  'die per Trigger angelegte Beraterin sieht den normalen Vorgang von Kunde A1 (RLS greift wie bei einem fixturierten Nutzer)'
);

SELECT is(
  (SELECT count(*) FROM vorgaenge WHERE kunde_id = 'a0000000-0000-0000-0000-000000000012')::int, 0,
  'die per Trigger angelegte Beraterin sieht keinen Vorgang von Kunde A2 (nicht zugewiesen)'
);

SELECT * FROM finish();
ROLLBACK;
