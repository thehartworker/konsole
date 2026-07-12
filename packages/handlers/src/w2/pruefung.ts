// Stage 3: 19-Punkte-Check. Acht der zwölf in WORKFLOW_HANDLERS_v1.0.md
// namentlich genannten Regeln sind deterministisch prüfbar (Code-Checks),
// vier brauchen echtes Sprachverständnis (Review-Prompt, ein zweiter
// LLM-Aufruf). Siehe docs/decisions/2026-07-12_w2-presseanfragen-drafter.md,
// "Zu 3, Regel-Zuordnung" für die vollständige Begründung pro Regel, und den
// "@thehartworker Entscheidung nötig"-Absatz dort zu den fehlenden ~7 Regeln
// aus dem nicht vorliegenden Meta-System-Handoff.

import type { LLMProvider, TokenVerbrauch } from '@konsole/llm';
import type { W2KontextErgebnis } from './kontext.js';
import { extractJson } from './json-util.js';
import { buildReviewPrompt } from './prompt.js';
import { ReviewLlmAusgabeSchema, type CommsPlanLlmAusgabe } from './schema.js';
import { istWahrscheinlichDeutsch } from './sprache.js';
import type { PruefungsVerstoss, W2Input } from './types.js';

export const DEFAULT_MODELL_W2_REVIEW =
  process.env.ANTHROPIC_MODEL_W2_REVIEW ?? 'claude-sonnet-4-5-20250929';

// AGENTS.md §7.3: Handler-Token-Budget niemals unter 8000.
export const DEFAULT_MAX_TOKENS_W2_REVIEW = 8000;

const TIER_MUSTER = /\btier[\s-]?[123]\b/i;
const ACTION_ITEM_MUSTER = /\b(action item|to-?do)\b\s*:|(^|\n)\s*[-*]\s*\[\s*\]|☐/i;
const KANONISCHES_DEADLINE_FORMAT_MUSTER_GLOBAL = /\b\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2} Uhr\b/g;
const LOSES_DATUMS_MUSTER = /\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/g;

function sammleCommsPlanText(commsPlan: CommsPlanLlmAusgabe): string {
  const teile = [
    commsPlan.what_were_doing,
    commsPlan.strategic_objectives.reputation,
    commsPlan.strategic_objectives.risk,
    commsPlan.reactive_statement ?? '',
    ...commsPlan.background_information.flatMap((b) => [b.topic_field, b.content, b.strategy_note]),
  ];
  return teile.join('\n');
}

function sammleTextOhneOpenQuestions(commsPlan: CommsPlanLlmAusgabe): string {
  return sammleCommsPlanText(commsPlan);
}

/** Deutsches Standard-Deadline-Format "TT.MM.JJJJ, HH:MM Uhr" aus einem ISO-Zeitstempel. */
export function formatiereDeadline(isoZeitstempel: string): string {
  const datum = new Date(isoZeitstempel);
  const tag = String(datum.getUTCDate()).padStart(2, '0');
  const monat = String(datum.getUTCMonth() + 1).padStart(2, '0');
  const jahr = datum.getUTCFullYear();
  const stunde = String(datum.getUTCHours()).padStart(2, '0');
  const minute = String(datum.getUTCMinutes()).padStart(2, '0');
  return `${tag}.${monat}.${jahr}, ${stunde}:${minute} Uhr`;
}

function pruefeSpracheWhatWereDoing(commsPlan: CommsPlanLlmAusgabe): PruefungsVerstoss | null {
  if (istWahrscheinlichDeutsch(commsPlan.what_were_doing)) return null;
  return {
    regel: 'sprache_what_were_doing',
    quelle: 'code_check',
    begruendung: 'what_were_doing wirkt nicht wie deutscher Text, ist aber laut Sprach-Regel immer Deutsch.',
  };
}

