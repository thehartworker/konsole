# Workflow-Handler v0.1 — die sechs Backend-Fähigkeiten der Konsole

**Stand:** 10. Juli 2026
**Zweck:** Kurz-Specs der sechs Backend-Handler, die von der Intake-Konsole (siehe Datei 1) aufgerufen werden. Vollständige Handler-Specs pro Handler entstehen sukzessive in den Wochen 3 bis 8 des Bauplans (siehe Datei 3).

**Panel-Konsens zur v1-Priorisierung:**
- v1-Launch: W1, W2, W3 vollständig
- v1.1 bis v1.3: W4, W5, W6 als Beta, aktivierbar auf Anfrage
- Reihenfolge im Bau: W2 (weil operativ am reichsten belegt), W1, W3, W4, W6, W5

---

## Allgemeine Prinzipien für alle Handler

Jeder Handler ist eine eigenständig deployte Node.js-Service-Klasse mit einer standardisierten Schnittstelle zur Konsole (siehe Datei 1, Abschnitt 4.2).

Jeder Handler ist idempotent. Ein zweiter Aufruf mit demselben Input produziert denselben Output. Wichtig für Retry-Semantik.

Jeder Handler nutzt für sein RAG die pro-Kunde hinterlegte Wissensbasis. Er darf nicht mandanten-übergreifend lesen, außer aus explizit als "geteilt" markierten Sektor-Corpora.

Jeder Handler produziert ein Ergebnis mit `benoetigt_menschliche_freigabe = true`. Nichts geht ohne Beraterin-Freigabe an den Kunden. Das ist die harte Regel, die für alle sechs gilt.

Jeder Handler protokolliert seinen Lauf im Audit-Log der Konsole.

---

## W1: Pressemitteilungs-Drafter aus strukturiertem Briefing

**Version:** v0.1
**Status:** in Spec
**v1-Launch:** ja

### Trigger von der Konsole

Aufruf, wenn Klassifikation:
- `typ_primaer = "Anfrage"` oder `typ_primaer = "Projekt-Briefing"` oder `typ_primaer = "To-Do"`
- `anliegen[].backend_handler_vorschlag = "W1_pressemitteilung_drafter"`
- der Absender einen Text-Bedarf erwähnt hat, der pressemitteilungs-nah ist (Anlass, Kernbotschaft, Zitat-Bedarf)

Oder manueller Anstoß über die Konsole ("Handler erneut aufrufen mit Briefing").

### Input-Kontrakt

```typescript
interface W1Input {
  briefing: {
    anlass: string;                    // "Neue Produktlinie", "Personalie", "Studie" etc.
    kernbotschaft: string | null;      // was ist die eine Sache, die stehen bleiben soll
    fakten: string[];                  // was ist gesichert
    zitat_sprecher: string | null;     // wer zitiert (Name, Rolle)
    zitat_kernaussage: string | null;  // was soll die Person sagen
    ziel_medien_gruppe: string | null; // "Fachpresse Handel", "Regionalpresse Bayern"
    boilerplate_referenz: string | null; // Slug für Kunden-Boilerplate
    laenge_ziel: "kurz" | "standard" | "lang"; // ~300, ~500, ~800 Wörter
    sperrfrist_at: string | null;      // ISO-Datum
    zusatz_hinweis: string | null;     // freies Feld
  };
  kunde_kontext: {
    kunde_slug: string;
    tonalitaet_vorgabe: "sachlich" | "warm-handwerklich" | "technisch-praezise" | "aktivistisch";
    corporate_design_ref: string;
  };
}
```

### Backend-Verarbeitung

Drei Stages, wie im Meta-Press-Inbound-Drafter erprobt und für Pressemitteilungen adaptiert:

**Stage 1: Kontext-Sammlung.** RAG aus vier Quellen: Kunden-SSOT (freigegebene frühere Pressemitteilungen, Positions-Papers, aktuelle Boilerplate), Sektor-Corpus (branchen-typische Sprach- und Struktur-Muster, öffentlich zugänglich), Client-Final-Präzedenzen (frühere freigegebene Pressemitteilungen desselben Kunden mit höchster Autorität), aktueller Diskurs-Snapshot zum Thema (Live-Websearch letzte 30 Tage).

