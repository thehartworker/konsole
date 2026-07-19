# Storage-Bucket-Bootstrap (Produktion)

`supabase/config.toml` deklariert den Bucket `kunden_quelldokumente` (Abschnitt `[storage.buckets.kunden_quelldokumente]`) — das gilt aber **nur für `supabase start`** (lokale Entwicklung über die Supabase-CLI). Ein gehostetes Supabase-Projekt (Bastians Produktions-Instanz) liest `config.toml` nicht automatisch; der Bucket muss dort einmalig manuell angelegt werden. Genau wie bei den SQL-Migrationen (siehe `docs/ops/` bzw. die Bootstrap-Hinweise in den Migrations-Kommentaren) ist diese Klick-Anleitung die Wahrheit für den Produktions-Bootstrap.

## Warum kein automatisches Anlegen per Migration

`storage.buckets` ist eine System-Tabelle der Supabase-Storage-API, keine gewöhnliche Anwendungstabelle. Ein `INSERT` per SQL-Migration reicht nicht aus, um einen Bucket vollständig nutzbar zu machen (Supabase Storage braucht dafür internen Zustand, den nur die Storage-API selbst konsistent anlegt) — deshalb läuft das Anlegen über das Dashboard, die RLS-Policies danach über den SQL-Editor.

## Schritt 1: Bucket anlegen (einmalig, Supabase-Dashboard)

1. Supabase-Dashboard öffnen → **Storage** in der linken Navigation.
2. **Create bucket** klicken.
3. Name: `kunden_quelldokumente` (exakt, kleingeschrieben, wird von `packages/persistence/src/kunden-quelldokumente.ts` als Konstante referenziert).
4. **Public bucket**: AUS lassen (Private) — Dokumente enthalten potenziell vertrauliche Kundeninformationen, kein direkter öffentlicher Zugriff.
5. **File size limit**: 25 MiB (analog zu `config.toml`, Abschnitt `[storage.buckets.kunden_quelldokumente]`).
6. **Allowed MIME types**: `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `text/plain` (PDF/DOCX/TXT, siehe `ProduktiverDokumentTextProvider`).
7. **Save**.

## Schritt 2: RLS-Policies einspielen (einmalig, SQL-Editor)

Nach Schritt 1 existiert `storage.objects` für diesen Bucket. Jetzt `supabase/storage/kunden_quelldokumente_bucket.sql` komplett in den Supabase-SQL-Editor kopieren und ausführen. Die Datei ist idempotent (jede `CREATE POLICY` hat ein vorgeschaltetes `DROP POLICY IF EXISTS`) — ein versehentlicher zweiter Lauf bricht nicht.

Ergebnis: nur die Service-Role darf lesen/schreiben (kein direkter Endnutzer-Zugriff auf den Bucket in v1, siehe Kommentar in der SQL-Datei und `docs/decisions/2026-07-12_kundenprofil-ki-befuellung.md`, Abschnitt "Datei-Storage"). Upload/Download laufen ausschließlich über Server-Routen mit der Service-Role (`SUPABASE_SERVICE_ROLE_KEY`, siehe `apps/web/.env.example`).

## Prüfen, ob der Bootstrap bereits gelaufen ist

Im SQL-Editor:

```sql
select bucket_id, count(*) from storage.objects where bucket_id = 'kunden_quelldokumente' group by bucket_id;
select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'kunden_quelldokumente_%';
```

Die zweite Abfrage sollte `kunden_quelldokumente_service_role_lesen` und `kunden_quelldokumente_service_role_schreiben` zurückgeben. Fehlen sie, ist Schritt 2 noch offen. Schlägt ein Dokument-Upload aus der Konsole mit einem Storage-Fehler fehl, ist das der erste Verdacht: Bucket existiert (Schritt 1), aber die Policies fehlen (Schritt 2), oder umgekehrt.

## Zweiter Bucket: `mail_anhaenge` (Issue #52, E-Mail-Kanal Aufgabe G)

Gleicher Ablauf wie oben, mit folgenden Abweichungen:

1. Supabase-Dashboard → **Storage** → **Create bucket**.
2. Name: `mail_anhaenge` (exakt, kleingeschrieben, referenziert von `packages/mail-ingest/src/anhaenge.ts`).
3. **Public bucket**: AUS lassen (Private).
4. **File size limit**: 25 MiB.
5. **Allowed MIME types**: `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/msword`, `text/plain`, `text/html`, `text/csv`, `image/jpeg`, `image/png`, `image/gif` (siehe `supabase/config.toml`, Abschnitt `[storage.buckets.mail_anhaenge]`).
6. **Save**.
7. `supabase/storage/mail_anhaenge_bucket.sql` im SQL-Editor ausführen.

Anders als `kunden_quelldokumente` bekommt dieser Bucket zusätzlich eine Lese-Policy für Beraterinnen (nicht nur Service-Role), weil Anhänge Teil der normalen Vorgangs-Ansicht sind. Die Pfad-Konvention (`<agentur_id>/<kunde_id>/<vorgang_id>/<anhang_id>-<dateiname>`) ist dafür Voraussetzung — der Ingest-Dienst muss beim Hochladen exakt dieses Schema einhalten, siehe Kommentar in der SQL-Datei.

Prüfen:

```sql
select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'mail_anhaenge_%';
```

Sollte drei Policies zurückgeben: `mail_anhaenge_service_role_lesen`, `mail_anhaenge_service_role_schreiben`, `mail_anhaenge_beraterin_lesen`.
