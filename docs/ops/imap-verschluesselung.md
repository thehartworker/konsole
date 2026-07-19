# IMAP-Passwort-Verschlüsselung: Schlüssel anlegen

Betrifft Modus B des E-Mail-Kanals (`kunden_mail_anbindungen.anbindungs_typ = 'imap_kundenpostfach'`, siehe `docs/decisions/2026-07-19_email-kanal-imap-zwei-modi.md`). Kunden-IMAP-Passwörter werden nie im Klartext gespeichert, sondern über `pgcrypto`s `pgp_sym_encrypt`/`pgp_sym_decrypt` mit einem symmetrischen Schlüssel verschlüsselt (`supabase/migrations/20260719140000_email_kanal.sql`, Funktionen `mail_anbindung_imap_anlegen`/`mail_anbindung_passwort_entschluesseln`).

## Wo der Schlüssel lebt

Der Schlüssel ist **kein** Datenbank-Objekt (kein Postgres-GUC, kein Vault-Secret) und steht **nicht im Repository** — weder im Code noch in `.env.example` (AGENTS.md §4, "Keine Secrets im Code"). Er lebt ausschließlich als Env-Var `IMAP_PASSWORT_VERSCHLUESSELUNGS_SCHLUESSEL` in genau zwei Prozessen:

1. `apps/web` (Server-Actions unter `apps/web/src/app/kunden/[id]/mail-anbindung/actions.ts`) — verschlüsselt beim Einrichten einer Modus-B-Anbindung.
2. `apps/mail-ingest` (`/etc/konsole/mail-ingest.env` auf dem Hetzner-Host) — entschlüsselt beim Verbindungsaufbau.

Beide Prozesse brauchen **denselben** Schlüssel-Wert. Ein Schlüssel-Wechsel macht alle bestehenden `imap_passwort_verschluesselt`-Werte unlesbar (siehe "Schlüssel-Rotation" unten) — deshalb einmal generieren, in beiden Umgebungen identisch hinterlegen, und danach nicht mehr leichtfertig ändern.

## Schlüssel generieren (einmalig pro Umgebung)

```bash
openssl rand -hex 32
```

Ergebnis ist eine 64-stellige Hex-Zeichenkette. Getrennte Werte für `stage` und `production` verwenden (falls/sobald `stage` wieder existiert, siehe `AGENTS.md` §3.1) — ein Schlüssel-Leak in einer Umgebung darf nicht die andere kompromittieren.

## Wo eintragen

- **Web-App (Hetzner, Next.js-Prozess):** in der Deployment-Umgebung der `apps/web`-Instanz, gleiche Stelle wie `SUPABASE_SERVICE_ROLE_KEY` (siehe `apps/web/.env.example` für die Variablen-Liste, der eigentliche Wert steht dort NIE drin).
- **Mail-Ingest-Dienst (Hetzner, systemd):** `/etc/konsole/mail-ingest.env`, siehe `docs/ops/mail-ingest-deployment.md` für den vollständigen Bootstrap-Ablauf dieser Datei. Datei-Rechte `600`, Owner der Dienst-Betriebs-User (nicht `root`, nicht weltlesbar).

## Schlüssel-Rotation

Kein automatisierter Rotations-Prozess in v1 (bewusst, siehe Issue #52, "Nicht Teil dieses PRs"). Manueller Ablauf, falls ein Schlüssel kompromittiert wurde oder turnusmäßig rotiert werden soll:

1. Für jede bestehende Modus-B-Anbindung das Klartext-Passwort erneut vom Kunden anfordern (es gibt keinen Weg, mit dem alten Schlüssel verschlüsselte Werte automatisch auf einen neuen Schlüssel umzustellen, ohne den Klartext zwischenzeitlich wieder zu besitzen — das ist beabsichtigt, kein Postgres-Prozess soll je beide Schlüssel gleichzeitig im Zugriff haben).
2. Neuen Schlüssel generieren (siehe oben).
3. Env-Var an beiden Stellen (Web-App, Mail-Ingest-Dienst) auf den neuen Wert setzen, beide Prozesse neu starten.
4. Jede Modus-B-Anbindung über die Konsolen-UI (`/kunden/[id]/mail-anbindung`) neu einrichten (Formular erneut ausfüllen, `richteImapKundenpostfachEin` verschlüsselt mit dem jetzt aktiven Schlüssel).

## Was NIE passieren darf

- Der Schlüssel-Wert in einem Commit, einer PR-Beschreibung, einem Issue-Kommentar oder einem Log-Eintrag (strukturiertes Logging in `apps/mail-ingest` darf Env-Vars nie unreflektiert mitloggen).
- Derselbe Schlüssel für `IMAP_PASSWORT_VERSCHLUESSELUNGS_SCHLUESSEL` wie für einen anderen Zweck (z. B. `SUPABASE_SERVICE_ROLE_KEY`) — unabhängige Secrets, unabhängige Blast-Radius-Grenze bei einem Leak.