**Stage 2: Drafter-Pass.** Claude Sonnet-Klasse. Rolle "senior PR consultant DACH". Erzeugt strukturierten Pressemitteilungs-Text nach klassischem PR-Handwerk: Headline (aussagekräftig, kein Marketing-Sprech), Sub-Headline, Ort und Datum, Lead-Absatz (5 W-Fragen abgedeckt), zwei bis vier Ausführungs-Absätze, Zitat mit Attribution, Boilerplate, Kontakt-Fußzeile.

**Stage 3: Kritiker-Pass.** Claude Opus-Klasse. Rolle "kritischer Wirtschaftsredakteur". Prüft: ist die Headline nichtssagend, ist die Nachricht wirklich neu, gibt es unbelegte Behauptungen, wirkt das Zitat authentisch oder gestellt, sind Zahlen belastbar, ist der Aufbau redaktionell verwertbar.

Bei Kritiker-Findings mit Schweregrad "hoch": Draft wird als "überarbeitungsbedürftig" markiert und geht mit den Findings zur Beraterin.

### Output-Kontrakt

```typescript
interface W1Output {
  pressemitteilung: {
    headline: string;
    sub_headline: string | null;
    ort_datum: string;
    lead_absatz: string;
    ausfuehrung_absaetze: string[];
    zitat: {
      text: string;
      sprecher_name: string;
      sprecher_rolle: string;
    } | null;
    boilerplate: string;
    kontakt_fusszeile: string;
    laenge_worte: number;
  };
  kritiker_findings: Array<{
    schweregrad: "niedrig" | "mittel" | "hoch";
    finding: string;
    empfehlung: string;
  }>;
  benoetigt_menschliche_freigabe: true;  // immer
  freigabe_grund: "Standard: jede Pressemitteilung muss vor Versand redaktionell freigegeben werden.";
  vorschlaege_fuer_naechste_schritte: [
    "Freigabe durch Beraterin",
    "Kunde-Freigabe einholen",
    "Sperrfrist prüfen",
    "Versandliste konfigurieren"
  ];
  audit_metadaten: {
    verwendete_quellen: string[];
    modell: string;
    dauer_ms: number;
    tokens_input: number;
    tokens_output: number;
  };
}
```

### Failure-Fallbacks

- Wenn Kunden-SSOT leer: Warnung "Kunden-Präzedenzen fehlen, Draft wird generischer, Empfehlung: Kunden-SSOT aufsetzen"
- Wenn Kritiker-Pass fehlschlägt (LLM-Timeout): Draft geht ohne Kritiker-Findings raus, mit Vermerk "Kritiker-Prüfung nicht möglich"
- Wenn LLM-Rate-Limit: Retry-Semantik nach Datei 1 Abschnitt 4.4

### Human-Checkpoints spezifisch

- Vor jedem Freigabe: Beraterin muss aktiv "freigeben" klicken
- Bei Kritiker-Findings Schweregrad "hoch": Confirmation-Dialog "Es gibt kritische Punkte, sind Sie sicher, dass Sie freigeben wollen?"
- Sperrfrist wird als eigener Kontrollpunkt in der UI angezeigt

### v1-Umfang

- Standard-Pressemitteilung, keine Multi-Sprache in v1 (kommt in v1.2)
- Boilerplate-Referenz muss pro Kunde als Text hinterlegt sein (nicht dynamisch generiert)
- Keine Bild-Vorschläge in v1 (Bild-Bereitstellung ist Kunden-Aufgabe)

---

## W2: Presseanfragen-Drafter (Comms-Plan)

**Version:** v0.1
**Status:** in Spec, aus Meta-Press-Inbound-System-Erfahrung reifste Basis
**v1-Launch:** ja

### Trigger von der Konsole

