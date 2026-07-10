# SAAS Spec v0.1 — Intake-Konsole (Kern-Produkt)

**Stand:** 10. Juli 2026
**Autor:** Panel + Claude, für Bastian Scherbeck
**Status:** Rohentwurf, ready für morgigen Markier-Sprint
**Zweck:** Vollständige Produktspezifikation des Kern-Produkts. Grundlage für Delegation an Claude Code ab Woche 2.

---

## 0. Metadaten

- **Arbeitstitel:** Intake-Konsole (kein finaler Name)
- **Gesellschaft:** neu zu gründende SaaS-Gesellschaft, kein Bezug zu bestehenden Beratungshäusern des Gründers
- **Zielmarkt:** kleine bis mittlere Kommunikations- und PR-Agenturen im DACH-Raum, Segmentgröße geschätzt 5 bis 20 Personen, 3 bis 15 aktive Kunden
- **Preispositionierung, vorläufig:** 400 bis 900 Euro pro Monat pro Agentur, gestaffelt nach Anzahl Kunden und Volumen
- **Erster Pilot:** Mensch Kreativagentur München (Details siehe Datei 4)
- **Referenz-Vorbilder in der Konzeption:** myconvento (Umfang und Marktposition), ehemaliges Meta-Press-Inbound-System (Backend-Handler-Muster), bestehende Intake-Konsolen-Prototyp (Kern-UX-Logik)

---

## 1. Positionierung und Nutzenversprechen

### 1.1 Verkaufsgegenstand in einem Satz

Ein SaaS, der die eingehende Kommunikation zwischen Agentur-Kunden und Agentur strukturiert übernimmt, jeden Vorgang klassifiziert, die richtige Rolle in der Agentur informiert, und für alles Sensible einen konsequenten Menschen-Abzweig einbaut.

### 1.2 Für wen

Primäre Käuferin: Agentur-Chefin oder Geschäftsführerin einer Kommunikations- oder PR-Agentur mit 5 bis 20 Personen. Sie hat drei Schmerzpunkte, für die dieses Produkt eine Antwort ist: Sprachnotizen und E-Mails ihrer Kunden gehen im Alltag verloren, ihre Beraterinnen verbringen zu viel Zeit mit Sortieren statt mit Beraten, und sensible Kunden-Anliegen werden nicht immer rechtzeitig erkannt.

Primäre Nutzerin: Beraterin oder Beraterin im Alltag der Agentur. Sie öffnet morgens die Konsole und sieht strukturiert, was reingekommen ist, was ihr zugewiesen ist und was schon vorbereitet ist.

Sekundäre Nutzerin: die Etatdirektorin oder das Team-Lead, die Steuerung und Überblick über den Vorgangs-Fluss braucht.

### 1.3 Was das Produkt ausdrücklich nicht ist

Kein weiterer Distributionskanal für Pressemitteilungen. Kein Newsroom. Kein Presseverteiler-CRM. Keine Content-Generierungs-Maschine. Kein Chatbot. Kein Ersatz für strategische Beratungsarbeit. Kein Autopilot, der Krisen selbst behandelt.

Diese Abgrenzungen sind wichtig, weil das Produkt sonst mit myconvento oder Newsroom-Anbietern verglichen wird, was falsche Erwartungen erzeugt.

### 1.4 Ersetzt heute welche Tätigkeit

Die Konsole ersetzt drei bis fünf Stunden pro Beraterin pro Woche, in denen heute manuell einsortiert, transkribiert, weitergeleitet und quittiert wird. In einer 8-Personen-Agentur summiert sich das auf zwanzig bis vierzig Stunden pro Woche, die für strategische Arbeit frei werden.

Zusätzlich erwarten wir eine signifikante Verkürzung der durchschnittlichen Reaktionszeit gegenüber Kunden (Referenzwert: von 24 bis 36 Stunden auf 2 bis 4 Stunden), was in Kunden-Zufriedenheitsmessungen sichtbar werden sollte.

### 1.5 Differenzierendes Versprechen gegenüber generischen KI-Werkzeugen

Vier Elemente, die das Produkt strukturell von ChatGPT-mit-Plugin oder Zapier-plus-KI unterscheiden:

Erstens die Klassifikations-Präzision: das Produkt klassifiziert nicht nur Textinhalte, sondern erkennt Anliegen-Trennung in einer Nachricht, Vertraulichkeit-Signale, Embargo-Signale, Krisen-Signale und Freigabebedarf. Das ist im Handoff-Dokument der Prototyp-Version detailliert kodiert und produktiv erprobt.

Zweitens der konsequente Mensch-Abzweig: bei allem, was sensitivity `vertraulich` oder Typ `Krise` oder `Freigabe` oder `Issue` ist, läuft nichts automatisch weiter. Der Absender bekommt eine neutrale Empfangsbestätigung, der Vorgang landet direkt beim Menschen. Das ist rechtlich und emotional der Verkaufsmoment.

Drittens die Sprach- und Kanal-Neutralität: E-Mail, WhatsApp-Text, WhatsApp-Sprachnotiz, SharePoint-Ablage werden gleichwertig behandelt. Der Absender bekommt die Antwort in seiner Sprache (Deutsch, Englisch, Französisch, weitere), interne Felder bleiben Deutsch für das Agentur-Team.

Viertens die Berater-Haltung im Prompt: das Produkt fragt nur zurück, was ausschließlich der Absender entscheiden kann. Alles andere schlägt es proaktiv vor (Ziele, KPIs, Konzept-Ansätze). Das entlastet die Beraterin und lässt das Produkt kompetent statt bürokratisch wirken.

### 1.6 Ziel-Latenz

Für einen Standard-Vorgang (Normalfall ohne Rückfragen): unter 90 Sekunden vom Eingang der Nachricht bis zur Präsentation des strukturierten Drafts in der Konsole. Für Vorgänge mit Backend-Handler-Aufruf (siehe Datei 2): unter 3 Minuten. Für sensitive Vorgänge: unter 60 Sekunden bis zur neutralen Empfangsbestätigung an den Absender und Alarmierung des zuständigen Menschen.

---

## 2. Input-Vertrag: Kanäle und Nachrichten

### 2.1 Kanäle in v1

Vier Kanäle in v1 vollständig produktiv:

**E-Mail-Kanal.** Ein pro Kunde der Agentur konfigurierbares Postfach oder eine Alias-Adresse (etwa `bäckerei-anfrage@konsole.<agentur-domain>.de`). Eingehende Mails werden über IMAP polled oder per Webhook eines E-Mail-Providers erhalten. Antworten werden im selben Thread verschickt.

**WhatsApp-Kanal.** Anbindung über WhatsApp Business API (Meta), pro Agentur eine Nummer, pro Kunde der Agentur ein WhatsApp-Business-Profil. Text-Nachrichten und Sprachnotizen werden gleich behandelt, Sprachnotizen werden nach dem Eingang transkribiert und anschließend aus dem Speicher gelöscht (Rohaudio nur temporär, siehe DSGVO-Abschnitt).

**Datei-Ablage-Kanal.** Anbindung an SharePoint oder Google Drive pro Kunde der Agentur. Wenn eine neue Datei in einem definierten Ordner landet, entsteht ein Vorgang. Der Datei-Inhalt (Text, PDF-Text-Extraktion, Bild-Beschreibung) plus optionaler Anhänge-Kontext werden zur Klassifikation verwendet.

