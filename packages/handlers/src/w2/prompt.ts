// Prompt-Bau für Stage 2 (Comms-Plan-Draft) und den urteilsbasierten Teil von
// Stage 3 (Review-Pass). Quelle: WORKFLOW_HANDLERS_v1.0.md "W2", "Wichtig zur
// Sprach-Regel" und die Regel-Liste unter "Stage 3: 19-Punkte-Check";
// AGENTS.md §3.4 (Sprach-Regel), §7.1 (Meta-System-Prinzipien-Prinzip: nichts
// erfinden, explizit vs. erschlossen trennen -- hier analog auf den
// Comms-Plan angewendet). Keine Prompt-Erfindung im Sinne von AGENTS.md §4:
// jede Anweisung ist auf einen Satz aus der Spec oder aus der Design-Decision
// zurückführbar.

import type { W2KontextErgebnis } from './kontext.js';
import type { PruefungsVerstoss, W2Input } from './types.js';
import type { CommsPlanLlmAusgabe } from './schema.js';

const DRAFT_AUSGABE_SCHEMA_BESCHREIBUNG = `{
  "what_were_doing": string (Deutsch, Narrativ was passiert),
  "strategic_objectives": { "reputation": string, "risk": string } (je ein Satz),
  "reactive_statement": string | null (nur wenn eine Sprachregelung vorliegt, sonst zwingend null),
  "background_information": [{ "topic_field": string, "content": string, "sources": string[], "strategy_note": string }],
  "open_questions": string[] (Check/Confirm/Decide-Aufgaben für die Beraterin)
}`;

export interface DraftPrompt {
  system: string;
  prompt: string;
}

function buildDraftSystemPrompt(): string {
  return [
    'Du bist der Comms-Plan-Drafter einer Intake-Konsole für Kommunikations- und PR-Agenturen im DACH-Raum (Presseanfragen-Handler "W2").',
    'Deine Aufgabe: aus einer eingehenden Presseanfrage einen internen Comms-Plan für die zuständige Beraterin erstellen. Antworte ausschließlich mit einem JSON-Objekt, keine Erklärung, kein Markdown, keine Code-Fences.',
    '',
    'Sprach-Regel (verbindlich, AGENTS.md §3.4, WORKFLOW_HANDLERS "W2"):',
    '- Alle Felder dieses Comms-Plans sind interne Kommunikation innerhalb der Agentur (Beraterin, Etatdirektor:in, Kund:in-Freigabe), NICHT an den Absender gerichtet.',
    '- Deshalb sind alle Felder IMMER auf Deutsch zu verfassen, unabhängig davon, in welcher Sprache die eingegangene Presseanfrage formuliert war. Eine englische Anfrage ändert daran nichts.',
    '- Deutsche Umlaute immer als echte Umlaute (ä, ö, ü, ß), nie als ae/oe/ue/ss.',
    '',
    'Prinzipien:',
    '- Nichts erfinden: fehlende Informationen bleiben leer oder werden als offene Frage in open_questions markiert, keine erfundenen Fakten, Positionen oder Zahlen.',
    '- reactive_statement ist NUR zulässig, wenn eine Sprachregelung zum Thema vorliegt (siehe Kontext unten). Liegt keine vor: reactive_statement = null. Kein eigenständig erfundenes Statement.',
    '- Keine Bezüge darauf, dass die Agentur zwischen Kunde und Journalist vermittelt oder eine interne Rolle einnimmt -- der Plan beschreibt die Sachlage, nicht den Arbeitsprozess der Agentur.',
    '- Keine Erklärungen interner Agentur-Abläufe (Freigabeprozesse, wer was intern macht).',
    '- Keine unbelegten Vermutungen als Tatsachen darstellen -- Unsicherheiten gehören in open_questions.',
    '- Jeder Eintrag in background_information braucht mindestens eine Quellenangabe in sources.',
    '- Falls eine Frist (frist_at) in der Anfrage gesetzt ist: einen Satz mit der Frist im Format "TT.MM.JJJJ, HH:MM Uhr" aufnehmen (in open_questions oder strategic_objectives.risk).',
    '- Keine interne Presse-Tier-Einstufung ("Tier 1", "Tier 2" o.ä.) im Plan nennen.',
    '- Action Items (konkrete Aufgaben für die Beraterin) ausschließlich in open_questions, nirgendwo sonst.',
    '- Wörtliche Fragen des Journalisten (fragen_woertlich), wenn im Plan zitiert, exakt wie im Original übernehmen, nicht paraphrasieren.',
    '- key_messages bleibt in v1 ungenutzt, kein Feld dafür in deiner Antwort nötig.',
    '',
    'Antworte ausschließlich mit einem JSON-Objekt exakt nach diesem Schema, alle Felder sind Pflicht (reactive_statement darf null sein):',
    DRAFT_AUSGABE_SCHEMA_BESCHREIBUNG,
  ].join('\n');
}

