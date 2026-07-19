-- Storage-RLS-Policies für den "kunden_quelldokumente"-Bucket (Bucket selbst
-- wird über supabase/config.toml, Abschnitt [storage.buckets.kunden_quelldokumente],
-- deklariert). Siehe docs/decisions/2026-07-12_kundenprofil-ki-befuellung.md,
-- Abschnitt "Datei-Storage" für die volle Begründung.
--
-- WARUM DIESE DATEI NICHT IN supabase/migrations/ LIEGT: die rls-tests-CI
-- (.github/workflows/ci.yml) wendet jede Datei aus supabase/migrations/*.sql
-- gegen einen NACKTEN postgres:16-Container an (nur pgtap-Extension plus ein
-- manueller auth-Schema-Stub, siehe supabase/tests/helpers/000_auth_roles_and_uid.sql).
-- Das storage-Schema (storage.buckets, storage.objects) existiert dort NICHT
-- -- es wird von der echten Supabase-Storage-API bereitgestellt, nicht von
-- einer gewöhnlichen SQL-Migration. Eine Migration, die storage.objects
-- anspricht, würde die rls-tests-CI hart brechen ("relation storage.objects
-- does not exist"). Diese Datei ist deshalb bewusst NICHT Teil der
-- automatisch geprüften Migrations-Pipeline, siehe Decision, "@thehartworker
-- Entscheidung nötig" zu diesem Punkt.
--
-- ANWENDUNG: einmalig manuell gegen das echte Supabase-Projekt ausführen
-- (Supabase SQL-Editor oder `supabase db execute`), NACHDEM der Bucket über
-- `supabase start`/die Dashboard-Konfiguration aus config.toml existiert.
-- Für die Produktions-Klick-Anleitung siehe supabase/storage/README.md
-- (Issue #50, Konsole Block 3, Aufgabe G) -- config.toml gilt nur für
-- `supabase start` (lokale Entwicklung), NICHT für ein gehostetes
-- Supabase-Projekt, deshalb muss der Bucket dort einmalig per Dashboard
-- angelegt werden, bevor diese Datei ausgeführt wird.
--
-- IDEMPOTENZ (Issue #50, Aufgabe G): `CREATE POLICY` wirft beim zweiten Lauf
-- "policy already exists", `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` ist
-- dagegen bereits idempotent. Jede Policy bekommt deshalb ein vorgeschaltetes
-- `DROP POLICY IF EXISTS`, damit die Datei bei einem versehentlichen zweiten
-- Lauf (z. B. nach einem Kopierfehler im SQL-Editor) nicht hart bricht.
--
-- Mandanten-Trennung läuft über den bucket_pfad selbst
-- (<agentur_id>/<kunde_id>/<dokument_id>-<dateiname>, siehe
-- kunden_quelldokumente.bucket_pfad), nicht über eine pfad-parsende
-- storage.objects-Policy -- in v1 gibt es ohnehin keinen direkten
-- Endnutzer-Zugriff auf den Bucket (Upload/Download laufen über eine
-- Server-Route mit der Service-Role, analog dazu, dass auch die
-- kunden_quelldokumente-Tabelle selbst nur SELECT für authentifizierte
-- Sessions erlaubt, siehe die Migration). Eine feingranulare, pfadbasierte
-- Policy für direkten Endnutzer-Zugriff ist deshalb hier bewusst NICHT
-- gebaut (YAGNI, kein Aufrufer in Ebene 3 braucht sie) -- nur der sichere
-- Default (Service-Role only) wird gesetzt.

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kunden_quelldokumente_service_role_lesen ON storage.objects;
CREATE POLICY kunden_quelldokumente_service_role_lesen ON storage.objects
  FOR SELECT
  USING (bucket_id = 'kunden_quelldokumente' AND auth.role() = 'service_role');

DROP POLICY IF EXISTS kunden_quelldokumente_service_role_schreiben ON storage.objects;
CREATE POLICY kunden_quelldokumente_service_role_schreiben ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'kunden_quelldokumente' AND auth.role() = 'service_role');

-- Bewusst keine UPDATE/DELETE-Policy für Endnutzer-Rollen: ein hochgeladenes
-- Dokument wird über die DSGVO-Löschfrist (siehe Decision) durch einen
-- privilegierten Job entfernt, nicht durch Endnutzer-Aktionen. Der
-- Service-Role-Kontext selbst umgeht RLS ohnehin (BYPASSRLS), diese
-- Policies greifen nur für andere, nicht-privilegierte Rollen, die versuchen
-- direkt auf storage.objects zuzugreifen.