**Manuelle Ablage in der Konsole.** Die Beraterin kann eine Nachricht selbst eingeben (etwa nach einem Telefonat) und die Konsole klassifizieren lassen. Wichtig für Vorgänge, die außerhalb der drei automatischen Kanäle passieren.

### 2.2 Kanäle bewusst NICHT in v1

Kein Telefon-Kanal (Anruf-Aufzeichnung). Rechtlich zu komplex, technisch möglich aber nicht v1-relevant.

Kein Slack-Ingest. Slack ist ein interner Kanal des Kunden, nicht Kunde-Agentur.

Kein Social-Media-Ingest (Twitter/X-DM, LinkedIn-Nachrichten). Sinnvoll für v2, in v1 zu breit.

Keine Website-Formulare, die Kunden selbst auf ihre Website einbauen. Sinnvoll für v2, in v1 als Sonderfall über E-Mail abbildbar.

### 2.3 Nachrichten-Input-Schema

Jede Nachricht durchläuft eine Normalisierung in ein einheitliches Schema, bevor die Klassifikation läuft:

```typescript
interface EingehendeNachricht {
  vorgang_id: string;              // uuid, eindeutig, wird beim Eingang generiert
  agentur_id: string;              // Mandant der Konsole
  kunde_id: string;                // welcher Kunde der Agentur
  kanal: "email" | "whatsapp_text" | "whatsapp_audio" | "dateiablage" | "manuell";
  absender: {
    identifikator: string;         // E-Mail-Adresse, Telefonnummer, SharePoint-User
    aufgeloester_name: string | null;  // falls in Kontaktdb bekannt
    aufgeloeste_rolle: string | null;  // falls in Kontaktdb bekannt
  };
  eingang_at: string;              // ISO-8601 timestamp
  betreff: string | null;
  inhalt_text: string;             // vollständig, bei Audio: Transkript
  inhalt_originalsprache: string | null;  // ISO-639-Code, falls automatisch erkannt
  anhaenge: Anhang[];              // Metadaten von Datei-Anhängen
  metadaten_kanalspezifisch: Record<string, unknown>;
  audio_originaldauer_sekunden: number | null;  // nur bei whatsapp_audio
  audio_transkript_qualitaet: "gut" | "maessig" | "schlecht" | "n/a" | null;
}
```

### 2.4 Validierungen und Ablehnungen

Eine eingehende Nachricht wird abgelehnt und im Audit-Log als "abgelehnt" markiert, wenn:

- Die Absender-Identität nicht zu einem in der Kontaktdatenbank hinterlegten Kunden-Ansprechpartner zuzuordnen ist UND der Kunde die Ablehnung unbekannter Absender aktiviert hat (Default: aktiviert). Alternativ: der Vorgang wird als "unbekannter Absender, manuelle Zuordnung nötig" in die Konsole gelegt.
- Die Nachricht länger als 20.000 Zeichen ist ohne Anhang (wahrscheinliche Fehl-Weiterleitung einer Serien-Mail). Aufnahme, aber sofortige Markierung "prüfen".
- Die Sprachnotiz länger als 5 Minuten ist. Aufnahme, aber Warnung "lange Audiodatei, Klassifikation ggf. ungenau".
- Die Nachricht durch Spam-Filter des E-Mail-Providers markiert wurde. Ablehnung mit Log-Eintrag.

### 2.5 Beispiel-Input, vollständig realistisch

```json
{
  "vorgang_id": "01H8Z9K2M3N4P5Q6R7S8T9U0V1",
  "agentur_id": "mensch-kreativ-muc",
  "kunde_id": "baeckerei-hoffmann",
  "kanal": "whatsapp_audio",
  "absender": {
    "identifikator": "+491725553124",
    "aufgeloester_name": "Sabine Kramer",
    "aufgeloeste_rolle": "Marketing-Leitung"
  },
  "eingang_at": "2026-07-09T21:14:32.000Z",
  "betreff": null,
  "inhalt_text": "Julia hallo, also kurz eine, nee zwei Sachen. Erstens für die Website die Sauerteig-Linie, brauchen wir bis Freitag einen Text, weil dann die neue Seite live geht. Und dann noch, ähm, die Süddeutsche hat sich gemeldet, ein Reporter, der macht eine Reportage über regionales Bäckerhandwerk und will vielleicht mit unserem Klaus sprechen. Was meinst du, kannst du da mal drüberschauen?",
  "inhalt_originalsprache": "de",
  "anhaenge": [],
  "metadaten_kanalspezifisch": {
    "whatsapp_message_id": "wamid.HBgL...",
    "phone_number_id": "12345678901"
  },
  "audio_originaldauer_sekunden": 47,
  "audio_transkript_qualitaet": "gut"
}
```

---

## 3. Klassifikations-Layer

Das ist das Herzstück des Produkts. Der Klassifikations-Layer übernimmt die produktiv erprobte Logik aus dem bestehenden Konsolen-Prototyp mit Anpassungen für Mandantenfähigkeit und für die Aufruf-Schnittstelle zu den Backend-Handlern.

### 3.1 Grundprinzipien der Klassifikation

Die Prinzipien sind eins zu eins aus dem Prototyp übernommen, weil sie produktiv gehärtet sind. Ich liste sie hier neu, damit die Spec eigenständig lesbar ist.

Robuste Audio-Interpretation. Füllwörter und ASR-Fehler werden ignoriert. Bedeutung wird nie verändert. Selbstkorrekturen des Sprechers ("kurz eine, nee zwei Sachen") werden erkannt und aufgelöst. Unklares wird markiert und gefragt, nicht geraten.

Nichts erfinden. Fehlende Informationen werden als `null` oder "[fehlt]" ausgewiesen. Keine erfundenen Fakten, Zahlen, Budgets, Namen.

Explizit versus erschlossen strikt trennen. Was der Absender wörtlich sagt, steht in `felder`. Was das Modell erschließt (etwa aus Kontext oder Absender-Rolle), steht in `erschlossen[]`. Annahmen werden in `annahmen[]` ausgewiesen.

Relative Fristen auflösen. "bis Freitag" wird gegen das aktuelle Datum zu einem konkreten Datum aufgelöst und als Annahme ausgewiesen (stille Bestätigung an den Absender in der Antwort), nicht zusätzlich als Rückfrage gestellt. Nur echt mehrdeutige, nur vom Absender klärbare Fristen gehören in Rückfragen.

Ehrliche Konfidenz. Sensitivitätserkennung (Embargo, unveröffentlichte Produktdaten, Krisensignale, Freigabebedarf). Konfidenz wird intern als Zahl geführt (0 bis 100), im UI aber nie als Prozentwert angezeigt, sondern als Kategorie "eindeutig / plausibel / mehrdeutig".

Mehrere Anliegen in einer Nachricht sauber trennen. Der Beispiel-Input in 2.5 enthält zwei Anliegen. Die Klassifikation muss beide separat identifizieren und getrennt weiterverarbeiten.

Deutsche Ausgaben mit echten Umlauten (ä, ö, ü, ß), nie mit ae/oe/ue/ss. Muss explizit im Prompt stehen, sonst übernimmt das Modell die vereinfachte Schreibweise.

Sprache der absender-gerichteten Texte gleich Sprache der Eingangsnachricht. Deutsch zu Deutsch, Französisch zu Französisch, Englisch zu Englisch. Gemischt oder unklar zu Englisch. Interne Felder für das Agentur-Team bleiben Deutsch.

