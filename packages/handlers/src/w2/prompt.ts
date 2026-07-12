// Stage-2-Prompt (Comms-Plan-Draft), aus den Prinzipien in
// WORKFLOW_HANDLERS_v1.0.md "W2: Presseanfragen-Drafter" zusammengesetzt.
// Keine wörtliche Prompt-Übernahme aus dem Meta-System (liegt nicht im
// Repository vor), sondern eine Neu-Formulierung der dokumentierten
// Prinzipien -- dokumentiert und begründet in docs/decisions/2026-07-12_w2-presseanfragen-drafter.md
// (AGENTS.md §4: "keine Prompt-Erfindung").

import type { W2GesammelterKontext, W2Input } from './types.js';

const AUSGABE_SCHEMA_BESCHREIBUNG = `{
  "what_were_doing": string (Deutsch, Narrativ: was passiert bei dieser Presseanfrage),
  "strategic_objectives": {
    "reputation": string (Deutsch, ein Satz),
    "risk": string (Deutsch, ein Satz)
  },
  "reactive_statement": string | null (Deutsch, NUR befüllen wenn Sprachregelungen unten als vorhanden markiert sind, sonst null),
  "background_information": [{
    "topic_field": string (Deutsch),
    "content": string (Deutsch),
    "sources": string[] (mindestens eine Quelle pro Eintrag),
    "strategy_note": string (Deutsch)
  }],
  "open_questions": string[] (Deutsch, Check/Confirm/Decide-Aufgaben für die Beraterin),
  "key_messages": [] (in v1 pausiert, IMMER leeres Array)
}`;

function buildSystemPrompt(): string {
  return [
    'Du bist der Presseanfragen-Drafter (W2) einer Intake-Konsole für Kommunikations- und PR-Agenturen im DACH-Raum.',
    'Aufgabe: aus einer eingegangenen Presseanfrage einen internen Comms-Plan für die zuständige Beraterin erzeugen. Antworte ausschließlich mit einem JSON-Objekt, keine Erklärung, kein Markdown, keine Code-Fences.',
    '',
    'Der Comms-Plan geht NIE direkt an den Journalisten oder die Redaktion. Er ist ausschließlich internes Arbeitsmaterial: die Beraterin liest ihn, die Etatdirektion reviewt, die Kundin gibt frei -- alle deutschsprachig.',
    '',
    'Verbindliche Sprach-Regel (WORKFLOW_HANDLERS_v1.0.md W2, AGENTS.md §3.4): ALLE sechs Felder sind IMMER auf Deutsch, unabhängig von der Sprache der eingegangenen Presseanfrage (auch wenn die Anfrage auf Englisch oder einer anderen Sprache eingegangen ist). Deutsche Ausgaben immer mit echten Umlauten (ä, ö, ü, ß), niemals als ae/oe/ue/ss.',
    '',
    'Feld-Regeln:',
    '- reactive_statement: NUR befüllen, wenn unten Sprachregelungen als vorhanden markiert sind. Sonst strikt null.',
    '- key_messages: in v1 pausiert, IMMER leeres Array.',
    '- background_information: jeder Eintrag braucht mindestens eine Quelle in sources, keine unbelegten Behauptungen.',
    '- Keine Nennung von Tier-1/2/3-Medien-Einstufungen im Klartext.',
    '- Kein Bezug auf die eigene Vermittlungsrolle der Agentur ("unsere Agentur hat weitergeleitet" o. ä.).',
    '- Keine Erklärung interner Agentur-Prozesse oder Freigabewege.',
    '- Action Items ausschließlich in open_questions, nirgendwo sonst (keine TODO-Marker in anderen Feldern).',
    '- Wenn eine explizite Frist vorliegt: ein standardisierter Deadline-Hinweis (Format "bis TT.MM.JJJJ") in reactive_statement oder in einer open_questions-Zeile.',
    '- Keine Spekulationen oder unbelegten Vermutungen, keine Framing-Risiken für den Kunden.',
    '',
    'Antworte ausschließlich mit einem JSON-Objekt exakt nach diesem Schema, alle sechs Felder sind Pflicht:',
    AUSGABE_SCHEMA_BESCHREIBUNG,
  ].join('\n');
}

function formatQuelle(name: string, verfuegbar: boolean, daten: unknown): string {
  if (!verfuegbar) return `${name}: nicht verfügbar (v1-Stub oder kein Datenbestand hinterlegt)`;
  return `${name}: ${JSON.stringify(daten)}`;
}

function buildUserPrompt(input: W2Input, kontext: W2GesammelterKontext, korrekturHinweis?: string): string {
  const anfrageJson = JSON.stringify(input.anfrage, null, 2);

  const kontextZeilen = [
    formatQuelle('Sprachregelungen', kontext.sprachregelungen.verfuegbar, kontext.sprachregelungen.daten),
    formatQuelle('SSOT (frühere Comms-Plans)', kontext.ssot.verfuegbar, kontext.ssot.daten),
    formatQuelle('Externes Wissen (Themen-Positionierung)', kontext.externes_wissen.verfuegbar, kontext.externes_wissen.daten),
    formatQuelle('Client-Final-Präzedenzen', kontext.praezedenzen.verfuegbar, kontext.praezedenzen.daten),
    formatQuelle('Journalist:innen-Profil', kontext.journalisten_profil.verfuegbar, kontext.journalisten_profil.daten),
  ].join('\n');

  const teile = [
    'Erzeuge den Comms-Plan für die folgende Presseanfrage. Kunde: ' + input.kunde_kontext.kunde_slug,
    '',
    'Presseanfrage:',
    anfrageJson,
    '',
    'Gesammelter Kontext (Stage 1):',
    kontextZeilen,
  ];

  if (kontext.hinweise.length > 0) {
    teile.push('', 'Fallback-Hinweise aus der Kontext-Sammlung (im Draft berücksichtigen):', kontext.hinweise.map((h) => `- ${h}`).join('\n'));
  }

  if (korrekturHinweis) {
    teile.push(
      '',
      'Der vorherige Entwurf hat den Prüf-Check NICHT bestanden. Korrigiere gezielt folgende Punkte, ohne neue Verstöße einzuführen:',
      korrekturHinweis,
    );
  }

  return teile.join('\n');
}

export interface W2Prompt {
  system: string;
  prompt: string;
}

export function buildCommsPlanPrompt(
  input: W2Input,
  kontext: W2GesammelterKontext,
  korrekturHinweis?: string,
): W2Prompt {
  return {
    system: buildSystemPrompt(),
    prompt: buildUserPrompt(input, kontext, korrekturHinweis),
  };
}
