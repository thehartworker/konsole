# E-Mail-Kanal: IMAP-Ingest mit zwei Anbindungs-Modi

**Datum:** 2026-07-19
**Status:** akzeptiert
**Kontext:** BUILD_PLAN_v1.0.md Woche 4 verlangt den ersten automatischen Ingest-Kanal. Eingehende E-Mails sollen zu `vorgaenge`-Zeilen werden, durch den bestehenden kanal-agnostischen Klassifikator (`packages/classifier`, `docs/decisions/2026-07-12_klassifikations-layer.md`) laufen und W1/W2 auslösen. Der Pilot-Kunde (Mensch Kreativagentur) betreut Pharma-Endkunden mit DE-Sitz und EU-Hosting-Pflicht (`AGENTS.md` §8.2), zusätzlich hat mindestens ein bestehendes Agentur-Setup ein etabliertes Postfach, das niemand umkonfigurieren will.

**Panel-Konsens (vier Perspektiven, siehe Issue #52):** Nagele (Postmark, Managed-Webhook), DHH (37signals, Vendor-Lock-in-Skeptiker), Schrems (DSGVO-First), Gondwana (Fastmail, IMAP-mit-IDLE). Konsens: IMAP mit IDLE gegen ein DE-Postfach, nicht Postmark/Cloudflare.

**Optionen (Provider-Anbindung):**

1. Managed-Webhook-Provider (Postmark, Cloudflare Email Routing) mit Inbound-Parsing per HTTP-Callback.
2. IMAP mit IDLE gegen ein selbst gewähltes Postfach (Provider-Wahl bleibt Betriebs-Entscheidung außerhalb dieses PRs).
3. Reines IMAP-Polling ohne IDLE.

**Entscheidung (Provider-Anbindung):** Option 2, IMAP mit IDLE.

**Begründung:**

- Postmark und Cloudflare Email Routing haben eine US-Muttergesellschaft (Postmark/ActiveCampaign, Cloudflare Inc.) und unterliegen damit potenziell dem CLOUD Act. Für Pharma-Endkunden-Korrespondenz mit personenbezogenen und teils gesundheitsbezogenen Daten (`AGENTS.md` §9, Pharma-Compliance-Erweiterung) ist ein US-Anbieter im Verarbeitungspfad ein vermeidbares Risiko, das über die ohnehin schon in der AVV benannten Ausnahmen (Anthropic, WhatsApp Business API) hinausgeht.
- IMAP ist ein offener Standard: die Wahl eines konkreten DE-Postfach-Betreibers (v1-Vorschlag mailbox.org, siehe Issue) bleibt austauschbar, ohne Code-Änderungen. Das entspricht DHHs Vendor-Lock-in-Einwand.
- Reines Polling (Option 3) würde entweder Latenz (Minuten bis zur Erkennung neuer Mail) oder unnötige Server-Last durch Kurzintervall-Polling erzeugen. IDLE (RFC 2177) liefert Server-Push mit niedriger Latenz, mit einem Fallback-Poll alle 5 Minuten für den Fall, dass eine IDLE-Verbindung tot ist, ohne dass der Client das sofort bemerkt.

**Konsequenzen (Provider-Anbindung):** der Ingest-Dienst braucht eine dauerhafte TCP-Verbindung pro Postfach (siehe Abschnitt "Warum ein eigener Node-Dienst" unten). Die konkrete Wahl des Konsolen-Postfach-Anbieters (Modus A) ist eine spätere Betriebs-Entscheidung Bastians, keine Code-Entscheidung.

---

## Entscheidung 1: Zwei Anbindungs-Modi statt einem

**Optionen:**

1. Nur Modus A (Weiterleitung in ein zentrales Konsolen-Postfach mit Plus-Adressierung).
2. Nur Modus B (direkter IMAP-Zugriff auf das jeweilige Kunden-Postfach).
3. Beide Modi nebeneinander, pro Kunde beim Onboarding wählbar, jederzeit umschaltbar.

**Entscheidung:** Option 3.

**Begründung:** Modus A allein zwingt jeden Kunden zur Weiterleitungs-Umkonfiguration seiner bekannten Presse-Adressen (`presse@ihre-domain.de` etc.) — für ein bestehendes Agentur-Setup mit etablierten Kontakten, die niemand anfassen will (der Mensch-Pilot ist genau dieser Fall), ist das eine unnötige Hürde beim Onboarding. Modus B allein braucht IMAP-Credentials im System für JEDEN Kunden: Vertrauen in die Verschlüsselung, eine AVV-Klausel pro Kunde, und einen Konfigurationsaufwand, den ein Neu-Kunde ohne bestehendes Postfach-Setup gar nicht hat (für den ist eine simple Weiterleitung die niedrigere Hürde). Nebeneinander decken beide Modi unterschiedliche Kunden-Situationen ab, ohne dass eine die andere ausschließt — die Wahl ist eine reine Onboarding-Entscheidung pro Kunde, kein Kompromiss im Datenmodell (beide Modi teilen sich denselben IMAP-Client-Kern, nur die Postfach-Zuordnung unterscheidet sich).

**Konsequenzen:** `kunden_mail_anbindungen` braucht ein Enum-Feld `anbindungs_typ` mit modusabhängigen Pflichtfeldern (CHECK-Constraint statt zweier Tabellen, weil beide Modi dieselbe RLS-Sichtbarkeits-Logik und denselben Lifecycle — aktiv/inaktiv/gelöscht — teilen). Der Ingest-Dienst muss zwei unterschiedliche Verbindungs-Topologien verwalten: eine geteilte Verbindung zum Konsolen-Postfach für alle Modus-A-Kunden, eine Verbindung pro Anbindung für Modus B.

---

## Entscheidung 2: Eigener Node-Dienst statt Next.js-API-Route

**Optionen:**

1. Next.js API-Route (`apps/web`) mit IMAP-Client-Aufruf pro Request.
2. Next.js API-Route mit einem serverseitigen Cron-Trigger (Polling statt IDLE).
3. Eigenständiger Node-Dienst (`apps/mail-ingest/`) unter systemd auf demselben Hetzner-Host.

**Entscheidung:** Option 3.

**Begründung:** Der IMAP-Client hält pro Postfach eine dauerhafte TCP-Verbindung mit IDLE offen (siehe Provider-Entscheidung oben). Next.js-Server-Runtimes (auch außerhalb von Vercels Edge/Serverless-Modell, siehe `docs/decisions/2026-07-10_deployment.md`) sind für einen Request-Response-Zyklus gebaut, nicht für einen Prozess, der Wochen am Stück eine offene Verbindung hält. Ein Restart des Web-App-Prozesses (Deploy, Crash, Memory-Limit) würde bei Option 1/2 den Mail-Ingest mit abreißen, obwohl Web-App-Deploys unabhängig vom Mail-Ingest-Betrieb passieren sollten. Ein eigenständiger Dienst unter systemd (`Restart=always`) entkoppelt beide Lebenszyklen: ein Web-App-Deploy stört den laufenden Mail-Ingest nicht, und ein IMAP-Verbindungsfehler reißt nicht die Web-App mit.

**Konsequenzen:** ein zusätzlicher Deployment-Baustein auf dem Hetzner-Host (eigene systemd-Unit, eigener Health-Endpoint auf Port 3001, siehe `docs/ops/mail-ingest-deployment.md`). Der Dienst braucht eigene Env-Var-Verwaltung (`/etc/konsole/mail-ingest.env`) getrennt von der Web-App. Kommunikation mit dem restlichen System läuft ausschließlich über Supabase (Service-Role-Client) — kein direkter Prozess-zu-Prozess-Kanal zur Web-App nötig, weil `packages/persistence`s `klassifiziereUndPersistiere` (der bestehende Ingest-Einstiegspunkt) reine Bibliotheksfunktion ist und aus jedem Node-Prozess heraus aufgerufen werden kann.

---

## Entscheidung 3: IMAP-Bibliothek

**Optionen:**

1. `imapflow` (aktuell gepflegt, native IDLE-Unterstützung, TLS out-of-the-box, MIT-Lizenz, Promise-basierte API).
2. `node-imap` (älter, Callback-basiert, seit Jahren ohne aktive Weiterentwicklung).
3. Eigener minimaler IMAP-Client über rohe TLS-Sockets.

**Entscheidung:** Option 1, `imapflow`, wie im Issue vorgeschlagen. Für MIME-Parsing (Multipart, Encoding-Kanten wie Quoted-Printable/Base64, RFC-2047-kodierte Betreffzeilen) ergänzend `mailparser` (selber Autor/Ökosystem wie `imapflow`, wird von `imapflow` selbst für den Message-Envelope bereits intern nicht vollständig übernommen — die volle Body-Struktur braucht den separaten MIME-Parser). Für den Test-Mail-Versand in Modus A (Server-Action `testeKonsolenPostfachEintreffen`) `nodemailer` als SMTP-Client, ebenfalls Standard-Wahl im Node-Ökosystem.

**Begründung:** `node-imap` (Option 2) ist seit mehreren Jahren ohne Release, `imapflow` ist der von den ursprünglichen `node-imap`-Betreuern empfohlene Nachfolger mit aktiver Wartung und nativer async/await-API, die sich sauber in die restliche TypeScript-strict-Codebasis einfügt. Ein eigener Client (Option 3) würde IDLE, TLS-Handshake-Kanten und MIME-Encoding-Vielfalt neu erfinden — das ist genau die Art von Rad, die AGENTS.md §2 mit "moderne, gepflegte Bibliothek" vermeiden will.

**Konsequenzen:** drei neue Produktions-Abhängigkeiten (`imapflow`, `mailparser`, `nodemailer`) in `packages/mail-ingest` bzw. `apps/web` (nur für den Testmail-Versand). Für strukturiertes Logging im Dienst kommt `pino` dazu (AGENTS.md-Vorgabe aus dem Issue: systemd-journal-lesbares JSON-Logging).

---

## Weitere Design-Punkte

- **Storage-Bucket-Trennung:** Mail-Anhänge landen in einem eigenen Bucket `mail_anhaenge`, nicht in `kunden_quelldokumente` — semantisch unterschiedlicher Zweck (Ingest-Rohmaterial vs. bewusst hochgeladenes Profil-Quellmaterial) und unterschiedliche DSGVO-Löschfrist-Betrachtung (Anhänge folgen der Vorgangs-Löschfrist, nicht der 12-Monats-Frist aus `docs/decisions/2026-07-12_kundenprofil-ki-befuellung.md`).
- **Passwort-Verschlüsselung:** `pgcrypto`s `pgp_sym_encrypt`/`pgp_sym_decrypt` mit einem Server-seitigen Schlüssel aus der Env-Var `IMAP_PASSWORT_VERSCHLUESSELUNGS_SCHLUESSEL` (nie im Repo, siehe `docs/ops/imap-verschluesselung.md`). Das ist symmetrische Verschlüsselung auf Anwendungs-Ebene, kein Postgres-natives Feature wie `pgsodium` — bewusst die pragmatischere Wahl für v1, weil `pgcrypto` eine Standard-Postgres-Contrib-Extension ist (keine zusätzliche Infrastruktur, läuft auch im nackten pgTAP-CI-Container aus `.github/workflows/ci.yml`).
- **Spaltenschutz für `imap_passwort_verschluesselt`:** RLS filtert Zeilen, nicht Spalten. Die Klartext-Ausschluss-Anforderung aus dem Issue ("nie im Klartext lesbar") wird zusätzlich über spaltenspezifische `GRANT SELECT (...)`-Rechte durchgesetzt, die diese eine Spalte für die Rolle `authenticated` explizit ausschließen (siehe Migration und `supabase/tests/helpers/001_grants.sql`, wo die pauschale Test-Grant-Regel für genau diese Tabelle nachträglich eingeschränkt wird). Selbst ohne diesen Schutz enthält die Spalte ohnehin nur `pgp_sym_encrypt`-Chiffretext, nie Klartext — der Spaltenschutz ist eine zusätzliche Tiefenverteidigung, keine alleinige Absicherung.
- **Nicht Teil dieses PRs (bewusst, siehe Issue):** SMTP-Ausgang, OAuth/Modern-Auth gegen Gmail/M365, PGP-Entschlüsselung eingehender PGP-Mails, mehrere Konsolen-Postfächer, AVV-Anhänge für Modus B, Uptime-Monitoring des Ingest-Dienstes.