### 3.2 Rückfragen-Regeln

Eine Rückfrage ist nur erlaubt, wenn drei Bedingungen gleichzeitig erfüllt sind:

Erstens die Information kennt ausschließlich der Absender. Zweitens die Information blockiert den Auftrag. Drittens die Information wurde nicht als Annahme getroffen. Niemals dasselbe annehmen UND fragen.

Nie fragen nach internen Arbeitsweisen der Agentur (Ablage, Aufteilung, Tracking). Der Absender sollte nie mit Agentur-Interna belastet werden.

So wenige Fragen wie möglich, eine Nachricht, je ein Satz, keine Selbst-Nummerierung im Klassifikations-Output. Die UI-Ebene fügt die Nummerierung ein.

Wenn Rückfragen gestellt werden: zusätzlich `rueckfrage_nachricht` als komplette versandfertige Nachricht mit Anrede, einem Satz Bezug, nummerierten Fragen und Gruß in Sprache und Ton des Absenders.

Wenn keine Rückfragen: `antwort_nachricht` als kurze versandfertige Eingangsbestätigung. Bei Eskalation: neutral, ohne Inhaltsdetails.

### 3.3 Eskalations-Hardrule

Bei `sensitivity != "normal"` oder Typ in `{"Freigabe", "Issue", "Krise"}` gilt: `rueckfragen = []`, `rueckfrage_nachricht = null`. Es geht keine automatische inhaltliche Rückfrage raus. Ein Mensch übernimmt.

Die UI erzwingt das zusätzlich (`needsFollowup = rueckfragen.length > 0 && !forceHuman`).

Bei diesen Vorgängen geht statt einer inhaltlichen Antwort eine neutrale Empfangsbestätigung raus: "Hallo [Name], deine Nachricht ist angekommen und liegt bei [zuständige Person]. Sie meldet sich schnellstmöglich."

### 3.4 JSON-Antwortformat des Klassifikations-Layers

Aus dem produktiven Prototyp übernommen mit Anpassungen für Multi-Handler-Aufruf und Mandantenfähigkeit:

```json
{
  "vorgang_id": "01H8Z9K2M3N4P5Q6R7S8T9U0V1",
  "sprache_eingang": "de",
  "sprache_ausgang": "de",
  "typ_primaer": "Anfrage",
  "typ_sekundaer": "Presseanfrage",
  "confidence": 78,
  "sensitivity": "normal",
  "verstandener_inhalt": "Sabine Kramer meldet zwei Anliegen: erstens Website-Text für die Sauerteig-Linie bis Freitag, zweitens die Frage, ob Julia eine Presseanfrage der Süddeutschen mit dem CEO Klaus Hoffmann begleiten kann.",
  "transkript_qualitaet": "gut",
  "kunde_slug": "baeckerei-hoffmann",
  "prioritaet": "hoch",
  "anliegen": [
    {
      "anliegen_id": "01H8Z9K2M3N4P5Q6R7S8T9U0V1-01",
      "beschreibung": "Website-Text für die Sauerteig-Linie",
      "prioritaet": "mittel",
      "frist_erschlossen": "2026-07-12",
      "frist_annahme": "\"bis Freitag\" bezogen auf laufende Woche",
      "backend_handler_vorschlag": "W1_pressemitteilung_drafter",
      "backend_handler_input": {
        "briefing_stichworte": ["Sauerteig-Linie", "neue Website-Sektion"],
        "zielgruppe_vermutet": "Website-Besucher, Endkunden",
        "tonalitaet_vermutet": "warm-handwerklich"
      }
    },
    {
      "anliegen_id": "01H8Z9K2M3N4P5Q6R7S8T9U0V1-02",
      "beschreibung": "Presseanfrage Süddeutsche Zeitung, Reportage regionales Bäckerhandwerk, mit CEO Klaus Hoffmann",
      "prioritaet": "hoch",
      "frist_erschlossen": null,
      "frist_annahme": null,
      "backend_handler_vorschlag": "W2_presseanfragen_drafter",
      "backend_handler_input": {
        "medium_name": "Süddeutsche Zeitung",
        "journalist_name": null,
        "thema_beschreibung": "Reportage regionales Bäckerhandwerk",
        "sprecher_vorgeschlagen": "Klaus Hoffmann",
        "sprecher_rolle": "CEO"
      }
    }
  ],
  "felder": {
    "absender_name": "Sabine Kramer",
    "absender_rolle": "Marketing-Leitung",
    "erwaehnte_personen": ["Julia", "Klaus"]
  },
  "erschlossen": [
    "Klaus verweist auf den CEO Klaus Hoffmann (aus Kontaktdatenbank)",
    "Julia ist die zuständige Beraterin (aus Kontaktdatenbank)"
  ],
  "annahmen": [
    "Freitag ist der 12. Juli 2026, in der laufenden Kalenderwoche",
    "Die Zustimmung des CEO Klaus Hoffmann für ein Interview wird von Sabine geklärt, nicht von der Agentur"
  ],
  "missing_mandatory": [],
  "rueckfragen": [],
  "rueckfrage_nachricht": null,
  "antwort_nachricht": "Hallo Sabine, danke für deine Sprachnotiz. Wir haben zwei Anliegen notiert: erstens den Website-Text für die Sauerteig-Linie bis Freitag, 12. Juli, und zweitens die Presseanfrage der Süddeutschen für die Reportage über regionales Bäckerhandwerk. Julia meldet sich am Vormittag persönlich bei dir, um die Presseanfrage kurz einzuordnen. Der erste Website-Text-Entwurf kommt bis morgen Nachmittag zu dir zurück.",
  "routing": {
    "rolle": "senior_beraterin",
    "person_slug": "julia_schmidt",
    "verteiler": ["julia_schmidt"]
  },
  "backend_calls_geplant": [
    {"handler": "W1_pressemitteilung_drafter", "anliegen_id": "01H8Z9K2M3N4P5Q6R7S8T9U0V1-01"},
    {"handler": "W2_presseanfragen_drafter", "anliegen_id": "01H8Z9K2M3N4P5Q6R7S8T9U0V1-02"}
  ],
  "audit_summary": "Vorgang klassifiziert, zwei Anliegen getrennt, an Julia Schmidt geroutet, W1 und W2 aufgerufen, neutrale Bestätigung an Absenderin gesendet.",
  "zusammenfassung": "Zwei Anliegen von Sabine Kramer, Bäckerei Hoffmann: Website-Text bis Freitag plus Süddeutsche-Presseanfrage."
}
```

UI-Mapping der Konfidenz: confidence >= 85 zeigt "eindeutig", >= 65 "plausibel", sonst "mehrdeutig".

### 3.5 Modell-Wahl und Fallbacks

Standard-Modell für Klassifikation: Claude Sonnet-Klasse aktuell (Sonnet 4.6 oder höher). MAX_TOKENS 16000 wegen Denken-vor-Antwort-Semantik neuerer Modelle.

Für Sprachnotiz-Transkription client-seitig: Whisper via transformers.js (Xenova/whisper-tiny) als Default, mit Fallback auf server-seitige OpenAI-Whisper-API bei client-seitigen Fehlern. Rohaudio wird nach der Transkription binnen 5 Minuten aus dem Speicher gelöscht.

Für Backend-Handler (siehe Datei 2): pro Handler individuell wählbar, weil manche Handler tieferes Reasoning brauchen (Opus-Klasse) und andere schnellere Antworten (Haiku-Klasse).

