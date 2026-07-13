// Stage-2-Prompt (Pressemitteilungs-Draft), aus den Prinzipien in
// WORKFLOW_HANDLERS_v1.0.md "W1: Pressemitteilungs-Drafter" zusammengesetzt.
// Keine wörtliche Prompt-Übernahme aus dem Meta-System (liegt nicht im
// Repository vor), sondern eine Neu-Formulierung der dokumentierten
// Prinzipien -- dokumentiert und begründet in
// docs/decisions/2026-07-13_w1-pressemitteilung-drafter.md (AGENTS.md §4:
// "keine Prompt-Erfindung").

import type { W1GesammelterKontext, W1Input } from './types.js';

const AUSGABE_SCHEMA_BESCHREIBUNG = `{
  "headline": string (Deutsch, aussagekräftig, KEIN Marketing-Sprech),
  "sub_headline": string | null (Deutsch, ergänzt die Headline, optional),
  "ort_datum": string (Format "Ort, TT. Monat JJJJ"),
  "lead_absatz": string (Deutsch, deckt die 5 W-Fragen ab: wer, was, wann, wo, warum),
  "ausfuehrung_absaetze": string[] (Deutsch, zwei bis vier eigenständige Absätze, KEIN Fließtext-Block),
  "zitat": { "text": string, "sprecher_name": string, "sprecher_rolle": string } | null (NUR befüllen, wenn unten ein Sprecher als verfügbar markiert ist UND briefing.zitat_kernaussage gesetzt ist, sonst strikt null),
  "boilerplate": string (Deutsch, aus dem Profil übernehmen, wenn unten verfügbar; sonst ein kurzer, erkennbar generischer Platzhaltertext),
  "kontakt_fusszeile": string (Deutsch, z. B. "Kontakt: Kommunikationsabteilung, Details siehe Kundenprofil."),
  "laenge_worte": number (Wortzahl von lead_absatz plus ausfuehrung_absaetze zusammen)
}`;

function buildSystemPrompt(): string {
  return [
    'Du bist der Pressemitteilungs-Drafter (W1) einer Intake-Konsole für Kommunikations- und PR-Agenturen im DACH-Raum, Rolle "senior PR consultant DACH".',
    'Aufgabe: aus einem strukturierten Briefing eine vollständige Pressemitteilung nach klassischem PR-Handwerk erzeugen. Antworte ausschließlich mit einem JSON-Objekt, keine Erklärung, kein Markdown, keine Code-Fences.',
    '',
    'Die Pressemitteilung geht NIE direkt an Journalisten oder Redaktionen. Sie ist ein Entwurf für die Beraterin: redaktionelle Freigabe, Kunden-Freigabe und Sperrfrist-Prüfung folgen danach, alle Felder deutschsprachig.',
    '',
    'Verbindliche Sprach-Regel (AGENTS.md §3.4): ALLE Felder sind auf Deutsch. Echte Umlaute (ä, ö, ü, ß), niemals als ae/oe/ue/ss.',
    '',
    'Feld-Regeln:',
    '- headline: aussagekräftig und konkret, keine nichtssagende Marketing-Floskel ("Innovative neue Lösung" o. ä.).',
    '- lead_absatz: beantwortet wer, was, wann, wo, warum in einem Absatz.',
    '- ausfuehrung_absaetze: jeder Absatz ein eigenständiges Array-Element, keine Zusammenfassung in einem einzigen String -- das erlaubt später Inline-Editing einzelner Segmente.',
    '- zitat: NUR befüllen, wenn unten ein Sprecher als verfügbar markiert ist UND eine Zitat-Kernaussage im Briefing vorliegt. Verwende die exakte Schreibweise des Sprechernamens, falls angegeben. Sonst strikt null -- kein erfundenes Zitat, keine erfundene Person.',
    '- boilerplate: wenn unten eine Kunden-Boilerplate verfügbar ist, wörtlich übernehmen, nicht umformulieren. Sonst ein kurzer, erkennbar generischer Platzhaltertext.',
    '- Keine unbelegten Behauptungen: jede Tatsachenbehauptung muss aus briefing.fakten oder den Präzedenzfällen ableitbar sein.',
    '- Länge: richte dich nach briefing.laenge_ziel ("kurz" ~300 Wörter, "standard" ~500 Wörter, "lang" ~800 Wörter), gemessen über lead_absatz plus ausfuehrung_absaetze.',
    '- Tonalität aus dem Kundenprofil (unten) anwenden, wenn verfügbar: Grundton, Anrede-Konvention, Gendering-Konvention, Stil-Parameter. Sonst neutral-sachlicher Standardton.',
    '- Falls Präzedenzfälle unten vorhanden sind: nutze sie als Kalibrierungs-Beispiele für Ton, Struktur und Länge, aber kopiere sie nicht wörtlich.',
    '',
    'Antworte ausschließlich mit einem JSON-Objekt exakt nach diesem Schema, alle neun Felder sind Pflicht (zitat und sub_headline dürfen null sein):',
    AUSGABE_SCHEMA_BESCHREIBUNG,
  ].join('\n');
}

function formatQuelle(name: string, verfuegbar: boolean, daten: unknown): string {
  if (!verfuegbar) return `${name}: nicht verfügbar (v1-Stub oder kein Datenbestand hinterlegt)`;
  return `${name}: ${JSON.stringify(daten)}`;
}

function buildUserPrompt(input: W1Input, kontext: W1GesammelterKontext): string {
  const briefingJson = JSON.stringify(input.briefing, null, 2);

  const kontextZeilen = [
    formatQuelle('Tonalität', kontext.tonalitaet.verfuegbar, kontext.tonalitaet.daten),
    formatQuelle('Boilerplate', kontext.boilerplate.verfuegbar, kontext.boilerplate.daten),
    formatQuelle('Präzedenzfälle (Kalibrierung)', kontext.praezedenzen.verfuegbar, kontext.praezedenzen.daten),
    formatQuelle('Sprecher (Zitat-Attribution)', kontext.sprecher.verfuegbar, kontext.sprecher.daten),
    formatQuelle('Sektor-Corpus', kontext.sektor_corpus.verfuegbar, kontext.sektor_corpus.daten),
    formatQuelle('Diskurs-Snapshot', kontext.diskurs_snapshot.verfuegbar, kontext.diskurs_snapshot.daten),
  ].join('\n');

  const teile = [
    'Erzeuge die Pressemitteilung für das folgende Briefing. Kunde: ' + input.kunde_kontext.kunde_slug,
    '',
    'Briefing:',
    briefingJson,
    '',
    'Gesammelter Kontext (Stage 1):',
    kontextZeilen,
  ];

  if (kontext.hinweise.length > 0) {
    teile.push(
      '',
      'Fallback-Hinweise aus der Kontext-Sammlung (im Draft berücksichtigen):',
      kontext.hinweise.map((h) => `- ${h}`).join('\n'),
    );
  }

  return teile.join('\n');
}

export interface W1Prompt {
  system: string;
  prompt: string;
}

export function buildDrafterPrompt(input: W1Input, kontext: W1GesammelterKontext): W1Prompt {
  return {
    system: buildSystemPrompt(),
    prompt: buildUserPrompt(input, kontext),
  };
}
