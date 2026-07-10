# Build Plan v0.1 — 8-Wochen-Bauplan Intake-Konsole SaaS

**Stand:** 10. Juli 2026
**Zeitraum:** Woche 1 startet am Montag, 13. Juli 2026, Woche 8 endet am Freitag, 4. September 2026
**Ziel:** Am Ende von Woche 8 steht ein Mandantenfähiges DSGVO-konformes SaaS mit produktiver Intake-Konsole plus drei Backend-Handlern (W1, W2, W3) im Pilot bei Mensch Kreativagentur München.

---

## Prinzipien der Delegation

**Bastian ist Sparringspartner und Reviewer, nicht Bauer.** Alle konkrete Implementierungsarbeit läuft über Claude Code in stage-first-Disziplin, analog zu deinem Akquiro-Muster. Bastian trifft strategische Entscheidungen, reviewt PRs, und akzeptiert oder verwirft Vorschläge. Er schreibt keinen Code.

**Reviewer-Slots sind fest, nicht ad hoc.** Zwei feste Slots pro Werktag: einer morgens (60 bis 90 Minuten), einer nachmittags (30 bis 60 Minuten). Insgesamt geplant 12 bis 15 Stunden pro Woche. Wenn diese Zahl nicht realistisch ist: sofort in der ersten Session am Montag korrigieren.

**Delegations-Setup:** claude-code-action als GitHub-App im SaaS-Repo, Auto-Review auf jeder stage-PR mit Security- und Handler-Contract-Focus. Renovate für Deps. Gitleaks für Secret-Scanning. Alle drei aus der Empfehlung, die wir letzte Woche für Akquiro besprochen haben, direkt einsetzbar.

**Konzept-vor-Code-Regel:** kein Feature wird gebaut, dessen Handler-Contract oder API-Schnittstelle oder Datenmodell-Aspekt nicht in einem Konzept-Dokument (Markdown im repo unter `/docs/decisions/`) vorher fixiert wurde. Analog zu deinem gewohnten Muster.

**Der Prototyp ist Steinbruch, nicht Fundament.** Die bestehende Intake-Konsole (siehe Handoff-Dokument) liefert Prompt-Content, UX-Prinzipien, und Klassifikations-Logik. Der Code selbst wird nicht übernommen, weil er Single-Tenant und ohne DSGVO-Härtung ist. Aber die produktiv gehärteten Erkenntnisse fließen ein.

---

## Drei parallele Spuren

Über die acht Wochen laufen drei Spuren parallel, mit unterschiedlichen Verantwortlichkeiten:

**Spur A: Bau.** Konsole, Datenmodell, drei Backend-Handler, DevOps, DSGVO-Härtung. Verantwortung: Claude Code + Bastian als Reviewer. Zeit-Anteil: der Hauptteil deiner Reviewer-Zeit.

**Spur B: Gesellschaft.** Firmengründung, AVV-Vorlagen, Impressum, Datenschutzerklärung, Bank, Steuer, Marke. Verantwortung: externe Berater (Notar, Steuerberater, Anwältin für Datenschutz und Marke), gesteuert durch Bastian. Zeit-Anteil: 2 bis 3 Stunden Bastian-Zeit pro Woche, hauptsächlich Termin-Koordination.

**Spur C: Pilot.** Mensch Kreativagentur als Design-Partner-Pilot, Vertragsanbahnung, Datenzugang-Klärung, Pilot-Kick-off, laufendes Feedback. Verantwortung: Bastian direkt, weil er die Beziehung hat. Zeit-Anteil: 1 bis 3 Stunden pro Woche, ansteigend in den letzten Wochen.

Details zu Spur B und C in Datei 4 (`GESELLSCHAFT_UND_PILOT_v0.1.md`).

---

## Woche für Woche

### Woche 1 (13. bis 17. Juli 2026): Spec-Feinschliff und Setup

**Ziel der Woche:** Alle vier Spec-Dateien sind ready-for-build, das Repo ist eingerichtet, Delegations-Infrastruktur läuft.