Aufruf, wenn Klassifikation:
- `typ_primaer = "Anfrage"` und `typ_sekundaer = "Presseanfrage"`
- Absender ist ein Journalist oder eine Redaktion, oder der Absender leitet eine Presseanfrage weiter
- `anliegen[].backend_handler_vorschlag = "W2_presseanfragen_drafter"`

### Input-Kontrakt

```typescript
interface W2Input {
  anfrage: {
    medium_name: string;
    journalist_name: string | null;
    journalist_kontakt: string | null;
    ressort: string | null;
    thema_beschreibung: string;
    frist_at: string | null;
    fragen_woertlich: string[];
    format_gewuenscht: "schriftliche_antworten" | "interview_termin" | "hintergrund_gespraech" | "statement";
    sprecher_vorgeschlagen: string | null;
    sprecher_rolle: string | null;
  };
  kunde_kontext: {
    kunde_slug: string;
    sprachregelungen_slug: string;   // welche interne Sprachregelungen sind aktiv
    thema_positionierung: string | null;
  };
}
```

### Backend-Verarbeitung

Aus dem Meta-System übernommen, mit den 19 Feedback-Regeln, die dort produktiv sind. Vier Stages:

**Stage 1: Kontext-Sammlung.** RAG aus fünf Quellen: Sprachregelungen (interne freigegebene Positionen zum Thema), SSOT (frühere Comms-Plans desselben Kunden), externes Wissen (aktuelle öffentliche Positionen des Kunden), Client-Final-Präzedenzen (freigegebene frühere Antworten auf ähnliche Anfragen), Journalist:innen-Profil (letzte 6 bis 12 Monate Artikel des anfragenden Journalisten falls in Datenbank).

**Stage 2: Comms-Plan-Draft.** Claude Opus-Klasse. Erzeugt sechs-Felder-Struktur aus dem Meta-System:
- `what_were_doing` (englisch bei Meta, hier per Kunde konfigurierbar, Default: Sprache des Sprechers): Narrativ, was passiert
- `strategic_objectives` (ein Satz, zwei Kategorien Reputation und Risk)
- `reactive_statement` (nur wenn Sprachregelung existiert; sonst null)
- `background_information` (jsonb-Array mit topic_field, content, sources, strategy_note)
- `open_questions` (Check/Confirm/Decide-Tasks für die Beraterin)
- `key_messages` (in v1 pausiert wie im Meta-System, bleibt leer)

**Stage 3: 19-Punkte-Check.** Automatische Prüfung gegen die 19 Feedback-Regeln aus dem Meta-System-Handoff:
- Ist `what_were_doing` in der gewünschten Sprache
- Nur Reactive Statement bei vorhandener Sprachregelung
- Keine Vermittlungs-Bezüge zur Agentur
- Keine Prozess-Erklärungen
- Keine Vermutungen
- Deadline-Format standardisiert
- Keine Tier-Nennung
- Keine Framing-Risiken im Plan
- Action Items nur in `open_questions`
- Background mit Quellenangabe
- Standardisierter Deadline-Schlusssatz wenn explizite Deadline
- questions_verbatim exakt wie Original
- (weitere aus Handoff)

Verletzungen führen zu Retry mit korrigierendem Prompt.

**Stage 4: Formatierung für Export.** Der Plan wird in eine strukturierte Ausgabe gebracht, die für den Google-Docs-Export vorbereitet ist. Background-Zusammenfassung als Doc-Kommentar, Originalanfrage 1:1 am Doc-Ende. Analog zum Drive-Push-v1.7.

### Output-Kontrakt

```typescript
interface W2Output {
  comms_plan: {
    what_were_doing: string;
    strategic_objectives: {
      reputation: string;
      risk: string;
    };
    reactive_statement: string | null;
    background_information: Array<{
      topic_field: string;
      content: string;
      sources: string[];
      strategy_note: string;
    }>;
    open_questions: string[];
    key_messages: string[];  // in v1 leer
  };
  export_vorbereitung: {
    doc_titel_vorschlag: string;
    doc_kommentar_background: string;
    doc_end_appendix: string;  // Originalanfrage
  };
  benoetigt_menschliche_freigabe: true;
  freigabe_grund: "Standard: jeder Comms Plan muss vor Kunden-Weiterleitung Beraterin-freigegeben werden.";
  audit_metadaten: { ... };
}
```

