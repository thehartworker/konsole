-- NUR fuer lokale Entwicklung und Demos. NIEMALS in Produktion einspielen.
--
-- Issue #47 (Konsolen-Setup-Haertung): ein vollstaendiges, schema-konformes
-- Handler-Ergebnis (W1Output, siehe packages/handlers/src/w1/schema.ts) in
-- der DB, damit man die Konsole lokal durchklicken kann, ohne selbst ein
-- SQL-Fixture zusammenbauen zu muessen. Siehe docs/decisions/
-- 2026-07-14_konsolen-setup-haertung.md, Baustein D.
--
-- Fiktives Szenario: MENSCH Kreativagentur (der Pilot-Agentur aus
-- GESELLSCHAFT_UND_PILOT_v1.0.md Teil B) betreut den fiktiven Pharma-Kunden
-- "Neurabin Pharma GmbH" bei der Presseanfrage zur Markteinfuehrung ihres
-- Praeparats "Neurabin". Der W1-Handler hat bereits einen Entwurf samt
-- Kritiker-Pass und Grenzpruefung erzeugt -- inklusive eines HWG-relevanten
-- Grenz-Verstosses und eines hoch eingestuften Kritiker-Findings, damit der
-- Menschen-Abzweig (Compliance-Panel, AGENTS.md Pharma-Erweiterung) an
-- echten Beispieldaten durchgeklickt werden kann.
--
-- Idempotent: feste UUIDs, ON CONFLICT (id) DO NOTHING auf jeder Tabelle.
-- Reihenfolge ist wichtig (FK-Abhaengigkeiten): Agentur vor Kunde vor
-- Auth-User (der Trigger handle_new_user() braucht die Agentur-Zeile schon
-- beim auth.users-Insert) vor Vorgang vor Anliegen vor Handler-Aufruf.

-- ============================================================
-- agenturen: MENSCH Kreativagentur
-- ============================================================

INSERT INTO agenturen (id, name, slug) VALUES
  ('66666666-6666-6666-6666-666666666661', 'MENSCH Kreativagentur GmbH & Co. KG', 'mensch-kreativagentur')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- kunden: Neurabin Pharma GmbH (Pharma-Kunde von MENSCH)
-- ============================================================

INSERT INTO kunden (id, agentur_id, name, slug, autonomie_level, retention_monate) VALUES
  ('77777777-7777-7777-7777-777777777771', '66666666-6666-6666-6666-666666666661',
   'Neurabin Pharma GmbH', 'neurabin-pharma', 1, 24)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- auth.users: eine Beraterin bei MENSCH (Rolle chef, damit RLS-Zugriff
-- unabhaengig von einer expliziten Kunden-Zuweisung funktioniert -- siehe
-- darf_vorgang_bearbeiten() in 20260713140000_konsole_block1_freigabe.sql).
-- raw_user_meta_data fuettert handle_new_user() (agentur_id/rolle
-- verpflichtend, siehe 20260711140000_auth_nutzer_verknuepfung.sql) --
-- kein Bootstrap-Modus, kein manueller nutzer-Insert noetig.
-- ============================================================

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) VALUES
  ('00000000-0000-0000-0000-000000000000', '88888888-8888-8888-8888-888888888881',
   'authenticated', 'authenticated', 'julia.reiter@mensch-kreativagentur.example',
   crypt('lokal-pilot-passwort-nur-fuer-demo', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}',
   jsonb_build_object('agentur_id', '66666666-6666-6666-6666-666666666661', 'rolle', 'chef', 'name', 'Julia Reiter'),
   now(), now(), '', '', '', '')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- vorgaenge: Presseanfrage zur Neurabin-Markteinfuehrung
-- ============================================================

INSERT INTO vorgaenge (
  id, kunde_id, kanal, absender_identifikator, absender_name, eingang_at,
  betreff, inhalt_text, sensitivity, typ_primaer, typ_sekundaer, confidence,
  prioritaet, zustaendige_nutzer_id, klassifikation_status,
  klassifikation_gestartet_at, klassifikation_beendet_at, status
) VALUES
  ('99999999-9999-9999-9999-999999999991', '77777777-7777-7777-7777-777777777771',
   'email', 'presse@neurabin-pharma.example', 'Presseabteilung Neurabin Pharma', now() - interval '6 hours',
   'Presseanfrage zur Markteinfuehrung von Neurabin',
   'Wir moechten zum Marktstart von Neurabin eine Pressemitteilung veroeffentlichen. Bitte einen Entwurf vorbereiten.',
   'regulatorisch_relevant', 'Anfrage', 'Presseanfrage', 88,
   'hoch', '88888888-8888-8888-8888-888888888881', 'done',
   now() - interval '6 hours', now() - interval '5 hours', 'in_bearbeitung')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- anliegen: das eine Presseanfrage-Anliegen dieses Vorgangs