**Spur A (Bau) diese Woche:**
- Montag: Bastian markiert die vier Spec-Dateien (SAAS_SPEC, WORKFLOW_HANDLERS, BUILD_PLAN, GESELLSCHAFT_UND_PILOT), du und ich gehen die Markierungen zusammen durch, wir schärfen v0.1 zu v1.0 nach.
- Dienstag: Repo-Setup. GitHub-Repo anlegen, claude-code-action installieren, Renovate konfigurieren, Gitleaks als PR-Gate, README mit Kern-Konzept.
- Mittwoch: Design-Decisions-Log unter `/docs/decisions/` anlegen. Erste drei Decisions: Tech-Stack (Next.js 15, Supabase, TypeScript), Deployment (Hetzner mit Tailscale, Caddy, GitHub Actions), Hosting-Struktur (Multi-Region-Backup wie in Spec 12.5).
- Donnerstag: Konzept-Dokument für das Datenmodell im Detail. Tabellen, Indizes, RLS-Policies. Reviewer-Slot 90 Minuten für dich, dann Claude Code baut die Migrations.
- Freitag: Konzept-Dokument für die Klassifikations-Layer-Schnittstelle. Nach welchem Muster wird der LLM aufgerufen, wie sieht das Retry- und Failure-Handling aus, wie ist die Handler-Queue aufgebaut.

**Spur B (Gesellschaft) diese Woche:**
- Notar-Termin ausmachen für Woche 2 oder 3
- Steuerberater-Termin ausmachen für Woche 2
- Markenrecherche starten (extern beauftragen bei einer Markenrechts-Kanzlei, kein manueller DIY)
- Firmennamen-Longlist erstellen (Bastian, in einer 45-Minuten-Session)

**Spur C (Pilot) diese Woche:**
- Erstes Gespräch mit der Chefin von Mensch Kreativagentur (Dienstag oder Mittwoch). Zweck: Konzept-Vorstellung, grundsätzliche Bereitschaft zum Design-Partner-Pilot, unverbindliche Kommittierung.
- Wenn Ja: kurzes Follow-up per E-Mail mit den nächsten Schritten.

**Reviewer-Zeit-Budget diese Woche:** ~15 Stunden. Höher als der Durchschnitt, weil die Grundlagen gelegt werden.

**Meilensteine:**
- Vier Spec-Dateien sind auf v1.0 (nicht mehr v0.1)
- Repo läuft mit claude-code-action, Renovate, Gitleaks
- Erste 3 Design-Decisions committed
- Datenmodell und Klassifikations-Schnittstelle konzeptionell fixiert
- Mensch-Chefin hat grundsätzlich zugesagt zum Pilot

**Entscheidungspunkte:**
- Preis-Struktur endgültig festlegen (siehe SAAS_SPEC §13 Frage 1)
- Autonomie-Level-Default (Spec §5.1)
- v1-Handler-Umfang (nur W1, W2, W3 oder mehr?)

**Risiken:**
- Mensch-Chefin sagt ab. Fallback: eine zweite Boutique aus deinem Netzwerk anfragen (bitte Optionen in Datei 4 nennen).
- Datenmodell wird komplexer als in der Spec skizziert. Fallback: nachbessern, kein Show-Stopper.
- Reviewer-Zeit-Budget nicht realistisch. Fallback: Bauplan strecken auf 10 statt 8 Wochen.

---

### Woche 2 (20. bis 24. Juli 2026): Datenmodell, Mandanten-Trennung, Basis-Auth

**Ziel der Woche:** Datenmodell steht in Supabase, RLS-Policies sind aktiv, Auth-Grundlagen laufen, erstes leeres Konsolen-UI ist deployed.

**Spur A (Bau) diese Woche:**
- Montag bis Mittwoch: Datenmodell-Implementation. Alle Tabellen, RLS-Policies pro Rolle (Chef, Manager, Editor, Reader, Guest), Basis-Auth mit Supabase Auth, Multi-Tenant-Middleware im Next.js. Claude Code baut in stage-first, du reviewst zwei Stage-PRs (Datenmodell, RLS).
- Donnerstag: erstes deploybares Konsolen-Grundgerüst. Login, Landing-Page, Placeholder für Vorgangs-Liste. Deployment auf stage.<domain>.
- Freitag: erste manuelle Vorgangs-Ablage-Funktion. Beraterin kann manuell einen Vorgang eingeben, System speichert in DB. Keine LLM-Klassifikation noch, das kommt Woche 3.

**Spur B (Gesellschaft) diese Woche:**
- Notar-Termin (falls diese Woche möglich, sonst Woche 3)
- Steuerberater-Erstgespräch: Rechtsform (UG haftungsbeschränkt vermutlich, wie bei Marktwerk, oder GmbH gleich zu Beginn wegen SaaS-Investoren-Perspektive)
- Handelsregister-Vorbereitung
- Markenrecherche-Zwischenstand von der Kanzlei erhalten