### Failure-Fallbacks

- Wenn Sprachregelungen leer: `reactive_statement` bleibt null, Warnung im Draft
- Wenn Client-Final-Präzedenz-Bibliothek leer: Draft wird generischer, Vermerk "Onboarding empfohlen"
- Wenn 19-Punkte-Check nach 3 Retries fehlschlägt: Draft geht mit Findings raus, Beraterin muss manuell nachziehen

### Human-Checkpoints spezifisch

- Nach Handler-Antwort: Comms-Plan zur redaktionellen Prüfung
- Bei kritischen `open_questions` (z.B. Freigabe-Ebenen): Confirmation vor Weiterleitung
- Deadline-Warnung: wenn Frist innerhalb der nächsten 4 Stunden, hervorgehoben

### v1-Umfang

- Volles Meta-System-Feature-Set, generalisiert von Meta-spezifisch auf beliebige Sprecher-Kontexte
- Whitelist top_media_list wird zu einem konfigurierbaren "Medien-Prioritäts-Filter" pro Agentur, kein harter Ausschluss

---

## W3: Media Monitoring Digest

**Version:** v0.1
**Status:** in Spec
**v1-Launch:** ja

### Trigger von der Konsole

Zwei Trigger-Modi:

**Modus A: Periodisch getriggert.** Cron-basiert, pro Kunde konfigurierbar (Standard: montags 6 Uhr für den Wochen-Digest, oder täglich 6 Uhr für den Tages-Digest bei aktiven Themen).

**Modus B: Anlass-getriggert.** Wenn Klassifikation:
- `typ_primaer = "FYI"` mit Erwähnung von Medienberichterstattung
- Absender erwähnt ein Medienereignis, das noch nicht klassifiziert wurde
- Manueller Aufruf durch Beraterin ("Zeig mir was heute Nacht zum Kunden gelaufen ist")

### Input-Kontrakt

```typescript
interface W3Input {
  kunde_slug: string;
  zeitraum: {
    von: string;    // ISO-Datum
    bis: string;    // ISO-Datum
  };
  themen_filter: string[] | null;  // wenn null: alle Themen, sonst Filter
  clippings_quellen: Array<{
    typ: "rss" | "csv_upload" | "manuelle_liste";
    quelle_ref: string;
    letzter_lauf_at: string | null;
  }>;
  ausgabe_format: "wochendigest" | "tagesdigest" | "sonderreport";
  ziel: "intern" | "kunde_versand";
}
```

### Backend-Verarbeitung

Drei Stages:

**Stage 1: Clippings-Sammlung.** Verschiedene Quellen: RSS-Feeds (Kunden-Alerts, Google News), CSV-Uploads (Landau/PMG/Meltwater-Exports), manuelle Listen aus der Konsole. Deduplizierung nach URL und Volltext-Hash. Filterung nach Themen-Filter falls gesetzt.

**Stage 2: Analyse und Clustering.** Claude Sonnet-Klasse. Für jeden Clipping: Sentiment (positiv/neutral/negativ mit Begründung), Thema-Cluster-Zuordnung, Relevanz-Score, aktionsrelevante Erkennungen ("hier wird Reaktion erwartet"). Cluster-Bildung: ähnliche Themen zusammenfassen.

**Stage 3: Digest-Rendering.** Rendering in Wochen- oder Tagesdigest-Struktur:
- Executive Summary (3 Sätze)
- Top-3 aktionsrelevante Highlights (mit Empfehlung)
- Themen-Cluster mit je Ergebnis und Trend
- Sentiment-Verlauf über den Zeitraum
- Vergleich zur Vorperiode
- "Worüber wir nicht gesprochen haben, aber sollten" (Sammer-Feature)

### Output-Kontrakt

