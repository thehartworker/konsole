-- Test-Fall 6 (Issue #20): Ein guest sieht NUR explizit freigegebene
-- einzelne Vorgänge, nichts anderes. Fixtures: Guest A hat eine gültige
-- Freigabe auf den normalen Vorgang bei Kunde A1 und eine ABGELAUFENE
-- Freigabe auf den Vorgang bei Kunde A2 (muss unsichtbar bleiben, prüft
-- "ablauf_at > now()" in darf_vorgang_sehen()).

BEGIN;
SELECT plan(6);

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000106'); -- guest_a

SELECT is(
  (SELECT count(*) FROM vorgaenge)::int, 1,
  'guest_a sieht insgesamt genau 1 Vorgang, nichts sonst'
);

SELECT ok(
  EXISTS (SELECT 1 FROM vorgaenge WHERE id = 'a0000000-0000-0000-0000-000000001001'),
  'guest_a sieht den einen gültig freigegebenen Vorgang'
);

SELECT ok(
  NOT EXISTS (SELECT 1 FROM vorgaenge WHERE id = 'a0000000-0000-0000-0000-000000001003'),
  'guest_a sieht den Vorgang mit ABGELAUFENER Freigabe NICHT'
);

SELECT ok(
  NOT EXISTS (SELECT 1 FROM vorgaenge WHERE id = 'a0000000-0000-0000-0000-000000001002'),
  'guest_a sieht den sensitiven Vorgang (keine Freigabe dafür) NICHT'
);

SELECT ok(
  NOT EXISTS (SELECT 1 FROM vorgaenge WHERE id = 'a0000000-0000-0000-0000-000000001004'),
  'guest_a sieht den Vorgang einer fremden Agentur NICHT'
);

SELECT is(
  (SELECT count(*) FROM kunden)::int, 0,
  'guest_a sieht keinen einzigen Kunden-Datensatz (keine allgemeine Konsolen-Sicht, nur Einzel-Vorgänge)'
);

SELECT * FROM finish();
ROLLBACK;
