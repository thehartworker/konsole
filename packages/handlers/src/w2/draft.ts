// Stage 2: Comms-Plan-Draft. Opus-Klasse laut WORKFLOW_HANDLERS_v1.0.md
// "W2" / AGENTS.md §7.2. Gleiches Fehler-/Token-Rückgabemuster wie
// packages/classifier/src/classify.ts: LLM-Aufruf-Fehler, JSON-Parse-Fehler
// und Zod-Validierungsfehler sind alle "fehlgeschlagen", tokenVerbrauch wird
// trotzdem zurückgegeben, wenn eine Antwort tatsächlich empfangen wurde
// (bereits abgerechnet, siehe AGENTS.md §4 / Design-Decision "Token-Erfassung").

import type { LLMProvider, TokenVerbrauch } from '@konsole/llm';
import { buildCommsPlanPrompt } from './prompt.js';
import { CommsPlanSchema, type CommsPlanDraft } from './schema.js';
import type { W2GesammelterKontext, W2Input } from './types.js';

export const DEFAULT_MODELL_W2_DRAFT = process.env.ANTHROPIC_MODEL_W2_DRAFT ?? 'claude-opus-4-5-20250929';
export const DEFAULT_MAX_TOKENS_W2_DRAFT = 8000; // AGENTS.md §7.3: nie unter 8000

export interface CommsPlanDraftOptionen {
  model?: string;
  maxTokens?: number;
}

export type CommsPlanDraftResultat =
  | { status: 'erfolg'; draft: CommsPlanDraft; tokenVerbrauch: TokenVerbrauch; modell: string }
  | { status: 'fehlgeschlagen'; fehler: string; tokenVerbrauch?: TokenVerbrauch; modell?: string };

export function extractJson(text: string): string {
  const ohneFences = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '');
  return ohneFences.trim();
}

export async function erzeugeCommsPlanDraft(
  input: W2Input,
  kontext: W2GesammelterKontext,
  provider: LLMProvider,
  optionen: CommsPlanDraftOptionen = {},
  korrekturHinweis?: string,
): Promise<CommsPlanDraftResultat> {
  const { system, prompt } = buildCommsPlanPrompt(input, kontext, korrekturHinweis);

  let completion;
  try {
    completion = await provider.strukturierteCompletion({
      system,
      prompt,
      model: optionen.model ?? DEFAULT_MODELL_W2_DRAFT,
      max_tokens: optionen.maxTokens ?? DEFAULT_MAX_TOKENS_W2_DRAFT,
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

  const geparst = CommsPlanSchema.safeParse(roh);
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