```typescript
interface W3Output {
  digest: {
    executive_summary: string;
    top_highlights: Array<{
      titel: string;
      quelle: string;
      url: string;
      sentiment: "positiv" | "neutral" | "negativ";
      relevanz: "hoch" | "mittel" | "niedrig";
      empfehlung: string;
    }>;
    themen_cluster: Array<{
      thema: string;
      artikel_anzahl: number;
      sentiment_dominant: string;
      trend_vorperiode: "steigend" | "gleich" | "sinkend";
      wichtigste_artikel: string[];
    }>;
    sentiment_verlauf: Array<{ datum: string; positiv: number; neutral: number; negativ: number }>;
    weisse_flecken: string[];  // "worüber wir nicht gesprochen haben"
  };
  export_vorbereitung: {
    pdf_layout_ref: string;  // Corporate-Design-Template
    kunde_versand_bereit: boolean;
  };
  benoetigt_menschliche_freigabe: true;
  freigabe_grund: "Digest muss vor Kunden-Versand redaktionell freigegeben werden.";
  audit_metadaten: { ... };
}
```

### Failure-Fallbacks

- Keine Clippings gefunden: Digest wird trotzdem gerendert, mit Vermerk "Ruhige Woche, keine relevanten Erwähnungen"
- Clippings-Quelle nicht erreichbar: Warnung im Digest, teilweise Ergebnisse
- LLM-Ausfall bei Analyse: Fallback auf einfache Sortierung, ohne Cluster und Sentiment

### Human-Checkpoints spezifisch

- Vor Kunden-Versand: Beraterin muss editieren-und-freigeben
- Anhaltend negative Sentiments: Alert an Etatdirektor:in mit Empfehlung "Krisen-Check?"

### v1-Umfang

- Wochendigest als Kern-Ausgabe
- Kunden-Versand-Format nur PDF (kein E-Mail-Newsletter in v1)
- Keine Print-Clipping-Verarbeitung in v1 (nur online)

---

## W4: Journalisten- und Medien-Intelligence plus personalisierte Ansprache

**Version:** v0.1
**Status:** in Spec, "myconvento in klein"-Konzept
**v1-Launch:** nein, v1.1 als Beta

### Trigger von der Konsole

Aufruf, wenn Klassifikation:
- `typ_primaer = "Anfrage"` oder `typ_primaer = "Projekt-Briefing"` mit Verteilerpflege-Aspekt
- Absender erwähnt Bedarf an Journalistenliste zu einem Thema
- Manueller Aufruf durch Beraterin: "Wer schreibt gerade über [Thema]"

### Input-Kontrakt

```typescript
interface W4Input {
  thema: string;
  kunde_kontext: {
    kunde_slug: string;
    branche: string;
    region_relevanz: string[];
  };
  ziel: "recherche_liste" | "ansprache_generierung" | "beides";
  ansprache_anlass: string | null;  // z.B. "Pressemitteilung zu [Thema]"
  ausschluss_medien: string[];  // Whitelist/Blacklist
  max_treffer: number;  // Default 30
}
```

### Backend-Verarbeitung

Drei Stages:

**Stage 1: Publikations-Recherche.** Suche über Google News API und optional gecrawltes Corpus (falls Agentur eigenes hat) und LinkedIn öffentliche Autoren-Profile. Zeitraum letzte 6 bis 12 Monate. Filterung nach Thema, Region, Branche.

**Stage 2: Autoren-Ranking.** Claude Sonnet-Klasse. Für jeden gefundenen Autor: Extrahierung des Publikations-Profils (welche Themen, welche Winkel, welche Häufigkeit). Ranking nach Relevanz für das Thema.

**Stage 3: Personalisierte Ansprache.** Bei `ziel = "ansprache_generierung"` oder `"beides"`: pro Top-Autor eine personalisierte Ansprache-Zeile basierend auf einem oder zwei konkreten letzten Artikeln. Kein generisches "Da Sie kürzlich...", sondern echter Bezug.

### Output-Kontrakt