-- ============================================================

INSERT INTO anliegen (
  id, vorgang_id, beschreibung, prioritaet, backend_handler_vorschlag, backend_handler_input
) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '99999999-9999-9999-9999-999999999991',
   'Pressemitteilung zur Markteinfuehrung von Neurabin entwerfen', 'hoch',
   'W1_pressemitteilung_drafter',
   $json$
   {
     "briefing": {
       "anlass": "Markteinfuehrung von Neurabin",
       "kernbotschaft": "Neurabin bietet Patientinnen und Patienten mit chronischer Migraene eine neue Therapieoption mit verbessertem Nebenwirkungsprofil.",
       "fakten": [
         "Zulassung durch die zustaendige Arzneimittelbehoerde nach Abschluss der Phase-III-Studien",
         "Markstart in Deutschland zum 1. Oktober 2026"
       ],
       "zitat_sprecher": "Dr. Elena Vogt",
       "zitat_kernaussage": "Deutlich verbessertes Nebenwirkungsprofil gegenueber bisherigen Therapien.",
       "ziel_medien_gruppe": "Fachpresse Gesundheit/Pharma",
       "boilerplate_referenz": null,
       "laenge_ziel": "standard",
       "sperrfrist_at": null,
       "zusatz_hinweis": "Praeparat ist verschreibungspflichtig, HWG-Pruefung zwingend."
     },
     "kunde_kontext": {
       "kunde_slug": "neurabin-pharma",
       "tonalitaet": {
         "grundton": "sachlich-serioes",
         "stil_parameter": { "satzlaenge": "mittel" },
         "anrede_konvention": "sie",
         "gendering_konvention": "gender-doppelpunkt"
       }
     }
   }
   $json$::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- handler_aufrufe: der W1-Lauf mit vollstaendigem, schema-konformem
-- W1Output (packages/handlers/src/w1/schema.ts), inklusive eines
-- HWG-relevanten Grenz-Verstosses und eines hoch eingestuften
-- Kritiker-Findings, damit der Menschen-Abzweig im Compliance-Panel
-- (apps/web/.../compliance-panel.tsx) an echten Beispieldaten sichtbar wird.
-- ============================================================

