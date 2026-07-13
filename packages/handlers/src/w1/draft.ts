// Stage 2: Pressemitteilungs-Draft. Sonnet-Klasse laut WORKFLOW_HANDLERS_v1.0.md
// "W1" / AGENTS.md §7.2. Gleiches Fehler-/Token-Rückgabemuster wie
// packages/handlers/src/w2/draft.ts: LLM-Aufruf-Fehler, JSON-Parse-Fehler
// und Zod-Validierungsfehler sind alle "fehlgeschlagen", tokenVerbrauch wird
// trotzdem zurückgegeben, wenn eine Antwort tatsächlich empfangen wurde
// (bereits abgerechnet, siehe AGENTS.md §4 / docs/decisions/2026-07-13_w1-pressemitteilung-drafter.md,
// Abschnitt "Token-Erfassung"). extractJson wird von w2/draft.ts wiederverwendet
// -- ein reiner Code-Fence-Stripper ohne W1/W2-spezifische Logik.

import type { LLMProvider, TokenVerbrauch } from '@konsole/llm';
import { extractJson } from '../w2/draft.js';
import { buildDrafterPrompt } from './prompt.js';
import { PressemitteilungSchema, type PressemitteilungDraft } from './schema.js';
import type { W1GesammelterKontext, W1Input } from './types.js';

export const DEFAULT_MODELL_W1_DRAFT = process.env.ANTHROPIC_MODEL_W1_DRAFT ?? 'claude-sonnet-4-5-20250929';
export const DEFAULT_MAX_TOKENS_W1_DRAFT = 8000; // AGENTS.md §7.3: nie unter 8000

export interface PressemitteilungDraftOptionen {
  model?: string;
  maxTokens?: number;
}

export type PressemitteilungDraftResultat =
  | { status: 'erfolg'; draft: PressemitteilungDraft; tokenVerbrauch: TokenVerbrauch; modell: string }
  | { status: 'fehlgeschlagen'; fehler: string; tokenVerbrauch?: TokenVerbrauch; modell?: string };

export async function erzeugePressemitteilungDraft(
  input: W1Input,
  kontext: W1GesammelterKontext,
  provider: LLMProvider,
  optionen: PressemitteilungDraftOptionen = {},
): Promise<PressemitteilungDraftResultat> {
  const { system, prompt } = buildDrafterPrompt(input, kontext);

  let completion;
  try {
    completion = await provider.strukturierteCompletion({
      system,
      prompt,
      model: optionen.model ?? DEFAULT_MODELL_W1_DRAFT,
      max_tokens: optionen.maxTokens ?? DEFAULT_MAX_TOKENS_W1_DRAFT,
    });
  } catch (fehler) {
    return {
      status: 'fehlgeschlagen',
      fehler: `LLM-Aufruf fehlgeschlagen: ${fehler instanceof Error ? fehler.message : String(fehler)}`,
    };
  }

  let roh: unknown;
  try {
    roh = JSON.parse(extractJson(completion.text));
  } catch {
    return {
      status: 'fehlgeschlagen',
      fehler: 'LLM-Antwort ist kein valides JSON.',
      tokenVerbrauch: completion.tokenVerbrauch,
      modell: completion.modell,
    };
  }

  const geparst = PressemitteilungSchema.safeParse(roh);
  if (!geparst.success) {
    const details = geparst.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    return {
      status: 'fehlgeschlagen',
      fehler: `Zod-Validierung fehlgeschlagen: ${details}`,
      tokenVerbrauch: completion.tokenVerbrauch,
      modell: completion.modell,
    };
  }

  return {
    status: 'erfolg',
    draft: geparst.data,
    tokenVerbrauch: completion.tokenVerbrauch,
    modell: completion.modell,
  };
}
