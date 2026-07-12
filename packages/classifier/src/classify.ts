// Orchestrierung: Prompt bauen, LLM aufrufen, Zod-validieren, Sensitivity-
// Hardrules anwenden, Eskalations-Hardrule erzwingen. Kennt weder Supabase
// noch die Service-Role - Persistenz ist Teil 2 (siehe Design-Decision,
// "Grenze Klassifikation/Handler-Auslösung"). Löst keinen Handler aus.

import type { LLMProvider, TokenVerbrauch } from '@konsole/llm';
import { erzwingeEskalationsHardrule } from './eskalation.js';
import { buildKlassifikationsPrompt } from './prompt.js';
import { KlassifikationsErgebnisSchema, type KlassifikationsErgebnis } from './schema.js';
import { erkenneSensitivitaetHardrules } from './sensitivity.js';
import type { EingehendeNachricht, KlassifikationsKontext } from './types.js';

export const DEFAULT_MODELL_KLASSIFIKATION =
  process.env.ANTHROPIC_MODEL_KLASSIFIKATION ?? 'claude-sonnet-4-5-20250929';

export const DEFAULT_MAX_TOKENS_KLASSIFIKATION = 16000; // AGENTS.md §7.3

export interface KlassifikationsOptionen {
  model?: string;
  maxTokens?: number;
}

export type KlassifikationsResultat =
  | {
      status: 'erfolg';
      ergebnis: KlassifikationsErgebnis;
      tokenVerbrauch: TokenVerbrauch;
      modell: string;
    }
  | {
      status: 'fehlgeschlagen';
      fehler: string;
      rohtext?: string;
    };

function extractJson(text: string): string {
  const ohneFences = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '');
  return ohneFences.trim();
}

export async function klassifiziereNachricht(
  nachricht: EingehendeNachricht,
  kontext: KlassifikationsKontext,
  provider: LLMProvider,
  optionen: KlassifikationsOptionen = {},
): Promise<KlassifikationsResultat> {
  const { system, prompt } = buildKlassifikationsPrompt(nachricht, kontext);

  let completion;
  try {
    completion = await provider.strukturierteCompletion({
      system,
      prompt,
      model: optionen.model ?? DEFAULT_MODELL_KLASSIFIKATION,
      max_tokens: optionen.maxTokens ?? DEFAULT_MAX_TOKENS_KLASSIFIKATION,
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
    };
  }

  const geparst = KlassifikationsErgebnisSchema.safeParse(roh);
  if (!geparst.success) {
    const details = geparst.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    return {
      status: 'fehlgeschlagen',
      fehler: `Zod-Validierung fehlgeschlagen: ${details}`,
      rohtext: completion.text,
    };
  }

  let ergebnis = geparst.data;

  // Sensitivity-Hardrule: nur anheben, nie abschwächen (siehe sensitivity.ts).
  if (ergebnis.sensitivity === 'normal') {
    const hardruleTreffer = erkenneSensitivitaetHardrules(nachricht);
    if (hardruleTreffer) {
      ergebnis = { ...ergebnis, sensitivity: hardruleTreffer.sensitivity };
    }
  }

  // Eskalations-Hardrule (§3.3), unantastbar: läuft nach der Sensitivity-
  // Anhebung, damit eine per Hardrule erkannte Sensitivity die Rückfragen
  // ebenfalls zuverlässig blockiert.
  ergebnis = erzwingeEskalationsHardrule(ergebnis);

  return {
    status: 'erfolg',
    ergebnis,
    tokenVerbrauch: completion.tokenVerbrauch,
    modell: completion.modell,
  };
}