**Spur C (Pilot) diese Woche:**
- Zweites Gespräch mit Mensch-Chefin: Design-Partner-Vertrag durchsprechen (Vorlage siehe Datei 4), symbolischer Preis, Rechte und Pflichten, Ausstiegs-Klauseln.
- Wenn Zustimmung: Vertrag von Bastians Anwältin gegenprüfen lassen, dann unterschreiben.

**Reviewer-Zeit-Budget diese Woche:** ~12 Stunden.

**Meilensteine:**
- Datenmodell mit RLS aktiv
- Auth funktioniert
- Erstes Konsolen-Grundgerüst deployed auf stage
- Manuelle Vorgangs-Ablage speichert korrekt in der Datenbank

**Entscheidungspunkte:**
- Rechtsform (UG oder GmbH)
- Erste Firmennamen-Shortlist aus Markenrecherche
- Design-Partner-Vertrag mit Mensch

**Risiken:**
- RLS-Policies sind komplex und fehleranfällig. Panel-Empfehlung Wächter: eine Test-Suite mit RLS-spezifischen Assertions vorher konzipieren.
- Notartermin verschiebt sich. Kein Show-Stopper, Bau geht weiter.

---

### Woche 3 (27. bis 31. Juli 2026): Klassifikations-Layer und W2 als Referenz-Handler

**Ziel der Woche:** Der Klassifikations-Layer läuft für eingehende manuelle Vorgänge. Der erste Backend-Handler (W2 Presseanfragen-Drafter) ist als Grund-Implementation da.

**Spur A (Bau) diese Woche:**
- Montag: Klassifikations-Layer-Konzept committen (falls Woche 1 nicht ganz fertig). Prompt-Struktur, LLM-Wahl, Retry-Semantik.
- Dienstag bis Donnerstag: Klassifikations-Layer bauen. Manuelle Vorgangs-Ablage aus Woche 2 wird als Input verwendet, LLM produziert Klassifikations-Output nach dem JSON-Schema aus Spec §3.4. Erste UX-Ansicht in der Konsole: Klassifikations-Ergebnis wird angezeigt.
- Freitag: Anfang W2 Handler. Konzept-Dokument in `/docs/decisions/W2_handler.md`, dann Grund-Implementation mit den vier Stages aus Handler-Spec.

**Spur B (Gesellschaft) diese Woche:**
- Notar-Termin (falls diese Woche)
- Handelsregister-Anmeldung
- Bankkonto-Vorbereitung (Termin machen)
- Impressum und Datenschutzerklärung als Entwurf von der DSGVO-Anwältin

**Spur C (Pilot) diese Woche:**
- Design-Partner-Vertrag mit Mensch unterschrieben
- Datenzugang-Klärung: welche Kunden von Mensch werden im Pilot mitmachen (mit Mensch besprechen, Zustimmung dieser Endkunden holen)
- Pilot-Erfolgs-Kriterien mit Mensch definieren (siehe Datei 4)

**Reviewer-Zeit-Budget diese Woche:** ~13 Stunden.

**Meilensteine:**
- Klassifikations-Layer produziert korrekte JSON-Outputs für manuelle Test-Vorgänge
- W2-Handler ist konzeptionell fixiert und in Grund-Implementation
- Mensch-Vertrag unterschrieben
- Erste Endkunden von Mensch zur Pilot-Teilnahme identifiziert

**Entscheidungspunkte:**
- Prompt-Feinschliff bei der Klassifikation (positive und negative Referenz-Tests aus Spec §7.3 und §7.4 laufen)
- W2-Detail-Umfang für v1

**Risiken:**
- Klassifikations-Qualität nicht ausreichend. Panel-Empfehlung Sammer: Test-Suite mit 20 Referenz-Vorgängen (positive und negative) bauen, gegen die kontinuierlich getestet wird.
- W2 ist der komplexeste Handler, kann Woche 4 hineinlaufen. Puffer eingeplant.

---

### Woche 4 (3. bis 7. August 2026): W2 fertig, W1 als zweiter Handler, E-Mail-Kanal

**Ziel der Woche:** W2 ist funktional komplett. W1 (Pressemitteilungs-Drafter) startet. E-Mail-Kanal ist als erster automatischer Kanal angebunden.