```typescript
interface W4Output {
  recherche_ergebnis: {
    treffer_gesamt: number;
    autoren: Array<{
      name: string;
      medium: string;
      ressort: string | null;
      profil_zusammenfassung: string;
      relevante_artikel: Array<{
        titel: string;
        datum: string;
        url: string;
        winkel: string;
      }>;
      relevanz_score: number;  // 0-100
      kontakt_moeglich: {
        methode: string | null;  // "impressum", "linkedin", "twitter"
        hinweis: string;
      };
      ansprache_vorschlag: string | null;
    }>;
  };
  benoetigt_menschliche_freigabe: true;
  freigabe_grund: "Journalistenkontakte müssen vor Nutzung durch Beraterin geprüft werden.";
  audit_metadaten: { ... };
}
```

### Failure-Fallbacks

- Wenige Treffer: klare Ansage "Wenige aktuelle Artikel zum Thema, Empfehlung breiter suchen"
- Quelle nicht erreichbar: teilweise Ergebnisse mit Vermerk

### Human-Checkpoints spezifisch

- Vor Nutzung: Beraterin prüft Liste
- Ansprache-Vorschläge sind Entwürfe, nicht Versandtexte
- Kontakt-Aufnahme läuft nicht über den Handler, sondern bleibt bei der Beraterin

### v1-Umfang

- Nur öffentliche Recherche-Daten (keine gekauften Datenbanken in v1)
- Fokus DACH-Medien
- Keine Automatisierung des Versands

### DSGVO-Besonderheit

Journalist:innen sind publizierende Personen und stehen dadurch anders in der DSGVO als Privatpersonen. Aber: das Ranking auf Basis ihres Publikations-Verhaltens ist rechtlich als "berechtigtes Interesse" der Agentur einzuordnen und muss in der AVV klar benannt sein. Der Handler nutzt nur öffentlich zugängliche Daten. Kein Kauf von Datenbanken mit Kontaktdaten außerhalb öffentlicher Impressen in v1.

---

## W5: Terminbriefing für die Beraterin

**Version:** v0.1
**Status:** in Spec
**v1-Launch:** nein, v1.2 als Beta

### Trigger von der Konsole

Aufruf, wenn Klassifikation:
- Absender kündigt einen bevorstehenden Termin an (Kunden-Termin, Interview, Podium)
- Manueller Aufruf: "Briefing für Termin morgen mit Kunde X"

### Input-Kontrakt

```typescript
interface W5Input {
  termin_anlass: string;
  termin_datum: string;
  kunde_slug: string;
  gespraechspartner: Array<{ name: string; rolle: string; medium?: string }>;
  thema_beschreibung: string;
  briefing_umfang: "kurz" | "standard" | "detailliert";
}
```

### Backend-Verarbeitung

Zwei Stages:

**Stage 1: Kontext-Sammlung.** RAG aus vier Quellen: letzte Kunden-Kommunikation der letzten 4 Wochen, letzte öffentliche Berichterstattung über den Kunden zum Thema, offene Themen aus dem CRM/Konsole (offene Vorgänge, ausstehende Freigaben), Publikations-Profil der Gesprächspartner:innen falls Journalisten (siehe W4).

**Stage 2: Briefing-Rendering.** Claude Sonnet-Klasse. Erzeugt zwei-Seiten-Briefing:
- Zusammenfassung des Anlasses (2 Sätze)
- Kontext-Karte zum Kunden (letzter Stand, aktuelle Positionierung, offene Themen)
- Gesprächspartner:innen-Profil (bei Journalisten mit W4-Anteilen)
- Wahrscheinliche Fragen oder Winkel (falls Interview)
- Vorgeschlagene Kernbotschaften
- No-Go-Themen für den Termin
- Brückenformulierungen bei schwierigen Fragen

### Output-Kontrakt

Zwei-Seiten-Briefing-Struktur, exportierbar als PDF im Corporate-Design.

### Failure-Fallbacks

Analog zu den anderen Handlern.

### Human-Checkpoints spezifisch

- Briefing ist Entwurf, nicht finale Vorbereitung
- Beraterin ergänzt aus Kopfwissen
- Bei sensitiven Themen: Alarm an Beraterin, dass W5 möglicherweise nicht alle relevanten Punkte kennt