function formatiereKontextFuerPrompt(kontext: W2KontextErgebnis): string {
  const zeilen: string[] = [];

  if (kontext.sprachregelungen.status === 'verfuegbar' && kontext.sprachregelungen.daten) {
    zeilen.push(`Sprachregelung zum Thema (nutzbar für reactive_statement): ${kontext.sprachregelungen.daten.text}`);
  } else {
    zeilen.push('Sprachregelung zum Thema: KEINE hinterlegt. reactive_statement muss null bleiben.');
  }

  if (kontext.externesWissen.status === 'verfuegbar' && kontext.externesWissen.daten) {
    zeilen.push(`Aktuelle Positionierung des Kunden zum Thema: ${kontext.externesWissen.daten.positionierung}`);
  } else {
    zeilen.push('Aktuelle Positionierung des Kunden zum Thema: keine hinterlegt.');
  }

  if (kontext.praezedenzen.status === 'verfuegbar' && kontext.praezedenzen.daten) {
    zeilen.push(`Frühere freigegebene Antworten auf ähnliche Anfragen:\n${kontext.praezedenzen.daten.beispiele.map((b) => `- ${b}`).join('\n')}`);
  } else {
    zeilen.push('Frühere freigegebene Antworten auf ähnliche Anfragen: keine hinterlegt (Onboarding empfohlen, generischerer Plan nötig).');
  }

  if (kontext.journalistenProfil.status === 'v1_stub') {
    zeilen.push('Journalist:innen-Profil: in v1 nicht angebunden (kein Recherche-Kontext verfügbar).');
  }

  if (kontext.ssot.status === 'v1_stub') {
    zeilen.push('Kunden-SSOT (frühere Comms-Plans): in v1 nicht angebunden.');
  }

  return zeilen.join('\n\n');
}

function buildKorrekturHinweis(vorherigeVerstoesse: PruefungsVerstoss[], vorherigerDraft: CommsPlanLlmAusgabe): string {
  const verstossZeilen = vorherigeVerstoesse
    .map((v) => `- [${v.regel}] ${v.begruendung}`)
    .join('\n');

  return [
    '',
    'KORREKTUR NÖTIG: Dein vorheriger Entwurf hat gegen folgende Regeln verstoßen:',
    verstossZeilen,
    '',
    'Vorheriger Entwurf (zur Orientierung, überarbeite ihn so, dass alle oben genannten Verstöße behoben sind, ohne neue Verstöße einzuführen):',
    JSON.stringify(vorherigerDraft, null, 2),
  ].join('\n');
}

export function buildDraftPrompt(
  input: W2Input,
  kontext: W2KontextErgebnis,
  korrektur?: { vorherigeVerstoesse: PruefungsVerstoss[]; vorherigerDraft: CommsPlanLlmAusgabe },
): DraftPrompt {
  const anfrageJson = JSON.stringify(input.anfrage, null, 2);

  const userTeile = [
    'Presseanfrage:',
    anfrageJson,
    '',
    'Kontext:',
    formatiereKontextFuerPrompt(kontext),
  ];

  if (korrektur) {
    userTeile.push(buildKorrekturHinweis(korrektur.vorherigeVerstoesse, korrektur.vorherigerDraft));
  }

  return {
    system: buildDraftSystemPrompt(),
    prompt: userTeile.join('\n'),
  };
}

const REVIEW_AUSGABE_SCHEMA_BESCHREIBUNG = `{
  "verstoesse": [{ "regel": "keine_vermittlungsbezuege" | "keine_prozesserklaerungen" | "keine_vermutungen" | "keine_framing_risiken", "begruendung": string }]
}`;

function buildReviewSystemPrompt(): string {
  return [
    'Du bist der Kritiker-Pass für einen Comms-Plan-Entwurf einer PR-Agentur (Presseanfragen-Handler "W2").',
    'Prüfe den folgenden Comms-Plan gegen genau vier Regeln und antworte ausschließlich mit einem JSON-Objekt, keine Erklärung, kein Markdown.',
    '',
    'Regeln:',
    '- keine_vermittlungsbezuege: Der Plan darf keine Bezüge darauf enthalten, dass die Agentur zwischen Kunde und Journalist vermittelt oder eine interne Vermittler-Rolle beschreibt.',
    '- keine_prozesserklaerungen: Der Plan darf keine Erklärungen interner Agentur-Arbeitsabläufe enthalten (wer intern was freigibt, wie der Prozess abläuft).',
    '- keine_vermutungen: Aussagen, die als Tatsache formuliert sind, aber tatsächlich unbelegte Vermutungen oder Spekulationen sind, sind ein Verstoß. Unsicherheiten gehören in open_questions, nicht als Tatsachenbehauptung in die anderen Felder.',
    '- keine_framing_risiken: Formulierungen, die den Kunden in ein unnötig negatives Licht rücken, mehrdeutig sind, oder von einem Journalisten gegen den Kunden verwendet werden könnten, sind ein Verstoß.',
    '',
    'Wenn ein Feld keinen Verstoß gegen eine Regel enthält, nimm diese Regel nicht in die Ausgabe auf. Bei keinem Verstoß: leeres Array.',
    '',
    'Antworte exakt nach diesem Schema:',
    REVIEW_AUSGABE_SCHEMA_BESCHREIBUNG,
  ].join('\n');
}

export function buildReviewPrompt(commsPlanEntwurf: CommsPlanLlmAusgabe): DraftPrompt {
  return {
    system: buildReviewSystemPrompt(),
    prompt: `Comms-Plan-Entwurf:\n${JSON.stringify(commsPlanEntwurf, null, 2)}`,
  };
}
