// Extraktions-Prompt (Teil 2, Issue #37). Konservativ-Prinzip auf
// Prompt-Ebene, siehe docs/decisions/2026-07-12_kundenprofil-ki-befuellung.md,
// Abschnitt "Konservativ-Prinzip" -- Stufe 1 von 2 (Stufe 2 ist die
// Code-seitige Nachbearbeitung in konservativ.ts, die dem Modell auch bei
// befolgtem Prompt nicht blind vertraut).

import type { ProfilExtraktionsQuelle } from './types.js';

const AUSGABE_SCHEMA_BESCHREIBUNG = `{
  "fakten": { "rechtsform": string|null, "sitz": string|null, "geschaeftsbeschreibung": string|null },
  "stimme": {
    "grundton": "sachlich"|"warm_handwerklich"|"technisch_praezise"|"aktivistisch"|null,
    "anrede_konvention": "du"|"sie"|null,
    "gendering_konvention": string|null,
    "zielsprache_absender_texte": string|null
  },
  "strategie": { "positionierung": string|null, "usp": string|null },
  "boilerplate": [{ "typ": "kurz"|"lang", "sprache": string (ISO-639-Code, z. B. "de"), "text": string }],
  "kennzahlen": [{ "bezeichnung": string, "wert": string, "stichtag": string|null (ISO-Datum), "quelle": string|null }],
  "sprecher": [{ "name": string, "rolle": string|null, "exakte_schreibweise": string|null, "zitat_freigabe": boolean }],
  "kernbotschaften": [{ "text": string, "reihenfolge": number }],
  "themen": [{ "thema": string, "sprachregelung": string|null, "reaktives_statement": string|null, "positionierung_vorhanden": boolean }],
  "grenzen": [{ "typ": "no_go_thema"|"nicht_nennbarer_wettbewerber"|"nicht_nennbare_person"|"verbotene_aussage"|"pflichtbaustein", "inhalt": string, "textart_geltungsbereich": string|null }],
  "medien_kontext": [{ "medium_name": string, "journalist_name": string|null, "beziehungsnotiz": string|null, "prioritaet": "hoch"|"mittel"|"niedrig"|null }],
  "unklare_hinweise": string[] (Dinge, die im Text auftauchen, aber keinem Feld sicher zuordenbar sind)
}`;

export interface ProfilExtraktionsPrompt {
  system: string;
  prompt: string;
}

function buildSystemPrompt(): string {
  return [
    'Du bist der Profil-Extraktions-Layer einer Intake-Konsole für Kommunikations- und PR-Agenturen im DACH-Raum.',
    'Deine Aufgabe: aus einem beschafften Text (hochgeladenes Kundendokument oder Text von der Kunden-Website) Kundenprofil-Elemente ableiten und in exakt einem JSON-Objekt nach dem unten definierten Schema antworten. Keine Erklärung, kein Markdown, keine Code-Fences, nur das JSON-Objekt.',
    '',
    'KONSERVATIV-PRINZIP, VERBINDLICH UND WICHTIGER ALS VOLLSTÄNDIGKEIT:',
    '- Ein leeres Feld (null bzw. ein weggelassenes Listen-Element) ist IMMER besser als ein erfundener oder geratener Wert.',
    '- Du wirst NICHT dafür bewertet, wie viele Felder du befüllst, sondern ausschließlich dafür, dass jedes befüllte Feld im Text tatsächlich eindeutig belegt ist.',
    '- Befülle ein Feld nur, wenn ein Mensch beim Nachlesen des Textes zu demselben Schluss käme. Bei Unsicherheit: null bzw. weglassen, und stattdessen einen Hinweis in "unklare_hinweise" hinterlassen.',
    '- Kennzahlen (kennzahlen[]): eine Zahl OHNE erkennbaren Stichtag UND OHNE erkennbare Quelle im Text NIEMALS raten oder mit dem heutigen Datum/einer erfundenen Quelle auffüllen. Fehlt eines von beidem im Text, setze stichtag bzw. quelle auf null -- rate niemals einen plausibel klingenden Wert.',
    '- Erfinde NIEMALS Boilerplate-Text, Kernbotschaften oder Zitate, die im Quelltext nicht wörtlich oder sinngemäß eindeutig vorkommen.',
    '- "grenzen" (das Ungesagte, No-Gos): nur aufnehmen, wenn der Text eine Einschränkung explizit nennt (z. B. "wir kommentieren X grundsätzlich nicht"). Erfinde keine Grenzen aus reiner Vorsicht.',
    '',
    'Deutsche Ausgaben immer mit echten Umlauten (ä, ö, ü, ß), niemals als ae/oe/ue/ss.',
    '',
    'Antworte ausschließlich mit einem JSON-Objekt exakt nach diesem Schema, alle Top-Level-Felder sind Pflicht (auch wenn ihr Inhalt leer/null ist):',
    AUSGABE_SCHEMA_BESCHREIBUNG,
  ].join('\n');
}

function quelleBeschreibung(quelle: ProfilExtraktionsQuelle): string {
  return quelle === 'dokument-upload'
    ? 'ein von der Agentur/dem Kunden hochgeladenes Dokument (z. B. Geschäftsbericht, Boilerplate-Vorlage, Sprachregelungen)'
    : 'Text von der öffentlichen Kunden-Website (Startseite, Über-uns, Impressum, Presse/News)';
}

function buildUserPrompt(text: string, quelle: ProfilExtraktionsQuelle, bezeichnung: string): string {
  return [
    `Die folgende Textquelle ist ${quelleBeschreibung(quelle)}, konkret: ${bezeichnung}.`,
    'Extrahiere daraus Kundenprofil-Elemente nach dem Konservativ-Prinzip aus dem System-Prompt.',
    '',
    'Text:',
    text,
  ].join('\n');
}

export function buildProfilExtraktionsPrompt(
  text: string,
  quelle: ProfilExtraktionsQuelle,
  bezeichnung: string,
): ProfilExtraktionsPrompt {
  return {
    system: buildSystemPrompt(),
    prompt: buildUserPrompt(text, quelle, bezeichnung),
  };
}