Fallback bei LLM-Ausfall: der Vorgang wird als "Klassifikation nicht möglich, manuelle Bearbeitung nötig" in die Konsole gelegt, mit dem rohen Nachrichten-Text und der Kanal-Herkunft. Kein Datenverlust, aber Latenz-Verzicht in Ausnahmefällen.

---

## 4. Backend-Handler-Interface

Die Konsole ist der Frontage-Layer. Die sechs Fachlichkeits-Fähigkeiten sind Backend-Handler, die die Konsole aufruft, sobald sie einen entsprechenden Anliegen-Typ erkannt hat.

### 4.1 Die sechs Handler in v1

W1: Pressemitteilungs-Drafter aus strukturiertem Briefing
W2: Presseanfragen-Drafter
W3: Media Monitoring Digest (als getriggerter Zusammenfassungs-Handler und als periodischer Handler)
W4: Journalisten- und Medien-Intelligence plus personalisierte Ansprache
W5: Terminbriefing für die Beraterin
W6: Long-Form-zu-Multi-Channel-Transformer

Detail-Specs pro Handler siehe Datei 2 (`WORKFLOW_HANDLERS_v0.1.md`).

### 4.2 Aufruf-Schnittstelle

Der Klassifikations-Layer entscheidet pro Anliegen, welcher Handler aufgerufen werden soll. Der Aufruf ist asynchron, mit einem Job-Queue-Muster, damit die Konsole nicht auf die Handler-Antwort warten muss.

```typescript
interface HandlerAufruf {
  aufruf_id: string;
  vorgang_id: string;
  anliegen_id: string;
  handler_slug: string;              // "W1_pressemitteilung_drafter" etc.
  input: Record<string, unknown>;    // Handler-spezifisch, aus Klassifikations-Output
  konsolen_kontext: {
    kunde_id: string;
    agentur_id: string;
    zustaendige_person_slug: string;
    prioritaet: "hoch" | "mittel" | "niedrig";
    sla_frist_at: string | null;
  };
  status: "queued" | "in_progress" | "done" | "failed" | "escalated";
  ergebnis: HandlerErgebnis | null;
  fehler: string | null;
  gestartet_at: string | null;
  beendet_at: string | null;
}

interface HandlerErgebnis {
  entwurf: Record<string, unknown>;   // Handler-spezifisches Output-Schema
  benoetigt_menschliche_freigabe: boolean;
  freigabe_grund: string | null;
  vorschlaege_fuer_naechste_schritte: string[];
}
```

### 4.3 Failure-Semantik und Escalation

Jeder Handler kann drei Zustände zurückgeben: erfolgreich (Entwurf steht bereit), fehlgeschlagen (Fehlerbeschreibung, Vorgang bleibt in der Konsole als "Handler-Fehler, manuelle Bearbeitung"), oder eskaliert (Handler stellt fest, dass der Vorgang eigentlich sensitiv oder außerhalb seiner Fähigkeit ist und zurück an den Menschen sollte).

Bei einem Handler-Fehler wird der Vorgang nicht verloren, sondern automatisch als Rohvorgang der zuständigen Person übergeben. Die Kunden-Kommunikation ist zu diesem Zeitpunkt bereits gelaufen (die Empfangsbestätigung ist vom Klassifikations-Layer verschickt worden), also entsteht kein Kunden-seitiger Schaden.

### 4.4 Retry-Semantik

Handler-Aufrufe, die mit einem transienten Fehler (Rate-Limit, Timeout) fehlschlagen, werden bis zu 3 mal wiederholt, mit exponential backoff. Danach: automatischer Übergang in den Status "failed", Vorgang wird an den Menschen übergeben.

Anmerkung basierend auf den bridgebound-Erfahrungen: die Retry-Logik muss auf HTTP 500 mit eingebettetem 429-Payload prüfen, nicht nur auf HTTP 429 direkt. Der oberliegende Handler kann den Upstream-Fehler ummantelt haben.

---

## 5. Human-Checkpoints

Vier Checkpoints, an denen ein Mensch in der Agentur strukturiert eingreift oder eingreifen kann.

### 5.1 Checkpoint 1: nach Klassifikation, vor Antwort-Versand

Bei jedem Vorgang wird der Klassifikations-Output der zuständigen Person zur Kenntnis gebracht, mit einer per-Kunden konfigurierbaren Autonomie-Stufe:

**Stufe 1: Shadow-Mode.** Nichts wird automatisch versendet. Alle Antworten warten auf manuelle Freigabe. Empfohlen für neue Kunden in den ersten 4 bis 8 Wochen.

**Stufe 2: Auto-Bestätigung mit Kurz-Kontrolle.** Antwort-Nachrichten (Empfangsbestätigungen ohne Rückfragen) gehen automatisch raus, aber die Beraterin bekommt eine Kurz-Benachrichtigung und kann innerhalb einer konfigurierbaren Toleranz-Zeit (Default 60 Sekunden) zurückrollen. Empfohlen für etablierte Kunden.

**Stufe 3: Voll-Autonomie.** Antworten gehen ohne Kurz-Kontrolle raus. Nur sensitive Vorgänge werden immer an den Menschen geleitet. Empfohlen für den Alltag, wenn Vertrauen etabliert ist.

Wichtig: Stufe 3 ist niemals der Default. Der Default ist Stufe 2. Stufe 3 muss von der Agentur-Chefin pro Kunde bewusst aktiviert werden.

### 5.2 Checkpoint 2: nach Backend-Handler-Antwort, vor Kunde-Freigabe

Wenn ein Backend-Handler ein Ergebnis produziert hat (etwa einen Pressemitteilungs-Entwurf oder ein Terminbriefing), landet dieses Ergebnis nie automatisch beim Kunden. Es liegt immer zur Freigabe bei der zuständigen Person in der Agentur.

Die zuständige Person kann editieren, freigeben, oder verwerfen. Erst nach Freigabe geht das Ergebnis (falls kunde-adressiert) an den Kunden.

### 5.3 Checkpoint 3: bei sensitiven Vorgängen, sofort

Bei sensitivity `vertraulich`, `krise`, oder Typ `Freigabe`, `Issue`, `Krise`: sofortige Alarmierung der zuständigen Person über den konfigurierten Notfall-Kanal (Slack-Nachricht, Teams-Message, SMS an Handy je nach Konfiguration).

Der Vorgang wird in der Konsole rot markiert und bleibt so, bis die zuständige Person ihn manuell als "übernommen" markiert.

An den Absender geht sofort (unter 60 Sekunden Ziel) eine neutrale Empfangsbestätigung, ohne inhaltliche Vermutungen.

### 5.4 Checkpoint 4: bei Konfidenz unter Schwellwert

Bei confidence < 65 (UI-Kategorie "mehrdeutig"): Vorgang wird nicht automatisch beantwortet. Die zuständige Person muss die Klassifikation prüfen und entscheiden, ob die Konsole den Vorgang weiter verarbeitet oder ob die Person ihn selbst übernimmt.

Diese Schwelle ist pro Agentur konfigurierbar (65 bis 85).

---

## 6. Output-Vertrag für die Konsole

Was die Beraterin in der Konsole sieht, ist der wichtigste UX-Anspruch des Produkts. Die Anforderungen sind vom Prototyp übernommen und für den SaaS erweitert.

