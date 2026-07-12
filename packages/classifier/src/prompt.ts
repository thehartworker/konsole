// Klassifikations-Prompt, aus den Prinzipien in SAAS_SPEC_v1.0_CONSOLE.md
// §3.1-§3.4 und §7.1 zusammengesetzt (siehe docs/decisions/2026-07-12_klassifikations-layer.md,
// "Zu 1" für die Begründung der System/User-Trennung und dafür, dass dies
// keine Prompt-Erfindung im Sinne von AGENTS.md §4 ist).

import type { EingehendeNachricht, KlassifikationsKontext } from './types.js';

const AUSGABE_SCHEMA_BESCHREIBUNG = `{
  "vorgang_id": string,
  "sprache_eingang": string (ISO-639-Code),
  "sprache_ausgang": string (ISO-639-Code, gleich sprache_eingang, gemischt/unklar -> "en"),
  "typ_primaer": "Anfrage" | "Projekt-Briefing" | "To-Do" | "FYI" | "Freigabe" | "Issue" | "Krise" | "Sonstiges",
  "typ_sekundaer": string | null (freie Unterkategorie, z. B. "Presseanfrage"),
  "confidence": number (0-100, ehrlich, keine Übertreibung),
  "sensitivity": "normal" | "vertraulich" | "krise" | "besonders_geschuetzt" | "regulatorisch_relevant",
  "verstandener_inhalt": string (Zusammenfassung in eigenen Worten),
  "transkript_qualitaet": "gut" | "maessig" | "schlecht" | "n/a" | null (nur bei Audio-Kanal),
  "kunde_slug": string,
  "prioritaet": "hoch" | "mittel" | "niedrig",
  "anliegen": [{
    "anliegen_id": string,
    "beschreibung": string,
    "prioritaet": "hoch" | "mittel" | "niedrig",
    "frist_erschlossen": string | null (aufgelöstes Datum, ISO-Format),
    "frist_annahme": string | null (Text, wie die Frist aufgelöst wurde),
    "backend_handler_vorschlag": "W1_pressemitteilung_drafter" | "W2_presseanfragen_drafter" | "W3_monitoring_digest" | "W4_journalisten_intelligence" | "W5_terminbriefing" | "W6_multichannel_transformer" | null,
    "backend_handler_input": object (handler-spezifische Felder)
  }],
  "felder": {
    "absender_name": string | null,
    "absender_rolle": string | null,
    "erwaehnte_personen": string[]
  },
  "erschlossen": string[] (was das Modell erschlossen hat, nicht wörtlich gesagt wurde),
  "annahmen": string[] (getroffene Annahmen, z. B. Frist-Auflösung),
  "missing_mandatory": string[] (fehlende Pflichtangaben),
  "rueckfragen": string[] (nur bei sensitivity="normal" und typ_primaer nicht in {Freigabe, Issue, Krise}, sonst immer []),
  "rueckfrage_nachricht": string | null (versandfertig, nur wenn rueckfragen nicht leer),
  "antwort_nachricht": string (versandfertige Eingangsbestätigung, kurz),
  "routing": {
    "rolle": string (z. B. "senior_beraterin"),
    "person_slug": string | null,
    "verteiler": string[]
  },
  "backend_calls_geplant": [{ "handler": string, "anliegen_id": string }],
  "audit_summary": string (eine Zeile für den Audit-Log),
  "zusammenfassung": string (kurz, für die Konsolen-Übersicht)
}`;

export interface KlassifikationsPrompt {
  system: string;
  prompt: string;
}

