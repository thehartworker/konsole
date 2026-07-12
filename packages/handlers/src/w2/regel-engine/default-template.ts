// Default-Template (Onboarding): die 12 in WORKFLOW_HANDLERS_v1.0.md
// namentlich genannten Meta-Regeln, 8 als Code-Baustein + 4 als LLM-Prompt-
// Regel (siehe docs/decisions/2026-07-12_w2-presseanfragen-drafter.md,
// Abschnitt "Default-Template"). Ein neu angelegter Kunde bekommt dieses Set
// zugewiesen (packages/persistence, PruefregelnRepository.defaultTemplateZuweisen),
// editierbar pro Kunde -- kein fest verdrahteter Regelsatz im Handler.

import type { PruefregelDefinition } from './types.js';

export const W2_HANDLER_SLUG = 'W2_presseanfragen_drafter';

function codeRegel(
  baustein_name: string,
  reihenfolge: number,
  parameter: Record<string, unknown> = {},
): PruefregelDefinition {
  return {
    handler_slug: W2_HANDLER_SLUG,
    typ: 'code_baustein',
    baustein_name,
    parameter,
    prompt_text: null,
    aktiv: true,
    reihenfolge,
  };
}

function llmRegel(prompt_text: string, reihenfolge: number): PruefregelDefinition {
  return {
    handler_slug: W2_HANDLER_SLUG,
    typ: 'llm_prompt',
    baustein_name: null,
    parameter: {},
    prompt_text,
    aktiv: true,
    reihenfolge,
  };
}

export const W2_DEFAULT_PRUEFREGELN: PruefregelDefinition[] = [
  codeRegel('was_wir_tun_zielsprache', 1, { sprache: 'de' }),
  codeRegel('reactive_statement_nur_bei_sprachregelung', 2),
  codeRegel('keine_tier_nennung', 3),
  codeRegel('keine_agentur_vermittlungs_bezug', 4),
  codeRegel('keine_prozess_erklaerungen', 5),
  codeRegel('action_items_nur_in_open_questions', 6),
  codeRegel('background_mit_quellenangabe', 7),
  codeRegel('deadline_schlusssatz_bei_frist', 8),
  llmRegel(
    'Prüfe, ob der Draft unbelegte Vermutungen oder Spekulationen enthält, die durch keine Quelle gedeckt sind. Melde jede Stelle als Verstoß.',
    9,
  ),
  llmRegel(
    'Prüfe, ob der Draft Framing-Risiken enthält, die dem Kunden schaden könnten (z. B. suggestive Formulierungen, die eine Schuld oder Verantwortung nahelegen, die nicht belegt ist).',
    10,
  ),
  llmRegel(
    'Prüfe, ob reactive_statement (falls vorhanden) authentisch und nicht gestelzt oder floskelhaft wirkt.',
    11,
  ),
  llmRegel(
    'Prüfe, ob jede Zeile in open_questions eine echte Entscheidungs- oder Prüf-Frage für die Beraterin ist (Check/Confirm/Decide), keine reine Rechercheaufgabe ohne Entscheidungsbedarf.',
    12,
  ),
];
