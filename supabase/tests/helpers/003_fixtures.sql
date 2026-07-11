-- Feste Test-Fixtures für die RLS-Test-Suite. TESTDATEN, nicht produktiv
-- verwenden. Unabhängig von supabase/seed/seed.sql (das ist die
-- Vorführ-/Ausprobier-Seed für die Konsole aus Woche 2 PR 3), damit diese
-- Test-Suite nicht am Demo-Datensatz hängt und umgekehrt.
--
-- Zwei Agenturen (A und B) für die Mandanten-Trennung, zwei Kunden in
-- Agentur A (nur einer davon Editor-a1/a2/Reader-a zugewiesen) für die
-- Kunden-Zuweisungs-Grenze, ein sensitiver Vorgang mit genau einer
-- zuständigen Person für die Sensitivity-Grenze, eine gültige und eine
-- abgelaufene Guest-Freigabe für die Guest-Grenze.
--
-- Läuft als Tabellen-Owner (postgres), RLS greift hier nicht (Owner-Bypass),
-- deshalb keine tests.authenticate_as()-Aufrufe nötig.

-- ============================================================
-- auth.users (Stub, siehe 000_auth_roles_and_uid.sql)
-- ============================================================

INSERT INTO auth.users (id) VALUES
  ('a0000000-0000-0000-0000-000000000101'), -- chef_a
  ('a0000000-0000-0000-0000-000000000102'), -- manager_a
  ('a0000000-0000-0000-0000-000000000103'), -- editor_a1 (zuständig für sensitiven Vorgang)
  ('a0000000-0000-0000-0000-000000000104'), -- editor_a2 (gleicher Kunde, NICHT zuständig)
  ('a0000000-0000-0000-0000-000000000105'), -- reader_a
  ('a0000000-0000-0000-0000-000000000106'), -- guest_a
  ('a0000000-0000-0000-0000-000000000201'), -- chef_b (andere Agentur)
  ('a0000000-0000-0000-0000-000000000202'); -- editor_b (andere Agentur)

-- ============================================================
-- agenturen
-- ============================================================

INSERT INTO agenturen (id, name, slug) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Agentur A (Test)', 'agentur-a-test'),
  ('a0000000-0000-0000-0000-000000000002', 'Agentur B (Test)', 'agentur-b-test');

-- ============================================================
-- kunden
-- ============================================================