### 6.1 Übersichts-Ansicht (Startbildschirm)

Beim Öffnen der Konsole sieht die Beraterin drei Kernbereiche:

Links eine Liste der Vorgänge, sortierbar nach Eingang, Priorität, Fälligkeit, Sensitivität. Jeder Vorgang mit Kurz-Info: Kunde, Absender, Typ, Priorität, Status. Sensitive Vorgänge sind rot markiert und stehen oben.

Mitte der aktuell geöffnete Vorgang in Detail-Ansicht (siehe 6.2).

Rechts eine Aktivitäts-Spalte: Session-Log der letzten Aktionen der Beraterin (was sie freigegeben, editiert, weitergeleitet hat) plus Team-Log (was Kolleg:innen in diesem Zeitraum bearbeitet haben, ohne Inhalte).

### 6.2 Detail-Ansicht eines Vorgangs

Ein einzelner Vorgang zeigt vier Bereiche:

**Oben: Original-Eingang.** Der Rohtext oder die Sprachnotiz-Transkription, in einem eingerückten Zitat-Block. Bei Audio auch die Original-Datei zum Nachhören (nur bis zur Freigabe-Aktion, danach gelöscht).

**Mitte oben: Klassifikations-Zusammenfassung.** In ruhiger, sachlicher Sprache. Kunde, erkannter Typ, Priorität, Sensitivität. Bei mehreren Anliegen: Anliegen einzeln aufgezählt. Kein Prozent-Wert, sondern Kategorie ("eindeutig", "plausibel", "mehrdeutig"). Annahmen ausgewiesen (nicht als Rückfrage, sondern als "Kurz zur Bestätigung").

**Mitte unten: Backend-Handler-Ergebnisse.** Falls einer oder mehrere Handler aufgerufen wurden, die Entwürfe der Handler in editierbaren Feldern. Bei mehreren Anliegen: pro Anliegen ein Entwurf.

**Unten: Aktions-Zeile.** Buttons für die möglichen Aktionen, jeweils in der passenden Konfiguration:
- "Antwort absenden und Vorgang schließen" (bei einfachen Bestätigungen)
- "Rückfrage senden" (bei Rückfrage-Nachrichten, mit editierbarem Text)
- "An [Rolle] übergeben" (bei Weiterleitung)
- "Manuell übernehmen" (bei sensitiven Vorgängen)
- "Handler erneut aufrufen" (bei nicht-zufriedenstellendem Draft)

### 6.3 Sensitiver Vorgang: Sonderdarstellung

Bei sensitivity `vertraulich`, `krise`, oder Typ `Krise`, `Issue`, `Freigabe`: der Vorgang zeigt keinen Handler-Draft, keine Antwort-Vorschlags-Karte, keine Rückfragen. Stattdessen ein roter Hinweis-Block: "Läuft nicht automatisch. Ein Mensch übernimmt und klärt offene Punkte persönlich."

Darunter die bereits verschickte neutrale Empfangsbestätigung (zur Kenntnis, nicht editierbar rückwirkend). Und ein Button "Ich habe übernommen", der den Vorgang aus der "roten" Liste in die "in Bearbeitung"-Liste verschiebt.

### 6.4 Export-Formate

Ein Vorgangs-Log kann als PDF exportiert werden (für Kunden-Dokumentation), als JSON (für interne Analyse), als docx (für Case-Aufbereitung).

Ein Wochen-Bericht der Agentur kann pro Kunde erzeugt werden: wie viele Vorgänge, welche Typen, wie schnell reagiert. Format: PDF im Corporate-Design der Agentur.

---

## 7. Qualitätskriterien

### 7.1 Automatisch prüfbar

Jeder Klassifikations-Output wird gegen ein Zod-Schema validiert. Verletzung führt zu Retry mit korrigierendem Prompt-Hinweis.

Ausschlüsse (verbotene Muster im automatischen Output):
- Keine Phrasen wie "in der heutigen schnelllebigen Welt", "es ist wichtig zu betonen", "wir freuen uns"
- Keine Prozent-Werte für Konfidenz in Absender-gerichteten Texten
- Kein "ich" oder "wir" in neutralen Empfangsbestätigungen bei Sensitiv-Vorgängen ("Deine Nachricht ist angekommen und liegt bei Julia" statt "Ich habe deine Nachricht erhalten")
- Keine Selbst-Nummerierung in Rückfragen (die UI-Ebene nummeriert)
- Keine deutschen Umlaute in Ersatzform (ae/oe/ue/ss)

Positive Prüfungen:
- Frist-Auflösung: jede erwähnte relative Frist muss ein aufgelöstes Datum plus Annahme-Text haben
- Anliegen-Trennung: bei mehreren Anliegen muss die Zusammenfassung beide erwähnen, und `anliegen[]` muss mindestens zwei Einträge haben
- Absender-Ansprache: in der Antwort-Nachricht muss der Absender-Name aus der Kontaktdatenbank verwendet werden, falls bekannt

### 7.2 Rubrik für menschliche Beurteilung, 0 bis 5

- Präzision der Klassifikation (richtiger Typ, richtige Sensitivität, richtige Priorität)
- Präzision der Anliegen-Trennung (jede echte Trennung erkannt, keine falsche Trennung erfunden)
- Qualität der Antwort-Nachricht (klingt sie nach einer erfahrenen Beraterin oder nach ChatGPT)
- Qualität der Backend-Handler-Auswahl (richtiger Handler pro Anliegen)
- Umgang mit Sensitiv-Signalen (keine Übersicht, keine falschen Alarme)

### 7.3 Positive Referenz (guter Output, kommentiert)

Der Beispiel-Output in Abschnitt 3.4 ist bewusst als positive Referenz gebaut. Wesentliche Merkmale:

- Beide Anliegen sauber getrennt, mit eigenen `anliegen_id`
- Frist bei Anliegen 1 korrekt aufgelöst und als Annahme ausgewiesen
- Anliegen 2 als hohe Priorität eingestuft (Presseanfrage)
- Backend-Handler-Auswahl passt zu jedem Anliegen (W1 für Website-Text, W2 für Presseanfrage)
- Antwort-Nachricht in Sabines Sprache (Deutsch, Umlaute), warm aber sachlich, ohne Prozent-Werte, ohne "wir freuen uns"
- Annahmen ausgewiesen (Freitag = 12. Juli, Zustimmung von Klaus Hoffmann durch Sabine)
- Kein Rückfrage-Text (weil beide Anliegen genügend Kontext haben)

### 7.4 Negative Referenz (schlechter Output, kommentiert)

Ein simulierter schlechter Output zum selben Input, mit typischen Failure-Modi:

```json
{
  "typ_primaer": "Sonstiges",
  "confidence": 45,
  "sensitivity": "normal",
  "verstandener_inhalt": "Es wurden verschiedene Anliegen erwähnt.",
  "anliegen": [
    {
      "beschreibung": "Text für Website",
      "prioritaet": "mittel",
      "frist_erschlossen": null,
      "backend_handler_vorschlag": null
    }
  ],
  "antwort_nachricht": "Liebe Sabine, ich freue mich sehr über deine Nachricht! In der heutigen schnelllebigen Zeit ist es wichtig, dass wir dich schnell unterstützen. Koennten Sie uns mitteilen, bis wann Sie den Website-Text benoetigen und ob Sie ein Interview mit dem CEO wuenschen? Ich wuerde mich freuen, von Ihnen zu hoeren.",
  "rueckfragen": ["Bis wann brauchen Sie den Website-Text?", "Möchten Sie ein Interview vermitteln?"]
}
```

