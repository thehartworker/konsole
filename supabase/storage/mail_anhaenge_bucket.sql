-- Storage-RLS-Policies für den "mail_anhaenge"-Bucket (Bucket selbst über
-- supabase/config.toml, Abschnitt [storage.buckets.mail_anhaenge],
-- deklariert -- gilt nur für `supabase start`, siehe supabase/storage/README.md
-- für die Produktions-Klick-Anleitung). Issue #52, E-Mail-Kanal Aufgabe G,
-- siehe docs/decisions/2026-07-19_email-kanal-imap-zwei-modi.md.
--
-- WARUM DIESE DATEI NICHT IN supabase/migrations/ LIEGT: siehe
-- supabase/storage/kunden_quelldokumente_bucket.sql, gleicher Grund
-- (storage.objects existiert im nackten Postgres-Container der
-- rls-tests-CI nicht).
--
-- IDEMPOTENZ: wie kunden_quelldokumente_bucket.sql, jede Policy mit
-- vorgeschaltetem DROP POLICY IF EXISTS.
--
-- Pfad-Konvention (siehe packages/mail-ingest/src/anhaenge.ts):
-- <agentur_id>/<kunde_id>/<vorgang_id>/<anhang_id>-<dateiname>. Anders als
-- kunden_quelldokumente (reiner Service-Role-Zugriff) bekommt dieser Bucket
-- zusätzlich eine Lese-Policy für Beraterinnen, weil Anhänge Teil der
-- normalen Vorgangs-Ansicht sind (Aufgabe D verlinkt sie direkt aus dem
-- Vorgang) -- storage.foldername(name) zerlegt den Pfad in seine Segmente,
-- Segment 1 ist die agentur_id, Segment 2 die kunde_id.

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mail_anhaenge_service_role_lesen ON storage.objects;
CREATE POLICY mail_anhaenge_service_role_lesen ON storage.objects
  FOR SELECT
  USING (bucket_id = 'mail_anhaenge' AND auth.role() = 'service_role');

DROP POLICY IF EXISTS mail_anhaenge_service_role_schreiben ON storage.objects;
CREATE POLICY mail_anhaenge_service_role_schreiben ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'mail_anhaenge' AND auth.role() = 'service_role');

-- Bewusst keine UPDATE/DELETE-Policy für irgendeine Rolle: Anhänge werden
-- nie nachträglich verändert, Löschung folgt der Vorgangs-Löschfrist über
-- einen künftigen privilegierten Job (analog zur DSGVO-Löschfrist-Betrachtung
-- bei kunden_quelldokumente), nicht über Endnutzer-Aktionen.

DROP POLICY IF EXISTS mail_anhaenge_beraterin_lesen ON storage.objects;
CREATE POLICY mail_anhaenge_beraterin_lesen ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'mail_anhaenge'
    AND (storage.foldername(name))[1] = public.current_agentur_id()::text
    AND (
      public.current_rolle() = 'chef'
      OR public.ist_kunde_zugewiesen(((storage.foldername(name))[2])::uuid)
    )
  );