function pruefeReactiveStatementNurBeiSprachregelung(
  commsPlan: CommsPlanLlmAusgabe,
  kontext: W2KontextErgebnis,
): PruefungsVerstoss | null {
  if (kontext.sprachregelungen.status === 'verfuegbar') return null;
  if (commsPlan.reactive_statement === null) return null;
  return {
    regel: 'reactive_statement_nur_bei_sprachregelung',
    quelle: 'code_check',
    begruendung: 'reactive_statement ist gesetzt, obwohl keine Sprachregelung zum Thema vorliegt.',
  };
}

function pruefeDeadlineFormatStandardisiert(commsPlan: CommsPlanLlmAusgabe): PruefungsVerstoss | null {
  const text = sammleCommsPlanText(commsPlan) + '\n' + commsPlan.open_questions.join('\n');
  // Erst alle bereits kanonisch formatierten Deadline-Nennungen entfernen,
  // damit deren Datumsanteil nicht fälschlich selbst als Verstoß auftaucht.
  const textOhneKanonischeTreffer = text.replace(KANONISCHES_DEADLINE_FORMAT_MUSTER_GLOBAL, '');
  const nichtKanonisch = textOhneKanonischeTreffer.match(LOSES_DATUMS_MUSTER) ?? [];
  if (nichtKanonisch.length === 0) return null;
  return {
    regel: 'deadline_format_standardisiert',
    quelle: 'code_check',
    begruendung: `Datum(s)-Nennung nicht im Standard-Format "TT.MM.JJJJ, HH:MM Uhr": ${nichtKanonisch.join(', ')}`,
  };
}

function pruefeKeineTierNennung(commsPlan: CommsPlanLlmAusgabe): PruefungsVerstoss | null {
  const text = sammleCommsPlanText(commsPlan) + '\n' + commsPlan.open_questions.join('\n');
  if (!TIER_MUSTER.test(text)) return null;
  return {
    regel: 'keine_tier_nennung',
    quelle: 'code_check',
    begruendung: 'Der Plan nennt eine interne Presse-Tier-Einstufung (z. B. "Tier 1").',
  };
}

function pruefeActionItemsNurInOpenQuestions(commsPlan: CommsPlanLlmAusgabe): PruefungsVerstoss | null {
  const text = sammleTextOhneOpenQuestions(commsPlan);
  if (!ACTION_ITEM_MUSTER.test(text)) return null;
  return {
    regel: 'action_items_nur_in_open_questions',
    quelle: 'code_check',
    begruendung: 'Ein Action-Item-Marker (z. B. "To-Do:", Checkbox) taucht außerhalb von open_questions auf.',
  };
}

function pruefeBackgroundMitQuellenangabe(commsPlan: CommsPlanLlmAusgabe): PruefungsVerstoss | null {
  const ohneQuelle = commsPlan.background_information.filter((b) => b.sources.length === 0);
  if (ohneQuelle.length === 0) return null;
  return {
    regel: 'background_mit_quellenangabe',
    quelle: 'code_check',
    begruendung: `${ohneQuelle.length} background_information-Eintrag/Einträge ohne sources.`,
  };
}

function pruefeDeadlineSchlusssatzBeiFrist(
  commsPlan: CommsPlanLlmAusgabe,
  input: W2Input,
): PruefungsVerstoss | null {
  const frist = input.anfrage.frist_at;
  if (!frist) return null;
  const kanonischeFrist = formatiereDeadline(frist);
  const text = sammleCommsPlanText(commsPlan) + '\n' + commsPlan.open_questions.join('\n');
  if (text.includes(kanonischeFrist)) return null;
  return {
    regel: 'deadline_schlusssatz_bei_frist',
    quelle: 'code_check',
    begruendung: `Explizite Frist (${kanonischeFrist}) ist gesetzt, aber kein Deadline-Schlusssatz mit diesem Format im Plan gefunden.`,
  };
}

