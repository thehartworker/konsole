// Stage 2: Comms-Plan-Draft. Ein LLM-Aufruf über das LLMProvider-Interface
// aus packages/llm (der Retry-Wrapper für Rate-Limits läuft dort bereits
// innerhalb der Provider-Implementierung, siehe AnthropicProvider). Jeder
// Output geht durch Zod, bevor er verwendet wird (AGENTS.md §3.3/§4).

import type { LLMProvider, TokenVerbrauch } from '@konsole/llm';
import type { W2KontextErgebnis } from './kontext.js';
import { extractJson } from './json-util.js';
import { buildDraftPrompt } from './prompt.js';
import { CommsPlanLlmAusgabeSchema, type CommsPlanLlmAusgabe } from './schema.js';
import type { PruefungsVerstoss, W2Input } from './types.js';

export const DEFAULT_MODELL_W2_DRAFT =
  process.env.ANTHROPIC_MODEL_W2_DRAFT ?? 'claude-opus-4-1-20250805';

// AGENTS.md §7.3: Handler-Token-Budget niemals unter 8000.
export const DEFAULT_MAX_TOKENS_W2_DRAFT = 8000;

export interface DraftOptionen {
  model?: string;
  maxTokens?: number;
}

export interface DraftKorrektur {
  vorherigeVerstoesse: PruefungsVerstoss[];
  vorherigerDraft: CommsPlanLlmAusgabe;
}

export type DraftResultat =
  | {
      status: 'erfolg';
      commsPlanEntwurf: CommsPlanLlmAusgabe;
      tokenVerbrauch: TokenVerbrauch;
      modell: string;
    }
  | {
      status: 'fehlgeschlagen';
      fehler: string;
      rohtext?: string;
      tokenVerbrauch?: TokenVerbrauch;
      modell?: string;
    };

export async function erzeugeCommsPlanDraft(
  input: W2Input,
  kontext: W2KontextErgebnis,
  provider: LLMProvider,
  optionen: DraftOptionen = {},
  korrektur?: DraftKorrektur,
): Promise<DraftResultat> {
  const { system, prompt } = buildDraftPrompt(input, kontext, korrektur);

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
      rohtext: completion.text,
      tokenVerbrauch: completion.tokenVerbrauch,
      modell: completion.modell,
    };
  }

  const geparst = CommsPlanLlmAusgabeSchema.safeParse(roh);
  if (!geparst.success) {
    const details = geparst.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    return {
      status: 'fehlgeschlagen',
      fehler: `Zod-Validierung fehlgeschlagen: ${details}`,
      rohtext: completion.text,
      tokenVerbrauch: completion.tokenVerbrauch,
      modell: completion.modell,
    };
  }

  return {
    status: 'erfolg',
    commsPlanEntwurf: geparst.data,
    tokenVerbrauch: completion.tokenVerbrauch,
    modell: completion.modell,
  };
}