Was daran falsch ist:
- Anliegen-Trennung nicht erkannt (nur eins statt zwei)
- Sensitivität und Priorität falsch eingeschätzt
- Antwort-Nachricht in "Sie"-Form obwohl Absenderin "du" verwendet hatte
- Umlaute in Ersatzform (koennten, benoetigen, wuenschen, wuerde, hoeren)
- Sprachliche KI-Tonalität ("in der heutigen schnelllebigen Zeit", "ich freue mich sehr", "ich würde mich freuen von Ihnen zu hören")
- Rückfrage nach der Frist obwohl "bis Freitag" im Original stand (Annahme wäre die richtige Reaktion)
- Rückfrage zum Interview obwohl die Absenderin es explizit vorgeschlagen hat ("kannst du da mal drüberschauen")
- Kein Backend-Handler vorgeschlagen

---

## 8. DSGVO und rechtliche Guardrails

Barkhau hat das Panel in dieser Frage geführt. Die folgenden Anforderungen sind nicht optional.

### 8.1 Rollen unter DSGVO

Die SaaS-Gesellschaft ist Auftragsverarbeiterin gegenüber der Agentur (die ist Verantwortliche gegenüber ihren Kunden). Die Agentur ist Verantwortliche gegenüber ihrem Endkunden und dessen Ansprechpartner:innen (die wiederum als Betroffene DSGVO-geschützt sind).

Die SaaS-Gesellschaft hat KEINEN direkten Vertrag mit dem Endkunden der Agentur. Die Agentur muss ihre Endkunden über die Nutzung der Konsole informieren und eine Weiter-AVV (Auftragsverarbeitungsvertrag) mit ihnen abschließen, wenn deren Anforderungen das verlangen (im Mittelstand meist ja).

### 8.2 AVV zwischen SaaS-Gesellschaft und Agentur

Der Standard-AVV-Vertrag zwischen SaaS-Gesellschaft und Agentur muss folgende Punkte behandeln:

- Zweck der Verarbeitung (Kommunikations-Intake)
- Umfang und Art der personenbezogenen Daten (Namen, E-Mail-Adressen, Telefonnummern, Kommunikationsinhalte)
- Kategorien betroffener Personen (Ansprechpartner:innen der Endkunden, Beraterinnen der Agentur)
- Verarbeitungsdauer und Löschfristen (siehe 8.4)
- Technische und organisatorische Maßnahmen (verschlüsselte Speicherung, EU-Hosting, Mandanten-Trennung, Audit-Logs)
- Unterauftragsverhältnisse (Anthropic als LLM-Provider ist Unterauftragnehmer, muss transparent aufgeführt sein)
- Auskunfts-, Berichtigungs-, Löschansprüche der Betroffenen (Prozess)
- Meldepflicht bei Datenschutzverletzungen (max. 24 Stunden)

### 8.3 Hosting und Datenverarbeitung

Alle Betriebs-Systeme (Application-Server, Datenbank, Objekt-Storage) müssen in einem EU-Rechenzentrum betrieben werden. Als Anbieter kommen Hetzner (Falkenstein / Nürnberg), AWS Frankfurt, Google Cloud Frankfurt, Azure Frankfurt in Frage. Empfehlung: Hetzner, weil Bastian dort Erfahrung und Infrastruktur hat.

Die Anthropic-API-Aufrufe sind der einzige Datentransfer in die USA. Anthropic hat für dieses Szenario ein Data-Processing-Addendum, das die Agentur unter der Weiter-AVV explizit erwähnen muss. Es gibt aktuell (Juli 2026) keine EU-basierte Anthropic-Infrastruktur; falls Anthropic eine anbietet, sollte das SaaS-Angebot sofort darauf wechseln.

Ein wesentlicher Datenschutz-Punkt: die WhatsApp-Business-API bedeutet Datentransfer an Meta (USA). Das muss in der AVV mit der Agentur explizit adressiert werden. Falls Kunden der Agentur WhatsApp nicht wollen (etwa aus DSGVO-Bedenken), muss der Kanal pro Kunde konfigurierbar deaktivierbar sein.

### 8.4 Löschfristen und Datensparsamkeit

Rohaudio von Sprachnotizen: gelöscht binnen 5 Minuten nach Transkription, spätestens 60 Minuten nach Eingang. Kein Backup, kein Recovery.

Transkript-Inhalte: gespeichert für die Vorgangs-Dauer plus 24 Monate (Standard-Retention für Kommunikations-Dokumentation). Konfigurierbar pro Agentur, minimum 6 Monate.

Klassifikations-Metadaten (Typ, Priorität, Sensitivität): gespeichert für 5 Jahre (für Statistik und Verbesserung), aber anonymisiert nach 24 Monaten (keine personenbezogenen Daten mehr, nur Muster).

LLM-Prompts und -Antworten: Anthropic garantiert 30 Tage Retention für API-Nutzung, kein Training auf API-Daten. Wichtig für AVV.

Audit-Log: gespeichert für die gesamte Vertragsdauer plus 3 Jahre nach Vertragsende (rechtliche Nachweisbarkeit für Betroffene).

### 8.5 Rechte der Betroffenen

Jeder Ansprechpartner eines Agentur-Kunden ist Betroffener. Er hat Auskunfts-, Berichtigungs-, Löschungs- und Datenübertragbarkeits-Rechte.

Die SaaS-Gesellschaft stellt der Agentur ein Tool bereit, mit dem sie diese Rechte gegenüber ihren Endkunden erfüllen kann:
- Auskunft: Export aller Daten zu einer Person (E-Mail-Adresse oder Telefonnummer) als PDF und JSON
- Berichtigung: Editier-Interface für Kontaktdaten
- Löschung: "Recht auf Vergessenwerden"-Prozess, der alle Vorgänge einer Person schrittweise anonymisiert (Nachrichten-Inhalte bleiben für die Agentur-Dokumentation, aber Absender-Identität wird ersetzt durch "gelöscht")
- Übertragbarkeit: strukturierter JSON-Export nach ISO-Standard

### 8.6 Sensitivere Kategorien (Art. 9 DSGVO)

Wenn Vorgänge Daten enthalten, die unter Art. 9 DSGVO fallen (Gesundheit, Religion, politische Meinung), gilt eine erweiterte Sorgfaltspflicht. Die Klassifikations-Layer soll solche Inhalte erkennen und `sensitivity = "besonders_geschuetzt"` setzen. Solche Vorgänge:
- gehen nie über den Autonomie-Level 1 hinaus, egal welche Voreinstellung
- werden verschlüsselt at rest gespeichert (Standard) und zusätzlich mit einem separaten Access-Log versehen
- werden nach dem Verlassen des aktiven Bearbeitungs-Status binnen 12 Monaten automatisch gelöscht, es sei denn die Agentur widerspricht schriftlich mit rechtlicher Begründung

### 8.7 Meldepflichten

Bei einer Datenschutzverletzung (Data Breach) muss die SaaS-Gesellschaft die betroffenen Agenturen binnen 24 Stunden informieren. Die Agenturen müssen ihre Endkunden binnen 72 Stunden informieren. Standard-Prozess dazu ist Teil des SaaS-Angebots.

### 8.8 Datenschutz-Beauftragte:r