**Spur A (Bau) diese Woche:**
- Montag: W2 finalisieren, Test-Suite laufen lassen, Regressionen fixen
- Dienstag bis Mittwoch: W1 konzeptionell und Grund-Implementation
- Donnerstag bis Freitag: E-Mail-Kanal-Anbindung. IMAP-Polling oder Webhook (je nach Provider-Wahl). Eingehende Mail wird zu einem Vorgang, geht durch Klassifikation.

**Spur B (Gesellschaft) diese Woche:**
- Handelsregister-Eintragung finalisieren
- Bankkonto eröffnet
- Impressum und Datenschutzerklärung finalisiert und rechtlich geprüft
- AVV-Vorlage von der Anwältin (Standard-AVV für den SaaS)

**Spur C (Pilot) diese Woche:**
- Erste zwei bis drei Kunden von Mensch als Pilot-Teilnehmer bestätigt
- Erste Endkunden-Zustimmung eingeholt
- Onboarding-Termine mit Mensch für Woche 6 vorbereitet

**Reviewer-Zeit-Budget diese Woche:** ~14 Stunden.

**Meilensteine:**
- W2 produktions-tauglich
- W1 in Grund-Implementation
- E-Mail-Kanal live auf stage
- Gesellschaft im Handelsregister
- AVV-Vorlage steht

**Entscheidungspunkte:**
- E-Mail-Provider-Wahl (welchen IMAP-Provider, oder eigene Postfach-Infrastruktur)

**Risiken:**
- Handler-Qualität ohne echten Kunden-Kontext bleibt hypothetisch. Panel-Empfehlung Ostermeier: mit Mensch möglichst früh die ersten realen Vorgänge durchgehen, auch wenn stage-only.

---

### Woche 5 (10. bis 14. August 2026): W3 Monitoring, WhatsApp-Kanal, erste Handler-Sandbox mit Mensch

**Ziel der Woche:** W3 startet. WhatsApp Business API ist angebunden. Erste stage-Sandbox mit einem realen Mensch-Kunde-Testvorgang.

**Spur A (Bau) diese Woche:**
- Montag bis Dienstag: W3 konzeptionell und Grund-Implementation. Clippings-Ingest über RSS und CSV-Upload.
- Mittwoch bis Donnerstag: WhatsApp Business API-Anbindung. Meta-App registrieren, Business-Profile für die ersten Test-Kunden anlegen, Message-Webhook einrichten, Sprachnotiz-Transkription integrieren.
- Freitag: erste End-to-End-Sandbox mit einem realen Mensch-Kunden-Absender (mit Zustimmung des Endkunden): eine E-Mail wird geschickt, geht durch die Konsole, wird klassifiziert, W1 oder W2 wird aufgerufen, Beraterin von Mensch sieht Entwurf, gibt Feedback.

**Spur B (Gesellschaft) diese Woche:**
- Vertragsentwürfe für den ersten regulären SaaS-Kunden (später, nach Mensch-Pilot)
- Buchhaltungs-Setup mit Steuerberater
- Erste Rechnungs-Templates

**Spur C (Pilot) diese Woche:**
- Onboarding-Vorbereitung mit Mensch: Kunden-Grunddaten anlegen, Kontaktdatenbank aufbauen, Autonomie-Level pro Kunde entscheiden
- Erste Feedback-Runde nach der Freitags-Sandbox

**Reviewer-Zeit-Budget diese Woche:** ~15 Stunden.

**Meilensteine:**
- W3 in Grund-Implementation
- WhatsApp-Kanal live auf stage
- Erster realer End-to-End-Vorgang durchlaufen (mit Feedback)

**Entscheidungspunkte:**
- Nach dem ersten realen Feedback: welche Klassifikations- und Handler-Anpassungen sind nötig
- Autonomie-Level-Default für Mensch-Pilot

**Risiken:**
- WhatsApp Business API-Onboarding kann sich verzögern (Meta-Verifizierungsprozess). Fallback: WhatsApp für den Pilot verschoben auf v1.1, in v1 nur E-Mail und manuelle Ablage.

---

### Woche 6 (17. bis 21. August 2026): Härtung, Audit-Backend, Onboarding-Flow

**Ziel der Woche:** Audit-Backend funktioniert. Onboarding-Flow für neue Kunden ist implementiert. Härtung der drei Handler mit Fokus auf Failure-Modi.