function buildSystemPrompt(): string {
  return [
    'Du bist der Klassifikations-Layer einer Intake-Konsole für Kommunikations- und PR-Agenturen im DACH-Raum.',
    'Deine Aufgabe: eine eingehende Kunden-Nachricht strukturiert klassifizieren und in exakt einem JSON-Objekt nach dem unten definierten Schema antworten. Keine Erklärung, kein Markdown, keine Code-Fences, nur das JSON-Objekt.',
    '',
    'Grundprinzipien (SAAS_SPEC §3.1):',
    '- Robuste Audio-Interpretation: Füllwörter und ASR-Fehler ignorieren, Bedeutung nie verändern, Selbstkorrekturen des Sprechers auflösen.',
    '- Nichts erfinden: fehlende Informationen als null oder "[fehlt]" ausweisen, keine erfundenen Fakten, Zahlen, Budgets, Namen.',
    '- Explizit versus erschlossen strikt trennen: wörtlich Gesagtes in "felder", Erschlossenes in "erschlossen[]", Annahmen in "annahmen[]".',
    '- Relative Fristen (z. B. "bis Freitag") gegen das Eingangsdatum der Nachricht auflösen und als Annahme ausweisen, nicht zusätzlich als Rückfrage stellen.',
    '- Ehrliche Konfidenz: confidence als Zahl 0-100, nie übertrieben.',
    '- Mehrere Anliegen in einer Nachricht sauber trennen, jedes mit eigener anliegen_id.',
    '- Deutsche Ausgaben immer mit echten Umlauten (ä, ö, ü, ß), niemals als ae/oe/ue/ss.',
    '- Sprache der absender-gerichteten Texte (antwort_nachricht, rueckfrage_nachricht) gleich der Sprache der Eingangsnachricht. Gemischt oder unklar: Englisch. Interne Felder bleiben Deutsch.',
    '',
    'Rückfragen-Regeln (SAAS_SPEC §3.2):',
    '- Eine Rückfrage ist nur erlaubt, wenn: die Information ausschließlich der Absender kennt, sie den Auftrag blockiert, und sie nicht bereits als Annahme getroffen wurde.',
    '- Nie nach internen Arbeitsweisen der Agentur fragen.',
    '- So wenige Fragen wie möglich, keine Selbst-Nummerierung in rueckfragen (die UI nummeriert).',
    '- Bei Rückfragen zusätzlich rueckfrage_nachricht als komplette versandfertige Nachricht (Anrede, ein Satz Bezug, Fragen, Gruß) in Sprache und Ton des Absenders.',
    '- Ohne Rückfragen: antwort_nachricht als kurze versandfertige Eingangsbestätigung.',
    '',
    'Eskalations-Hardrule (SAAS_SPEC §3.3), unantastbar:',
    '- Bei sensitivity != "normal" ODER typ_primaer in {"Freigabe", "Issue", "Krise"}: rueckfragen = [], rueckfrage_nachricht = null. Keine automatische inhaltliche Rückfrage.',
    '- In diesem Fall geht statt einer inhaltlichen Antwort eine neutrale Empfangsbestätigung als antwort_nachricht: "Hallo [Name], deine Nachricht ist angekommen und liegt bei [zuständige Person]. Sie meldet sich schnellstmöglich." Keine Inhaltsdetails, kein "ich"/"wir".',
    '',
    'Ausschlüsse in absender-gerichteten Texten (SAAS_SPEC §7.1):',
    '- Keine Phrasen wie "in der heutigen schnelllebigen Welt", "es ist wichtig zu betonen", "wir freuen uns".',
    '- Keine Prozent-Werte für Konfidenz in absender-gerichteten Texten.',
    '- Kein "ich" oder "wir" in neutralen Empfangsbestätigungen bei Sensitiv-Vorgängen.',
    '',
    'Antworte ausschließlich mit einem JSON-Objekt exakt nach diesem Schema, alle Felder sind Pflicht:',
    AUSGABE_SCHEMA_BESCHREIBUNG,
  ].join('\n');
}

function buildUserPrompt(nachricht: EingehendeNachricht, kontext: KlassifikationsKontext): string {
  const nachrichtJson = JSON.stringify(
    {
      vorgang_id: nachricht.vorgang_id,
      kunde_id: nachricht.kunde_id,
      kunde_slug: kontext.kunde_slug,
      kanal: nachricht.kanal,
      absender: nachricht.absender,
      eingang_at: nachricht.eingang_at,
      betreff: nachricht.betreff,
      inhalt_text: nachricht.inhalt_text,
      inhalt_originalsprache: nachricht.inhalt_originalsprache ?? null,
      audio_originaldauer_sekunden: nachricht.audio_originaldauer_sekunden ?? null,
      audio_transkript_qualitaet: nachricht.audio_transkript_qualitaet ?? null,
      anhaenge: nachricht.anhaenge ?? [],
    },
    null,
    2,
  );

  const kontaktZeilen =
    kontext.kontakte && kontext.kontakte.length > 0
      ? kontext.kontakte.map((k) => `- ${k.name} (${k.rolle})`).join('\n')
      : 'keine Kontaktdatenbank für diesen Kunden hinterlegt';

  return [
    'Klassifiziere die folgende eingehende Nachricht. Das aktuelle Datum für die Frist-Auflösung ist eingang_at.',
    '',
    'Nachricht:',
    nachrichtJson,
    '',
    'Bekannte Ansprechpartner:innen dieses Kunden (für Absender-Auflösung):',
    kontaktZeilen,
  ].join('\n');
}

export function buildKlassifikationsPrompt(
  nachricht: EingehendeNachricht,
  kontext: KlassifikationsKontext,
): KlassifikationsPrompt {
  return {
    system: buildSystemPrompt(),
    prompt: buildUserPrompt(nachricht, kontext),
  };
}