Sobald die SaaS-Gesellschaft mehr als 20 Personen beschäftigt oder das Kerngeschäft eine systematische Verarbeitung personenbezogener Daten in großem Umfang umfasst (was hier der Fall ist), ist ein interner oder externer Datenschutz-Beauftragter Pflicht. In der Gründungsphase: externe Beauftragte, empfohlen eine spezialisierte Kanzlei mit Kommunikationsbranchen-Fokus.

---

## 9. Mandanten- und Rollenmodell

### 9.1 Drei Ebenen der Mandantenfähigkeit

**Ebene 1: SaaS-Kunden (die Agenturen).** Jede Agentur ist ein Mandant. Vollständige Datentrennung zwischen Agenturen. Keine Datenweitergabe zwischen Agenturen ohne explizite schriftliche Genehmigung der Agentur-Chefin.

**Ebene 2: Endkunden der Agentur.** Innerhalb einer Agentur werden die Daten pro Endkunde getrennt. Beraterinnen können nur die Kunden sehen, denen sie zugewiesen sind. Kunden-Wechsel möglich, aber mit expliziter Zuweisung.

**Ebene 3: Nutzer der Agentur.** Jede Beraterin, jede Etatdirektorin, die Chefin selbst. Rollen mit unterschiedlichen Rechten.

### 9.2 Rollenmodell

**Chef-Rolle (Owner).** Volle Rechte innerhalb der Agentur. Kann Kunden anlegen, Beraterinnen einladen, Berechtigungen setzen, Rechnungen und Vertragsverwaltung. Kann die Agentur-Konfiguration ändern (Autonomie-Level pro Kunde, Kanal-Konfiguration, Corporate-Design für Exports).

**Etatdirektor:innen-Rolle (Manager).** Kann Vorgänge aller ihm zugewiesenen Kunden sehen. Kann Aufgaben an Beraterinnen weiterleiten. Kann Kunden konfigurieren, die ihm zugewiesen sind. Kann keine anderen Beraterinnen einladen oder entfernen.

**Berater:innen-Rolle (Editor).** Kann nur Vorgänge der ihr zugewiesenen Kunden sehen und bearbeiten. Kann Antworten freigeben. Kann keine Kunden-Konfigurationen ändern.

**Assistenz-Rolle (Reader).** Kann Vorgänge sehen, aber nicht freigeben. Für Junior-Personal oder Praktikant:innen.

**Externe Rolle (Guest).** Für Freelancer:innen der Agentur. Kann nur explizit freigegebene einzelne Vorgänge sehen, nicht die ganze Konsole. Zeitlich begrenzt (Ablaufdatum pro Zugang).

### 9.3 Berechtigungs-Details

Sensitive Vorgänge (sensitivity != "normal") sind nur für Chef, Manager und die zuständige Beraterin sichtbar. Sie erscheinen in der Übersicht anderer Beraterinnen nicht.

Die neutrale Empfangsbestätigung an den Absender wird immer verschickt, aber die inhaltliche Klassifikation wird nicht sichtbar für unautorisierte Rollen.

Audit-Log ist für Chef und Manager voll einsehbar, für Beraterinnen nur die eigenen Aktionen.

---

## 10. Audit-Backend

### 10.1 Was wird geloggt

Jede Aktion, die einen Vorgang berührt, wird geloggt:
- Vorgang-Empfang (Kanal, Zeitpunkt, Absender-Identifikator)
- Klassifikations-Ergebnis (vollständiges JSON)
- Backend-Handler-Aufrufe (Handler, Input, Ergebnis, Dauer)
- Menschliche Aktionen (Freigabe, Edit, Weiterleitung, Übernahme)
- Antwort-Versand an Absender (Kanal, Zeitpunkt, Empfänger, Antwort-Text)
- Statusänderungen (queued, in_progress, done, failed, escalated)
- Zugriffe auf Vorgänge (wer hat wann was gesehen)

### 10.2 Struktur

Append-only Log-Tabelle pro Agentur, mit Referenzen auf Vorgang, Nutzer, Zeitpunkt, Aktions-Typ, Aktions-Payload (JSON).

Log-Einträge werden niemals editiert oder gelöscht, außer im Rahmen der DSGVO-Löschung (dann anonymisiert).

Log-Zugriff ist selbst geloggt (Meta-Logging).

### 10.3 Suchbarkeit

Volltextsuche über Log-Einträge im Chef- und Manager-UI. Filter nach Zeitraum, Kunde, Vorgangs-Typ, Aktions-Typ.

Regelmäßiger Wochen-Report für die Agentur-Chefin: Volumen pro Kunde, durchschnittliche Reaktionszeit, Anteil sensitiver Vorgänge, Handler-Erfolgsraten, häufige Ablehnungsgründe.

---

## 11. Onboarding-Anforderungen

### 11.1 Onboarding pro Agentur (einmalig)

Was die SaaS-Gesellschaft der Agentur einrichtet:
- Mandanten-Konto in der Konsole
- Domain-Konfiguration (Subdomain unter konsole.<saas-domain> oder eigene Subdomain der Agentur)
- Chef-Rolle für die Auftraggeberin, Login-Daten
- AVV unterschrieben und archiviert
- Ersten Nutzer-Onboarding-Termin (60 Minuten, per Video)

Was die Agentur einbringt:
- Corporate-Design-Assets (Logo, Farben, Font) für Exports und optional für UI-Theming
- Team-Liste mit Rollen (wer soll welche Berechtigung haben)
- Erste Kunden-Liste zum Anlegen (kann später erweitert werden)
- Datenschutz-Grundeinstellungen: Retention-Zeitraum für Nachrichten (Default: 24 Monate), Autonomie-Default für neue Kunden (Default: Stufe 2)

### 11.2 Onboarding pro Kunde der Agentur

Was die Beraterin pro Kunde anlegt:
- Kunden-Grunddaten (Name, Ansprechpartner, zuständige Beraterin)
- Kommunikations-Kanäle: welche E-Mail-Alias, welche WhatsApp-Nummer, welche SharePoint-Ordner sind aktiv
- Autonomie-Level: Stufe 1, 2 oder 3 (siehe 5.1)
- Kontaktdatenbank: Namen, Rollen, E-Mail, Telefonnummern der Ansprechpartner:innen des Kunden (mindestens 1 Person, empfohlen 3 bis 8)
- Kontext-Dokumente: freigegebene Presseinformationen der letzten 12 Monate, aktuelle Positionierung, Sprachregelungen (optional aber empfohlen für Handler-Qualität)
- Backend-Handler-Konfiguration: welche Handler sind für welchen Kunden aktiviert (nicht jeder Kunde braucht alle sechs)

### 11.3 Onboarding pro Einzelfall (kein Onboarding-Aufwand)

Jeder eingehende Vorgang läuft ohne zusätzliche Aktion. Die Beraterin sieht ihn in der Konsole und kann direkt handeln.

---

## 12. Operative Semantik

Dieser Abschnitt behandelt den Betriebs-Aspekt, der aus dem Meta-Press-Inbound-System als "Produktions-Härtung" beschrieben wurde. Wächter im Panel hat betont, dass ohne diese Semantik ein Prototyp entsteht, kein Produkt.

### 12.1 Vorgangs-Queue