**Spur A (Bau) diese Woche:**
- Montag bis Dienstag: Audit-Backend. Append-only Log-Tabelle, Zugriffs-Interface für Chef und Manager, Wochen-Report-Generierung.
- Mittwoch bis Donnerstag: Onboarding-Flow. Multi-Step-UI für neue Agentur-Registrierung und für neue Kunden-Anlage. Corporate-Design-Upload. Team-Einladungen.
- Freitag: Härtung der drei Handler. Failure-Modi durchspielen (LLM-Ausfall, Rate-Limit, Timeout), Fallbacks testen.

**Spur B (Gesellschaft) diese Woche:**
- Datenschutz-Beauftragte:r extern beauftragen
- Cyber-Versicherung anfragen (für die SaaS-Gesellschaft)

**Spur C (Pilot) diese Woche:**
- Mensch macht das echte Onboarding auf stage: eine Chefin loggt sich ein, legt zwei Kunden an, konfiguriert, gibt Feedback zum Onboarding-Flow
- Ergebnisse fließen in UX-Anpassungen zurück

**Reviewer-Zeit-Budget diese Woche:** ~12 Stunden.

**Meilensteine:**
- Audit-Backend funktional
- Onboarding-Flow durchlaufen (durch Mensch)
- Handler-Härtungs-Tests bestanden

**Entscheidungspunkte:**
- UX-Feinschliff basierend auf Mensch-Feedback
- Cyber-Versicherungs-Höhe

---

### Woche 7 (24. bis 28. August 2026): Produktions-Deployment, DSGVO-Abschluss, Mensch-Pilot-Kick-off

**Ziel der Woche:** Produktions-Deployment auf konsole.<domain>.de. DSGVO-Compliance-Prüfung abgeschlossen. Mensch-Pilot-Kick-off Ende der Woche.

**Spur A (Bau) diese Woche:**
- Montag bis Dienstag: Produktions-Deployment einrichten. Multi-Region-Backup wie in Spec §12.5. Monitoring (Uptime, LLM-Kosten, Fehler-Raten). Alarmierung.
- Mittwoch bis Donnerstag: DSGVO-Compliance-Endprüfung. Rechte-der-Betroffenen-Prozess durchspielen (Auskunft, Berichtigung, Löschung). AVV zwischen SaaS-Gesellschaft und Mensch unterschreiben.
- Freitag: Mensch-Pilot-Kick-off. Chefin und ihre Beraterinnen bekommen ihre Zugänge, erste echte Vorgänge werden geführt (auf Stufe 1 Shadow-Mode).

**Spur B (Gesellschaft) diese Woche:**
- Alle Verträge zwischen SaaS-Gesellschaft und Mensch unterschrieben (Design-Partner-Vertrag, AVV, Preisstruktur)
- Erste Rechnung an Mensch (symbolisch 100 Euro für den ersten Monat)

**Spur C (Pilot) diese Woche:**
- Pilot läuft
- Tägliches kurzes Sync mit Mensch-Chefin (10 Minuten per Voice-Nachricht) zur Feedback-Sammlung

**Reviewer-Zeit-Budget diese Woche:** ~13 Stunden.

**Meilensteine:**
- Produktions-Umgebung läuft
- DSGVO-Compliance dokumentiert
- Mensch-Pilot läuft (Shadow-Mode)

**Entscheidungspunkte:**
- Autonomie-Level pro Mensch-Kunde nach der ersten Woche Shadow-Mode
- Marketing-Auftakt-Vorbereitung (für Woche 9 und später)

---

### Woche 8 (31. August bis 4. September 2026): Pilot-Betrieb, Feedback-Iteration, v1.0-Release

**Ziel der Woche:** Erste Woche mit produktivem Pilot-Betrieb. Feedback-Iteration. v1.0-Release-Marker gesetzt.

**Spur A (Bau) diese Woche:**
- Montag bis Freitag: kontinuierliche Feedback-Umsetzung. Klassifikations-Feinschliff basierend auf realen Vorgängen bei Mensch. Handler-Prompt-Verbesserungen. UX-Detail-Anpassungen.
- Freitag: v1.0-Release-Tag im Repo. Dokumentation abschließen.

**Spur B (Gesellschaft) diese Woche:**
- Nichts Spezielles außer laufenden Buchhaltungs-Kleinigkeiten

**Spur C (Pilot) diese Woche:**
- Pilot in Vollbetrieb
- Ende der Woche: Retro mit Mensch-Chefin (60 Minuten)
- Nach positiver Retro: Zustimmung zum Umschalten auf Autonomie-Level 2 für ausgewählte Kunden

**Reviewer-Zeit-Budget diese Woche:** ~10 Stunden.