INSERT INTO kunden (id, agentur_id, name, slug) VALUES
  ('a0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'Kunde A1 (Test)', 'kunde-a1'),
  ('a0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'Kunde A2 (Test)', 'kunde-a2'),
  ('a0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000002', 'Kunde B1 (Test)', 'kunde-b1');

-- ============================================================
-- nutzer
-- ============================================================

INSERT INTO nutzer (id, agentur_id, name, rolle) VALUES
  ('a0000000-0000-0000-0000-000000000101', 'a0000000-0000-0000-0000-000000000001', 'Chef A (Test)', 'chef'),
  ('a0000000-0000-0000-0000-000000000102', 'a0000000-0000-0000-0000-000000000001', 'Manager A (Test)', 'manager'),
  ('a0000000-0000-0000-0000-000000000103', 'a0000000-0000-0000-0000-000000000001', 'Editor A1 (Test)', 'editor'),
  ('a0000000-0000-0000-0000-000000000104', 'a0000000-0000-0000-0000-000000000001', 'Editor A2 (Test)', 'editor'),
  ('a0000000-0000-0000-0000-000000000105', 'a0000000-0000-0000-0000-000000000001', 'Reader A (Test)', 'reader'),
  ('a0000000-0000-0000-0000-000000000106', 'a0000000-0000-0000-0000-000000000001', 'Guest A (Test)', 'guest'),
  ('a0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000002', 'Chef B (Test)', 'chef'),
  ('a0000000-0000-0000-0000-000000000202', 'a0000000-0000-0000-0000-000000000002', 'Editor B (Test)', 'editor');

-- ============================================================
-- nutzer_kunden_zuweisungen
-- Manager A, Editor A1, Editor A2, Reader A sind alle Kunde A1 zugewiesen,
-- NICHT Kunde A2 (Grenze für Test 02). Editor B ist Kunde B1 zugewiesen.
-- ============================================================

INSERT INTO nutzer_kunden_zuweisungen (nutzer_id, kunde_id) VALUES
  ('a0000000-0000-0000-0000-000000000102', 'a0000000-0000-0000-0000-000000000011'),
  ('a0000000-0000-0000-0000-000000000103', 'a0000000-0000-0000-0000-000000000011'),
  ('a0000000-0000-0000-0000-000000000104', 'a0000000-0000-0000-0000-000000000011'),
  ('a0000000-0000-0000-0000-000000000105', 'a0000000-0000-0000-0000-000000000011'),
  ('a0000000-0000-0000-0000-000000000202', 'a0000000-0000-0000-0000-000000000021');

-- ============================================================
-- vorgaenge
-- agentur_id wird vom Konsistenz-Trigger aus kunde_id übernommen.
-- ============================================================

INSERT INTO vorgaenge (id, kunde_id, kanal, absender_identifikator, eingang_at, inhalt_text, sensitivity, zustaendige_nutzer_id) VALUES
  ('a0000000-0000-0000-0000-000000001001', 'a0000000-0000-0000-0000-000000000011', 'email', 'kunde@kunde-a1.example', now() - interval '2 hours', 'Normaler Test-Vorgang bei Kunde A1.', 'normal', NULL),
  ('a0000000-0000-0000-0000-000000001002', 'a0000000-0000-0000-0000-000000000011', 'email', 'kunde@kunde-a1.example', now() - interval '1 hour',  'Vertraulicher Test-Vorgang bei Kunde A1, nur Editor A1 zuständig.', 'vertraulich', 'a0000000-0000-0000-0000-000000000103'),
  ('a0000000-0000-0000-0000-000000001003', 'a0000000-0000-0000-0000-000000000012', 'email', 'kunde@kunde-a2.example', now() - interval '3 hours', 'Normaler Test-Vorgang bei Kunde A2 (Editor A1/A2/Reader A NICHT zugewiesen).', 'normal', NULL),
  ('a0000000-0000-0000-0000-000000001004', 'a0000000-0000-0000-0000-000000000021', 'email', 'kunde@kunde-b1.example', now() - interval '4 hours', 'Normaler Test-Vorgang bei Kunde B1, andere Agentur.', 'normal', NULL);

-- ============================================================
-- anliegen
-- ============================================================

INSERT INTO anliegen (id, vorgang_id, beschreibung, prioritaet) VALUES
  ('a0000000-0000-0000-0000-000000002001', 'a0000000-0000-0000-0000-000000001002', 'Anliegen zum vertraulichen Vorgang, darf nur für die zuständige Person sichtbar sein.', 'hoch'),
  ('a0000000-0000-0000-0000-000000002002', 'a0000000-0000-0000-0000-000000001001', 'Anliegen zum normalen Vorgang bei Kunde A1.', 'mittel');

-- ============================================================
-- handler_aufrufe
-- ============================================================

INSERT INTO handler_aufrufe (id, vorgang_id, anliegen_id, handler_slug, zustaendige_nutzer_id, prioritaet) VALUES
  ('a0000000-0000-0000-0000-000000003001', 'a0000000-0000-0000-0000-000000001002', 'a0000000-0000-0000-0000-000000002001', 'W2_presseanfragen_drafter', 'a0000000-0000-0000-0000-000000000103', 'hoch');

-- ============================================================
-- nutzer_vorgang_freigaben
-- Gültige Freigabe für Guest A auf den normalen Vorgang bei Kunde A1,
-- abgelaufene Freigabe auf den Vorgang bei Kunde A2 (muss unsichtbar bleiben).
-- ============================================================

INSERT INTO nutzer_vorgang_freigaben (id, nutzer_id, vorgang_id, ablauf_at, freigegeben_durch) VALUES
  ('a0000000-0000-0000-0000-000000004001', 'a0000000-0000-0000-0000-000000000106', 'a0000000-0000-0000-0000-000000001001', now() + interval '7 days', 'a0000000-0000-0000-0000-000000000101'),
  ('a0000000-0000-0000-0000-000000004002', 'a0000000-0000-0000-0000-000000000106', 'a0000000-0000-0000-0000-000000001003', now() - interval '1 day',  'a0000000-0000-0000-0000-000000000101');

-- ============================================================
-- audit_log
-- Ein Eintrag von Editor A1 auf dem sensitiven Vorgang (eigene Aktion),
-- ein Eintrag von Manager A auf dem normalen Vorgang bei Kunde A1.
-- ============================================================

INSERT INTO audit_log (id, vorgang_id, nutzer_id, aktion) VALUES
  ('a0000000-0000-0000-0000-000000005001', 'a0000000-0000-0000-0000-000000001002', 'a0000000-0000-0000-0000-000000000103', 'vorgang_zugriff'),
  ('a0000000-0000-0000-0000-000000005002', 'a0000000-0000-0000-0000-000000001001', 'a0000000-0000-0000-0000-000000000102', 'vorgang_zugriff');
