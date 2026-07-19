-- Test-Fall 20 (Issue #52, E-Mail-Kanal Aufgabe A): RLS auf
-- kunden_mail_anbindungen/mail_eingang_log aus
-- 20260719140000_email_kanal.sql. Prüft: Modus-A-Anlage durch editor_a1
-- (Kunden-Zuweisungs-Grenze wie überall), Spalten-Schutz für
-- imap_passwort_verschluesselt, Mandanten-Trennung für chef_b, und den
-- CHECK-Constraint für die modusabhängigen Pflichtfelder. Zusätzlich ein
-- Verschlüsselungs-Roundtrip über die beiden neuen RPC-Funktionen
-- (mail_anbindung_imap_anlegen/mail_anbindung_passwort_entschluesseln).
--
-- Fixtures aus 003_fixtures.sql: editor_a1 (103) ist Kunde A1 (011)
-- zugewiesen, NICHT Kunde A2 (012). chef_b (201) ist Agentur B (002).

BEGIN;
SELECT plan(10);

-- ============================================================
-- editor_a1 kann für den zugewiesenen Kunden A1 eine weiterleitung-Anbindung
-- anlegen (Modus A).
-- ============================================================

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000103'); -- editor_a1

SELECT lives_ok(
  $$ INSERT INTO kunden_mail_anbindungen (id, kunde_id, anbindungs_typ, konsolen_adresse)
     VALUES ('a0000000-0000-0000-0000-000000020001', 'a0000000-0000-0000-0000-000000000011', 'weiterleitung', 'mensch-betrieb+neurabin-pharma@intake.example.de') $$,
  'editor_a1 kann für den zugewiesenen Kunden A1 eine weiterleitung-Anbindung anlegen'
);

SELECT is(
  (SELECT konsolen_adresse FROM kunden_mail_anbindungen WHERE id = 'a0000000-0000-0000-0000-000000020001'),
  'mensch-betrieb+neurabin-pharma@intake.example.de',
  'die angelegte Anbindung trägt die erwartete Konsolen-Adresse'
);

-- editor_a1 darf für den NICHT zugewiesenen Kunden A2 keine Anbindung
-- anlegen -- Kunden-Zuweisungs-Grenze gilt hier genauso wie bei
-- kunden_profil (Test 19).
SELECT throws_ok(
  $$ INSERT INTO kunden_mail_anbindungen (kunde_id, anbindungs_typ, konsolen_adresse)
     VALUES ('a0000000-0000-0000-0000-000000000012', 'weiterleitung', 'manipulationsversuch@intake.example.de') $$,
  NULL,
  NULL,
  'editor_a1 kann KEINE Anbindung für den NICHT zugewiesenen Kunden A2 anlegen'
);

-- ============================================================
-- CHECK-Constraint: imap_kundenpostfach ohne imap_host scheitert.
-- ============================================================

SELECT throws_like(
  $$ INSERT INTO kunden_mail_anbindungen (kunde_id, anbindungs_typ, imap_port, imap_benutzername, imap_passwort_verschluesselt)
     VALUES ('a0000000-0000-0000-0000-000000000011', 'imap_kundenpostfach', 993, 'kunde@kunde-a1.example', pgp_sym_encrypt('geheim', 'test-schluessel')) $$,
  '%kunden_mail_anbindungen_modus_felder%',
  'eine imap_kundenpostfach-Anbindung mit leerem imap_host scheitert am CHECK-Constraint'
);

SELECT tests.clear_authentication();

-- ============================================================
-- Spalten-Schutz: editor_a1 sieht die übrigen Felder einer Modus-B-Anbindung
-- von Kunde A1, aber nicht imap_passwort_verschluesselt.
-- ============================================================

INSERT INTO kunden_mail_anbindungen (id, kunde_id, anbindungs_typ, imap_host, imap_port, imap_benutzername, imap_passwort_verschluesselt) VALUES
  ('a0000000-0000-0000-0000-000000020002', 'a0000000-0000-0000-0000-000000000011', 'imap_kundenpostfach', 'imap.kunde-a1.example', 993, 'presse@kunde-a1.example', pgp_sym_encrypt('sehr-geheim', 'test-schluessel'));

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000103'); -- editor_a1

SELECT lives_ok(
  $$ SELECT imap_host FROM kunden_mail_anbindungen WHERE id = 'a0000000-0000-0000-0000-000000020002' $$,
  'editor_a1 kann imap_host der zugewiesenen Modus-B-Anbindung lesen'
);

SELECT throws_ok(
  $$ SELECT imap_passwort_verschluesselt FROM kunden_mail_anbindungen WHERE id = 'a0000000-0000-0000-0000-000000020002' $$,
  NULL,
  NULL,
  'editor_a1 kann NICHT das imap_passwort_verschluesselt-Feld auslesen (Spalten-Grant blockt)'
);

SELECT throws_ok(
  $$ SELECT mail_anbindung_passwort_entschluesseln('a0000000-0000-0000-0000-000000020002', 'test-schluessel') $$,
  NULL,
  NULL,
  'editor_a1 kann das Passwort auch über die Entschlüsseln-RPC nicht lesen (SECURITY INVOKER, gleiche Spalten-Grenze)'
);

SELECT tests.clear_authentication();

-- ============================================================
-- chef_b (fremde Agentur) sieht die Anbindungen von Kunde A1 nicht.
-- ============================================================

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000201'); -- chef_b

SELECT is(
  (SELECT count(*)::int FROM kunden_mail_anbindungen WHERE kunde_id = 'a0000000-0000-0000-0000-000000000011'),
  0,
  'chef_b (Agentur B) sieht keine Mail-Anbindungen von Kunde A1 (Agentur A)'
);

SELECT tests.clear_authentication();

-- ============================================================
-- Verschlüsselungs-Roundtrip über die RPC-Funktionen (Owner-Kontext, wie ein
-- Server-Action-Aufruf mit Session-Client, hier ohne RLS-Einschränkung
-- geprüft, um ausschließlich die Krypto-Logik zu testen).
-- ============================================================

SELECT lives_ok(
  $$ SELECT mail_anbindung_imap_anlegen(
       'a0000000-0000-0000-0000-000000000012', 'imap.kunde-a2.example', 993, 'presse@kunde-a2.example',
       'roundtrip-passwort', 'test-schluessel'
     ) $$,
  'mail_anbindung_imap_anlegen verschlüsselt und legt die Anbindung in einem Schritt an'
);

SELECT is(
  (SELECT mail_anbindung_passwort_entschluesseln(id, 'test-schluessel') FROM kunden_mail_anbindungen WHERE kunde_id = 'a0000000-0000-0000-0000-000000000012' AND anbindungs_typ = 'imap_kundenpostfach'),
  'roundtrip-passwort',
  'die Entschlüsseln-RPC liefert exakt das ursprüngliche Klartext-Passwort zurück'
);

SELECT * FROM finish();
ROLLBACK;