**Meilensteine:**
- v1.0-Release
- Mensch-Pilot läuft produktiv
- Retro-Feedback dokumentiert und priorisiert

**Entscheidungspunkte:**
- Ausbau auf Autonomie-Level 2
- Anfang der Ansprache zweiter Pilot-Kunden (extern zu deinem Netzwerk)

---

## Was am Ende von Woche 8 fertig ist

**Produkt:**
- Intake-Konsole SaaS läuft produktiv auf konsole.<domain>.de
- Mandantenfähigkeit voll implementiert (RLS-basiert)
- Drei Backend-Handler produktiv: W1, W2, W3
- E-Mail-Kanal und manuelle Ablage funktional
- WhatsApp-Kanal je nach Meta-Verifizierung produktiv oder in Beta
- Onboarding-Flow für neue Agentur-Kunden
- Audit-Backend mit Wochen-Reports

**Gesellschaft:**
- Firma gegründet, im Handelsregister
- Standard-AVV, Impressum, Datenschutzerklärung, AGB
- Bankkonto, Steuerberater, Datenschutz-Beauftragte:r
- Marke geprüft und ggf. angemeldet
- Cyber-Versicherung abgeschlossen

**Pilot:**
- Mensch Kreativagentur produktiv im Pilot mit zwei bis vier Kunden
- Design-Partner-Vertrag unterschrieben
- Erstes Feedback in Iteration eingeflossen
- Zustimmung für Ausbau auf Autonomie-Level 2

## Was am Ende von Woche 8 noch NICHT fertig ist

Panel-ehrlicher Vermerk:

- W4, W5, W6 sind konzeptionell in Datei 2, aber nicht implementiert. Kommen in Wochen 9 bis 12.
- Zweite Pilot-Agentur ist angefragt, aber nicht produktiv. Kommt in Wochen 9 bis 10.
- Marketing- und Vertriebs-Auftakt ist konzeptionell vorbereitet, aber Kampagnen laufen nicht. Kommen in Wochen 10 bis 12.
- Preisliste und Abrechnungs-Automatisierung sind für den Mensch-Pilot ausreichend, aber nicht für Skalierung. Kommt in Wochen 9 bis 10.
- Detailliertere Analytics und Erfolgsmessungs-Tools sind rudimentär. Ausbau in Wochen 11 bis 14.

---

## Wenn etwas schiefgeht

**Realistische Verzögerungs-Szenarien:**

**Verzögerung 1: Reviewer-Zeit reicht nicht.** Wenn nach Woche 2 klar ist, dass 12 bis 15 Stunden pro Woche nicht drin sind, Streckung auf 10 statt 8 Wochen. Kein Show-Stopper.

**Verzögerung 2: Mensch sagt ab oder bricht Pilot ab.** Fallback: zweite Boutique aus dem Netzwerk. Optionen bitte in Datei 4 sammeln.

**Verzögerung 3: WhatsApp-Verifizierung dauert länger.** Fallback: v1 ohne WhatsApp, kommt in v1.1 (2 bis 4 Wochen später). E-Mail und manuelle Ablage reichen für den Kern-Pilot.

**Verzögerung 4: Handler-Qualität nicht überzeugend.** Fallback: mehr Zeit für Prompt-Feinschliff, weniger Zeit für neue Features. Qualität geht vor Umfang.

**Verzögerung 5: DSGVO-Compliance-Anforderung wird strenger als erwartet.** Fallback: Datenschutz-Beauftragte:r früher einbinden (Woche 4 statt Woche 6), Pilot-Start nach hinten schieben.

---

## Nach Woche 8: der Blick nach vorne

**Woche 9 bis 12:** Zweiter Pilot-Kunde, W4 Beta, Marketing-Auftakt.
**Woche 13 bis 16:** W5 und W6 Beta, erste vier bis sechs zahlende Kunden.
**Woche 17 bis 24:** Konsolidierung, W1.x-Feinschliff, Vertriebs-Beschleunigung.
**Ende Q1 2027:** 15 bis 25 zahlende Agenturen als realistisches Ziel.

Diese Blick-nach-vorne-Zahlen sind Rupps und Zieglers Panel-Schätzungen, nicht harte Zusagen. Sie hängen ab von Marketing-Effektivität und Wettbewerbsdynamik.

---

*Ende v0.1. Dieser Plan wird in Woche 1 zu v1.0 verfeinert, sobald die Spec markiert und die Reviewer-Zeit-Realität geklärt ist.*