Alle eingehenden Vorgänge landen in einer Queue pro Agentur. Die Klassifikations-Layer picken atomar (analog zum `pick_next_inquiry` mit `FOR UPDATE SKIP LOCKED` im Meta-System), damit bei parallelen Klassifikations-Workern kein Vorgang doppelt bearbeitet wird.

Picking-Priorität: erstens sensitivity, zweitens `sla_frist_at ASC NULLS LAST`, drittens `eingang_at ASC`.

### 12.2 SLA-Zeiten

Pro Vorgangs-Kategorie ist eine SLA-Ziel-Zeit hinterlegt:
- Sensitive Vorgänge: 60 Sekunden bis Empfangsbestätigung, 5 Minuten bis Alarm an Menschen
- Standard-Presseanfrage: 4 Stunden bis Handler-Ergebnis
- Standard-Content-Anfrage: 8 Stunden
- FYI ohne Handler: 2 Minuten bis Klassifikation und Bestätigung

Bei Verletzung der SLA-Ziel-Zeit: Warnung im Manager-UI. Bei Wiederholung: automatische Info an Agentur-Chefin.

### 12.3 Timeout und Zombie-Handling

Handler-Aufrufe, die länger als 10 Minuten in "in_progress" hängen, gelten als Zombies. Der Job wird zurück in den queued-Status geschaltet und wieder aufgenommen. Nach 3 Zombie-Zyklen: automatische Eskalation an Mensch.

Klassifikations-Aufrufe: 5-Minuten-Timeout, gleiche Semantik.

### 12.4 Rate-Limit-Handling

Wenn Anthropic-Rate-Limits erreicht werden: exponential backoff, Handler-Retries mit Retry-After-Beachtung. Bei anhaltender Rate-Limit-Situation: Umschaltung auf einen Fallback-Modell-Provider (idealerweise ein EU-basierter, sobald verfügbar).

Klassifikations-Layer-Ausfall: Vorgänge landen in einer manuellen Warteschlange, Menschen bekommen Notification.

### 12.5 Multi-Region Backup

Alle Daten werden täglich gesnapshottet, verschlüsselt in ein zweites EU-Rechenzentrum (idealerweise anderer Anbieter, um Provider-Ausfall zu überstehen) übertragen. Restore-Point-Objective: 24 Stunden. Restore-Time-Objective: 4 Stunden für kritische Systeme.

---

## 13. Offene Fragen, die Bastian entscheiden muss

Diese Fragen entscheiden nicht über das Ob, aber über das Wie. Sie sind bewusst nicht in der Spec vorentschieden.

**Frage 1: Preisstruktur genau.** 400 bis 900 Euro pro Monat ist die Panel-Empfehlung. Konkret: nach Anzahl Kunden gestaffelt, nach Anzahl Vorgänge, oder Flatrate mit Fair-Use? Ich schlage vor: gestaffelt nach Anzahl aktiver Kunden (bis 3 Kunden: 400 Euro, bis 8 Kunden: 650 Euro, bis 15 Kunden: 900 Euro, darüber: Enterprise-Preis nach Absprache). Fair-Use für Vorgangs-Volumen (etwa 500 Vorgänge pro Kunde pro Monat).

**Frage 2: v1-Umfang der Backend-Handler.** Alle sechs Handler zum v1-Launch oder nur zwei bis drei mit den anderen als "kommt in v1.1 bis v1.3"? Panel-Empfehlung: v1-Launch mit W1, W2, W3 vollständig; W4, W5, W6 als Feature-Flag "in Beta, aktivierbar auf Anfrage".

**Frage 3: Vorgangs-Persistenz-Grundsatz.** Werden Vorgangs-Inhalte per Default verschlüsselt at-rest, mit Schlüssel im HSM (Hardware Security Module) und Zugriff via Access-Log, oder normale AES-256-Verschlüsselung im DB-Layer? Barkhau-Empfehlung: normale AES-256 in v1 (marktüblich, ausreichend für Kommunikationsbranchen-Anforderungen), HSM in v2 bei Enterprise-Kunden.

**Frage 4: Marke und Positionierung.** Der Prototyp-Name "Intake-Konsole" ist deskriptiv, keine Marke. Welche Markennamen-Kandidaten willst du prüfen? Sollen wir eine Namensfindungs-Runde mit dem Panel machen (separate Session, nicht heute)?

**Frage 5: Pilot-Vertrag mit Mensch.** Kostenlos für die Pilot-Phase, oder gegen einen symbolischen Preis (etwa 100 Euro pro Monat für 4 Monate), oder mit Beteiligung an Feature-Wünschen (Mensch als "Design-Partner")? Panel-Empfehlung: Design-Partner-Rolle, symbolische 100 Euro pro Monat, dafür kommt Mensch für 12 Monate auf einen reduzierten Post-Launch-Preis (500 Euro pro Monat statt regulär).

**Frage 6: Zeit-Budget-Realität.** Die Spec und der Bauplan gehen von 12 bis 15 Reviewer-Stunden pro Woche aus. Ist das realistisch neben Akquiro, segmenta, Civion, Marktwerk und Privatem? Wenn nicht, bitte konkrete Zahl nennen, ich passe den Bauplan an.

---

## Anhang A: Vergleich der Positionierung zu bestehenden Marktangeboten

Kurzer Vergleich mit den drei Alternativen, denen eine potenzielle Käuferin begegnet.

**Myconvento und pressbase.** Vollständige PR-Suite mit Datenbank, Distribution, Monitoring, Reporting. Enterprise-orientiert, für kleine Agenturen zu teuer und zu überladen. Unser Produkt tut nicht, was myconvento tut (keine Distribution, keine Journalisten-Datenbank), sondern etwas anderes (Intake-Layer plus Handler-Rückwand). Kein direkter Wettbewerb, potenziell komplementär.

**ChatGPT plus Custom-GPTs.** Generische KI ohne Kanal-Anbindung, ohne Multi-Tenant-Datenmodell, ohne Audit-Log, ohne DSGVO-Compliance-Ausrichtung. Wettbewerbs-Argument: "wir sind das, was ChatGPT nicht sein kann, weil es kein spezialisiertes Produkt für Kommunikationsagenturen ist."

**Zapier oder Make plus KI-Zapier.** Automatisierungs-Layer, den technisch versierte Agentur-Chefinnen selbst bauen könnten. Wettbewerbs-Argument: "wir liefern das fertige Produkt für die 95 Prozent, die keinen Automatisierungs-Zoo bauen wollen."

Keine dieser Alternativen adressiert die Kern-Positionierung "Intake plus Handler mit Mensch-Abzweig bei Sensiblem" spezifisch für die Kommunikations- und PR-Branche.

---

## Anhang B: Was diese Spec bewusst offen lässt

Ehrlicher Vermerk zu Punkten, die die Spec bewusst nicht entscheidet, weil sie zu Woche-2-oder-später-Fragen gehören:

- Konkrete Datenbank-Schemata (Tabellen, Indizes)
- Konkrete API-Endpoint-Signaturen
- UI-Detail-Design (Farben, Fonts, Interaktions-Muster) außer den Prinzipien
- Konkrete Cost-Modelle pro Vorgang (LLM-Token-Kosten, Storage-Kosten)
- Marketing- und Vertriebs-Strategie

Diese kommen in Woche 2 (Datenmodell), Woche 3 (API), Woche 4 (UI-Detail), Woche 5 (Kosten-Modell) und in einer separaten Vertriebs-Spec später.

---

*Ende v0.1. Ready für morgigen Markier-Sprint.*
