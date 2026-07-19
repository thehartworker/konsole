# Deployment: `apps/mail-ingest` auf dem Hetzner-Host

Klick-für-Klick-Anleitung für Bastian, um den E-Mail-Ingest-Dienst (Issue #52) auf dem Hetzner-Host (`docs/decisions/2026-07-10_deployment.md`) einzurichten. Läuft als eigenständiger systemd-Dienst neben `apps/web` (siehe `docs/decisions/2026-07-19_email-kanal-imap-zwei-modi.md`, Entscheidung 2, für die Begründung).

## Voraussetzungen

- Node.js 22+ auf dem Host installiert (gleiche Version wie in `.tool-versions`).
- pnpm installiert (`corepack enable` reicht i. d. R., siehe `package.json`, Feld `packageManager`).
- Ein Linux-User `konsole` existiert (kein root-Betrieb, siehe systemd-Unit, Abschnitt "Härtung" unten). Falls nicht vorhanden: `sudo useradd --system --create-home --shell /usr/sbin/nologin konsole`.
- Falls Modus A (Weiterleitung, siehe Design-Decision) genutzt werden soll: das Konsolen-Postfach existiert bereits und die IMAP-Zugangsdaten liegen vor.

## Schritt 1: Code auf den Host bringen

```bash
sudo mkdir -p /opt/konsole
sudo chown konsole:konsole /opt/konsole
sudo -u konsole git clone <repo-url> /opt/konsole
cd /opt/konsole
sudo -u konsole pnpm install --frozen-lockfile
```

Bei einem Update statt einem Erst-Deploy: `git pull` plus `pnpm install --frozen-lockfile` im bestehenden `/opt/konsole`-Checkout, dann den Dienst neu starten (Schritt 5).

## Schritt 2: Verschlüsselungs-Schlüssel generieren (nur beim allerersten Deploy)

Siehe `docs/ops/imap-verschluesselung.md` für den vollständigen Hintergrund. Kurzfassung:

```bash
openssl rand -hex 32
```

Den Wert sicher notieren (Passwort-Manager) — er muss identisch in **zwei** Env-Dateien landen: hier (Schritt 3) und in der `apps/web`-Deployment-Umgebung.

## Schritt 3: Env-Datei anlegen

```bash
sudo mkdir -p /etc/konsole
sudo cp /opt/konsole/apps/mail-ingest/.env.example /etc/konsole/mail-ingest.env
sudo chown root:konsole /etc/konsole/mail-ingest.env
sudo chmod 640 /etc/konsole/mail-ingest.env
sudo nano /etc/konsole/mail-ingest.env  # alle Werte befüllen, siehe Kommentare in der Datei
```

Pflichtfelder: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `IMAP_PASSWORT_VERSCHLUESSELUNGS_SCHLUESSEL` (aus Schritt 2). `KONSOLEN_POSTFACH_IMAP_*` nur befüllen, wenn Modus A produktiv genutzt wird — der Dienst prüft das beim Start selbst (`env.ts`, `pruefeKonsolenPostfachEnv`) und bricht mit einer klaren Fehlermeldung ab, falls eine aktive `weiterleitung`-Anbindung existiert, aber die Vars fehlen.

## Schritt 4: systemd-Unit einrichten

```bash
sudo cp /opt/konsole/apps/mail-ingest/systemd/konsole-mail-ingest.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable konsole-mail-ingest
sudo systemctl start konsole-mail-ingest
```

## Schritt 5: Status prüfen

```bash
sudo systemctl status konsole-mail-ingest
sudo journalctl -u konsole-mail-ingest -f
curl -s http://localhost:3001/health | jq
```

Erwartete `/health`-Antwort:

```json
{ "status": "ok", "verbindungen_aktiv": 1, "letzte_mail_at": null }
```

`verbindungen_aktiv` ist die Anzahl offener IMAP-Verbindungen (1 für das geteilte Konsolen-Postfach plus eine pro aktiver Modus-B-Anbindung). `letzte_mail_at` bleibt `null`, bis die erste Mail verarbeitet wurde.

## Neustart nach einer Anbindungs-Änderung

Der Dienst lädt die Liste aktiver Anbindungen aktuell **nur beim Start** (Modus-B-Verbindungen werden pro Anbindung aufgebaut, siehe `src/main.ts`). Wird über die Konsolen-UI (`/kunden/[id]/mail-anbindung`) eine neue Modus-B-Anbindung angelegt oder eine bestehende deaktiviert, braucht es einen Neustart, damit der Dienst das übernimmt:

```bash
sudo systemctl restart konsole-mail-ingest
```

Ein periodisches Neuladen ohne Neustart (Anbindungen zur Laufzeit hinzufügen/entfernen) ist bewusst nicht Teil von v1 — siehe Issue #52, "Nicht Teil dieses PRs".

## Update-Ablauf (bestehender Dienst)

```bash
cd /opt/konsole
sudo -u konsole git pull
sudo -u konsole pnpm install --frozen-lockfile
sudo systemctl restart konsole-mail-ingest
sudo systemctl status konsole-mail-ingest
curl -s http://localhost:3001/health
```

## Troubleshooting

- **Dienst startet nicht, `journalctl` zeigt "Ungültige Umgebungsvariablen"**: eine Pflicht-Var in `/etc/konsole/mail-ingest.env` fehlt oder ist leer, siehe Fehlermeldung für den genauen Feldnamen (`src/env.ts`).
- **Dienst startet, aber keine Mail kommt an**: `/health` prüfen (`verbindungen_aktiv` sollte > 0 sein). Falls 0: keine aktive Anbindung in der Datenbank, oder `pruefeKonsolenPostfachEnv` hat beim Start abgebrochen (siehe Log).
- **`kein_kunde_zugeordnet`-Einträge häufen sich** (`/ops/mail-eingang` in der Konsole, nur `chef`-Rolle): meist eine falsch eingerichtete Weiterleitung beim Kunden (Plus-Adresse falsch kopiert). Für Modus-A-Fälle ganz ohne DB-Log-Eintrag (geteiltes Postfach, siehe Kommentar in `src/verarbeite-nachricht.ts`) hilft nur `journalctl -u konsole-mail-ingest`.
- **Graceful-Shutdown-Timeout**: falls `systemctl stop` länger als 30 Sekunden braucht, prüft systemd via `TimeoutStopSec` und killt hart -- das deutet auf eine hängende IMAP-Verbindung hin, kein Datenverlust bei bereits abgeschlossener Nachrichtenverarbeitung (nur die noch offene IMAP-Session wird hart getrennt).
