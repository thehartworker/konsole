-- TESTDATEN, nicht produktiv verwenden.
--
-- Minimaler Seed mit einer Test-Agentur, zwei Test-Kunden, drei Test-Nutzern
-- (chef, manager, editor) und ein paar Test-Vorgängen, damit RLS-Policies
-- (docs/decisions/2026-07-10_rls-policies.md) manuell oder in einer
-- Test-Suite gegen echte Daten geprüft werden können.
--
-- Alle IDs sind feste, erkennbare Test-UUIDs (kein gen_random_uuid()), damit
-- Tests stabil auf sie referenzieren können.
--
-- Wichtiger Hinweis zu auth.users: nutzer.id referenziert auth.users(id)
-- (siehe Migration 1). Damit die drei Test-Nutzer unten funktionieren, legt
-- dieses Seed-Skript passende Zeilen in auth.users direkt per SQL an, statt
-- über die Supabase-Auth-API. Das ist ein verbreitetes, aber nicht offiziell
-- dokumentiertes Muster für lokale Supabase-Seeds: das genaue Spaltenlayout
-- von auth.users ist eine interne GoTrue-Implementierungsdetail und kann sich
-- zwischen Supabase-Plattform-Versionen ändern. Nur für lokale
-- Entwicklung/CI gedacht, niemals gegen ein produktives Supabase-Projekt
-- ausführen. Falls dieses Muster in CI instabil wird: Testnutzer stattdessen
-- über die Supabase Admin API (auth.admin.createUser) anlegen und nur
-- public.nutzer per SQL nachziehen.

-- ============================================================
-- auth.users (nur für die drei Test-Nutzer unten)
-- ============================================================

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) VALUES
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333331',
   'authenticated', 'authenticated', 'chef@test-agentur.example', crypt('test-passwort-nur-lokal', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333332',
   'authenticated', 'authenticated', 'manager@test-agentur.example', crypt('test-passwort-nur-lokal', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'editor@test-agentur.example', crypt('test-passwort-nur-lokal', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- agenturen
-- ============================================================

INSERT INTO agenturen (id, name, slug) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Test-Agentur (Seed)', 'test-agentur')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- kunden
-- ============================================================

INSERT INTO kunden (id, agentur_id, name, slug, autonomie_level, retention_monate) VALUES
  ('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111', 'Bäckerei Hoffmann (Test)', 'baeckerei-hoffmann', 1, 24),
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Pharma Beispiel GmbH (Test)', 'pharma-beispiel', 1, 24)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- nutzer (chef, manager, editor)
-- ============================================================

INSERT INTO nutzer (id, agentur_id, name, rolle) VALUES
  ('33333333-3333-3333-3333-333333333331', '11111111-1111-1111-1111-111111111111', 'Chef Testnutzer', 'chef'),
  ('33333333-3333-3333-3333-333333333332', '11111111-1111-1111-1111-111111111111', 'Manager Testnutzer', 'manager'),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Editor Testnutzer', 'editor')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- nutzer_kunden_zuweisungen (manager und editor je einem Kunden zugewiesen)
-- ============================================================

-- Feste IDs statt gen_random_uuid()-Default, weil es auf
-- nutzer_kunden_zuweisungen keinen Unique-Constraint auf (nutzer_id,
-- kunde_id) gibt (laut Decision nicht gefordert) und "ON CONFLICT DO
-- NOTHING" ohne Konflikt-Ziel sonst bei jedem erneuten Seed-Lauf Duplikate
-- anlegen würde.
INSERT INTO nutzer_kunden_zuweisungen (id, nutzer_id, kunde_id) VALUES
  ('55555555-5555-5555-5555-555555555551', '33333333-3333-3333-3333-333333333332', '22222222-2222-2222-2222-222222222221'),
  ('55555555-5555-5555-5555-555555555552', '33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222221')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- vorgaenge (ein normaler, ein vertraulicher, ein bereits klassifizierter)
-- agentur_id wird vom Konsistenz-Trigger aus kunde_id übernommen (Migration 4).
-- ============================================================

INSERT INTO vorgaenge (
  id, kunde_id, kanal, absender_identifikator, absender_name, eingang_at,
  betreff, inhalt_text, sensitivity, klassifikation_status, status
) VALUES
  ('44444444-4444-4444-4444-444444444441', '22222222-2222-2222-2222-222222222221',
   'email', 'kunde@baeckerei-hoffmann.example', 'Klaus Hoffmann', now() - interval '2 hours',
   'Neue Presseanfrage', 'Test-Inhalt einer normalen Presseanfrage.',
   'normal', 'queued', 'eingegangen'),
  ('44444444-4444-4444-4444-444444444442', '22222222-2222-2222-2222-222222222221',
   'whatsapp_text', '+49 151 00000000', 'Sabine Kramer', now() - interval '1 hour',
   NULL, 'Test-Inhalt eines vertraulichen Vorgangs.',
   'vertraulich', 'queued', 'eingegangen'),
  ('44444444-4444-4444-4444-444444444443', '22222222-2222-2222-2222-222222222222',
   'email', 'presse@pharma-beispiel.example', 'Presseabteilung', now() - interval '3 days',
   'Bereits klassifizierter Test-Vorgang', 'Test-Inhalt, bereits klassifiziert und zugewiesen.',
   'regulatorisch_relevant', 'done', 'klassifiziert')
ON CONFLICT (id) DO NOTHING;

UPDATE vorgaenge SET
  typ_primaer = 'Anfrage',
  typ_sekundaer = 'Presseanfrage',
  confidence = 92,
  prioritaet = 'hoch',
  zustaendige_nutzer_id = '33333333-3333-3333-3333-333333333333'
WHERE id = '44444444-4444-4444-4444-444444444443';