INSERT INTO handler_aufrufe (
  id, vorgang_id, anliegen_id, handler_slug, input, zustaendige_nutzer_id,
  prioritaet, status, ergebnis, gestartet_at, beendet_at
) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', '99999999-9999-9999-9999-999999999991',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'W1_pressemitteilung_drafter',
   $json$
   {
     "briefing": {
       "anlass": "Markteinfuehrung von Neurabin",
       "kernbotschaft": "Neurabin bietet Patientinnen und Patienten mit chronischer Migraene eine neue Therapieoption mit verbessertem Nebenwirkungsprofil.",
       "fakten": [
         "Zulassung durch die zustaendige Arzneimittelbehoerde nach Abschluss der Phase-III-Studien",
         "Markstart in Deutschland zum 1. Oktober 2026"
       ],
       "zitat_sprecher": "Dr. Elena Vogt",
       "zitat_kernaussage": "Deutlich verbessertes Nebenwirkungsprofil gegenueber bisherigen Therapien.",
       "ziel_medien_gruppe": "Fachpresse Gesundheit/Pharma",
       "boilerplate_referenz": null,
       "laenge_ziel": "standard",
       "sperrfrist_at": null,
       "zusatz_hinweis": "Praeparat ist verschreibungspflichtig, HWG-Pruefung zwingend."
     },
     "kunde_kontext": {
       "kunde_slug": "neurabin-pharma",
       "tonalitaet": {
         "grundton": "sachlich-serioes",
         "stil_parameter": { "satzlaenge": "mittel" },
         "anrede_konvention": "sie",
         "gendering_konvention": "gender-doppelpunkt"
       }
     }
   }
   $json$::jsonb,
   '88888888-8888-8888-8888-888888888881', 'hoch', 'done',
   $json$
   {
     "pressemitteilung": {
       "headline": "Neurabin: Neue Therapieoption gegen chronische Migraene startet zum 1. Oktober 2026",
       "sub_headline": "Zulassung nach Abschluss der Phase-III-Studien durch die zustaendige Arzneimittelbehoerde",
       "ort_datum": "Muenchen, 14. Juli 2026",
       "lead_absatz": "Neurabin wirkt bereits innerhalb von 30 Minuten und lindert chronische Migraene-Attacken zuverlaessig, wie die Neurabin Pharma GmbH anlaesslich der Markteinfuehrung zum 1. Oktober 2026 mitteilt.",
       "ausfuehrung_absaetze": [
         "Die Zulassung erfolgte nach Abschluss dreier Phase-III-Studien mit insgesamt mehr als 1.200 Patientinnen und Patienten.",
         "Neurabin richtet sich an Menschen mit chronischer Migraene, bei denen bisherige Therapien nicht ausreichend gewirkt haben."
       ],
       "zitat": {
         "text": "Mit Neurabin bieten wir Patientinnen und Patienten erstmals eine Therapieoption mit deutlich verbessertem Nebenwirkungsprofil.",
         "sprecher_name": "Dr. Elena Vogt",
         "sprecher_rolle": "Medizinische Leitung, Neurabin Pharma GmbH"
       },
       "boilerplate": "Neurabin Pharma GmbH ist ein forschendes Pharmaunternehmen mit Sitz in Deutschland, spezialisiert auf Therapien im Bereich Neurologie.",
       "kontakt_fusszeile": "Kontakt: Presseabteilung Neurabin Pharma GmbH\npresse@neurabin-pharma.example",
       "laenge_worte": 165
     },
     "kritiker_findings": [
       {
         "schweregrad": "hoch",
         "finding": "Die Formulierung \"wirkt bereits innerhalb von 30 Minuten\" und \"lindert ... zuverlaessig\" im Lead-Absatz ist eine nicht belegte Wirkaussage fuer ein verschreibungspflichtiges Praeparat (HWG-kritisch).",
         "empfehlung": "Wirkaussage entfernen oder durch eine konkrete Studienreferenz mit Beleg ersetzen."
       },
       {
         "schweregrad": "niedrig",
         "finding": "Der Boilerplate-Absatz nennt kein Gruendungsjahr des Unternehmens.",
         "empfehlung": "Optional ergaenzen, kein Pflichtfeld."
       }
     ],
     "grenz_pruefung_ergebnis": {
       "bestanden": false,
       "verstoesse": [
         {
           "regel_id": null,
           "baustein_name": "hwg_verbotene_wirkaussage",
           "quelle": "code",
           "begruendung": "Presseanfrage zur Markteinfuehrung eines verschreibungspflichtigen Pharma-Praeparats enthaelt eine nicht belegte Wirkaussage (\"wirkt ... zuverlaessig\") -- HWG Paragraph 3 relevant."
         }
       ]
     },
     "ueberarbeitungsbeduerftig": true,
     "benoetigt_menschliche_freigabe": true,
     "freigabe_grund": "Regulatorisch relevanter Vorgang (Pharma-Markteinfuehrung) mit Grenz-Verstoss -- Menschen-Abzweig zwingend, siehe AGENTS.md Pharma-Compliance-Erweiterung.",
     "vorschlaege_fuer_naechste_schritte": [
       "Wirkaussage mit Medizin-/Rechtsabteilung des Kunden abstimmen",
       "Nach Ueberarbeitung erneut durch den Kritiker-Pass laufen lassen"
     ],
     "hinweise": [],
     "audit_metadaten": {
       "verwendete_quellen": ["kunden_profil.tonalitaet", "kunden_profil.boilerplate"],
       "modell": "claude-opus-4-x (Platzhalter fuer Seed-Zwecke)",
       "dauer_ms": 18420,
       "tokens_input": 5400,
       "tokens_output": 1200
     }
   }
   $json$::jsonb,
   now() - interval '5 hours', now() - interval '4 hours 55 minutes')
ON CONFLICT (id) DO NOTHING;