### v1-Umfang

- Standard-Briefing, keine Multi-Sprecher-Simulation in v1
- Keine automatische Kalender-Integration (Beraterin ruft Handler manuell auf)

---

## W6: Long-Form-zu-Multi-Channel-Transformer

**Version:** v0.1
**Status:** in Spec
**v1-Launch:** nein, v1.3 als Beta

### Trigger von der Konsole

Aufruf, wenn Klassifikation:
- SharePoint-Ablage einer freigegebenen Pressemitteilung oder eines Fachartikels
- `typ_primaer = "To-Do"` mit "Repurposing"-Signal
- Manueller Aufruf durch Beraterin

### Input-Kontrakt

```typescript
interface W6Input {
  quell_dokument: {
    typ: "pressemitteilung" | "fachartikel" | "case_study" | "interview_transkript";
    inhalt: string;
    freigabe_status: "freigegeben";  // hart geprüft, sonst Ablehnung
    freigegeben_am: string;
    freigegeben_durch: string;
  };
  kunde_slug: string;
  ziel_formate: Array<{
    format_slug: string;  // agentur-spezifisch konfiguriert
    plattform: "linkedin" | "twitter" | "intranet" | "newsletter" | "vertriebs_info";
    tonalitaet: string;
    laenge_maximal: number;
    executive_name: string | null;  // falls Executive-Post
  }>;
}
```

### Backend-Verarbeitung

Drei Stages:

**Stage 1: Inhalts-Analyse.** Claude Sonnet-Klasse. Aus dem Quelldokument werden extrahiert: Kern-Fakten, Kern-Botschaft, verwendbare Zitate, verwendbare Bilder-Hinweise, Hashtag-Kandidaten.

**Stage 2: Format-spezifische Transformation.** Pro Ziel-Format ein separater LLM-Call mit format-spezifischen Prompt (Länge, Ton, Struktur). Bei Executive-Post: zusätzlicher Voice-Match-Layer, der auf früheren Posts des Executives trainiert ist (falls konfiguriert).

**Stage 3: Faktentreue-Prüfung.** Automatischer Check: alle Substantive im Output müssen im Input vorkommen (keine Faktenerfindung). Wächter-Regel: bei Verletzung Retry mit expliziter Anweisung "verwende nur Fakten aus dem Input".

### Output-Kontrakt

Pro Ziel-Format ein Entwurf plus Faktentreue-Report.

### Failure-Fallbacks

- Wenn Quelldokument nicht freigegeben: Handler lehnt ab mit klarer Meldung "nur freigegebene Dokumente werden transformiert"
- Wenn Faktentreue-Check nach 3 Retries fehlschlägt: Entwurf geht mit Warnung raus

### Human-Checkpoints spezifisch

- Alle Entwürfe sind Vorschläge
- Vor Executive-Post-Freigabe: zusätzlicher Voice-Check durch Beraterin
- Kein automatischer Versand an Plattform

### v1-Umfang

- Nur Transformation, keine Generierung aus dünnem Anlass
- Nur die vier konfigurierten Plattformen in v1 (LinkedIn, Twitter, Intranet, Newsletter)
- Executive-Voice-Modus nur wenn mindestens 5 vorherige Executive-Posts als Training-Basis vorliegen

---

## Übergreifende Bau-Reihenfolge

**Woche 3:** W2 (weil operativ am reichsten belegt, dient als Referenz-Implementation)
**Woche 4:** W1 (nutzt Muster von W2)
**Woche 5:** W3 (technisch einfacher, gut für parallele Delegation)
**Woche 6:** Konsolen-Härtung, keine neuen Handler
**Woche 7:** W4 als Beta (v1.1-Kandidat)
**Woche 8:** W6 als Beta (v1.3-Kandidat), W5 als Beta (v1.2-Kandidat)

Details zur Bau-Reihenfolge und Delegations-Muster: siehe Datei 3.

---

*Ende v0.1. Detail-Specs pro Handler entstehen sukzessive in den Wochen 3 bis 8, jeweils vor dem Bau des Handlers.*
