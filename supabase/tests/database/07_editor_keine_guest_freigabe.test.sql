-- Test-Fall 7 (Issue #20): Ein editor kann KEINE Guest-Freigabe anlegen
-- (nur chef/manager). docs/decisions/2026-07-10_rls-policies.md,
-- "Korrektur gegenüber der vorigen Fassung": die vorige Fassung erlaubte
-- auch editor Guest-Freigaben, wurde bewusst auf chef/manager verschärft,
-- weil Guest-Freigaben einen Außen-Zugriff eröffnen (Pharma-Kontext MENSCH).

BEGIN;
SELECT plan(3);

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000103'); -- editor_a1
SELECT throws_like(
  $$ INSERT INTO nutzer_vorgang_freigaben (nutzer_id, vorgang_id, ablauf_at, freigegeben_durch)
     VALUES ('a0000000-0000-0000-0000-000000000106', 'a0000000-0000-0000-0000-000000001001', now() + interval '1 day', 'a0000000-0000-0000-0000-000000000103') $$,
  '%row-level security policy%',
  'editor_a1 kann KEINE Guest-Freigabe anlegen, RLS-Policy blockt den INSERT'
);

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000101'); -- chef_a
SELECT lives_ok(
  $$ INSERT INTO nutzer_vorgang_freigaben (nutzer_id, vorgang_id, ablauf_at, freigegeben_durch)
     VALUES ('a0000000-0000-0000-0000-000000000106', 'a0000000-0000-0000-0000-000000001001', now() + interval '1 day', 'a0000000-0000-0000-0000-000000000101') $$,
  'chef_a KANN eine Guest-Freigabe anlegen (positive Kontrolle)'
);

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000102'); -- manager_a
SELECT lives_ok(
  $$ INSERT INTO nutzer_vorgang_freigaben (nutzer_id, vorgang_id, ablauf_at, freigegeben_durch)
     VALUES ('a0000000-0000-0000-0000-000000000106', 'a0000000-0000-0000-0000-000000001001', now() + interval '1 day', 'a0000000-0000-0000-0000-000000000102') $$,
  'manager_a KANN eine Guest-Freigabe anlegen (positive Kontrolle)'
);

SELECT * FROM finish();
ROLLBACK;