function normalisiere(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function pruefeQuestionsVerbatim(commsPlan: CommsPlanLlmAusgabe, input: W2Input): PruefungsVerstoss | null {
  const text = sammleCommsPlanText(commsPlan) + '\n' + commsPlan.open_questions.join('\n');
  const normalisierterText = normalisiere(text);

  const paraphrasiert = input.anfrage.fragen_woertlich.filter((frage) => {
    const normalisierteFrage = normalisiere(frage);
    if (normalisierteFrage.length < 6) return false;
    const nurNormalisiertGefunden = normalisierterText.includes(normalisierteFrage);
    const wortwoertlichGefunden = text.includes(frage);
    return nurNormalisiertGefunden && !wortwoertlichGefunden;
  });

  if (paraphrasiert.length === 0) return null;
  return {
    regel: 'questions_verbatim',
    quelle: 'code_check',
    begruendung: `Journalisten-Frage(n) im Plan paraphrasiert statt wörtlich übernommen: ${paraphrasiert.join(' | ')}`,
  };
}

export function fuehreCodeChecksAus(
  commsPlan: CommsPlanLlmAusgabe,
  input: W2Input,
  kontext: W2KontextErgebnis,
): PruefungsVerstoss[] {
  const pruefungen = [
    pruefeSpracheWhatWereDoing(commsPlan),
    pruefeReactiveStatementNurBeiSprachregelung(commsPlan, kontext),
    pruefeDeadlineFormatStandardisiert(commsPlan),
    pruefeKeineTierNennung(commsPlan),
    pruefeActionItemsNurInOpenQuestions(commsPlan),
    pruefeBackgroundMitQuellenangabe(commsPlan),
    pruefeDeadlineSchlusssatzBeiFrist(commsPlan, input),
    pruefeQuestionsVerbatim(commsPlan, input),
  ];
  return pruefungen.filter((v): v is PruefungsVerstoss => v !== null);
}

export interface ReviewOptionen {
  model?: string;
  maxTokens?: number;
}

export type ReviewResultat =
  | { status: 'erfolg'; verstoesse: PruefungsVerstoss[]; tokenVerbrauch: TokenVerbrauch; modell: string }
  | { status: 'fehlgeschlagen'; fehler: string; tokenVerbrauch?: TokenVerbrauch; modell?: string };

export async function fuehreReviewPromptAus(
  commsPlanEntwurf: CommsPlanLlmAusgabe,
  provider: LLMProvider,
  optionen: ReviewOptionen = {},
): Promise<ReviewResultat> {
  const { system, prompt } = buildReviewPrompt(commsPlanEntwurf);

  let completion;
  try {
    completion = await provider.strukturierteCompletion({
      system,
      prompt,
      model: optionen.model ?? DEFAULT_MODELL_W2_REVIEW,
      max_tokens: optionen.maxTokens ?? DEFAULT_MAX_TOKENS_W2_REVIEW,
    });
  } catch (fehler) {
    return {
      status: 'fehlgeschlagen',
      fehler: `Review-LLM-Aufruf fehlgeschlagen: ${fehler instanceof Error ? fehler.message : String(fehler)}`,
    };
  }

  let roh: unknown;
  try {
    roh = JSON.parse(extractJson(completion.text));
  } catch {
    return {
      status: 'fehlgeschlagen',
      fehler: 'Review-LLM-Antwort ist kein valides JSON.',
      tokenVerbrauch: completion.tokenVerbrauch,
      modell: completion.modell,
    };
  }

  const geparst = ReviewLlmAusgabeSchema.safeParse(roh);
  if (!geparst.success) {
    const details = geparst.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    return {
      status: 'fehlgeschlagen',
      fehler: `Zod-Validierung (Review) fehlgeschlagen: ${details}`,
      tokenVerbrauch: completion.tokenVerbrauch,
      modell: completion.modell,
    };
  }

  const verstoesse: PruefungsVerstoss[] = geparst.data.verstoesse.map((v) => ({
    regel: v.regel,
    quelle: 'review_prompt' as const,
    begruendung: v.begruendung,
  }));

  return { status: 'erfolg', verstoesse, tokenVerbrauch: completion.tokenVerbrauch, modell: completion.modell };
}
