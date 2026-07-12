// Orchestrierung: Prompt bauen, LLM aufrufen (Opus-Klasse, siehe Decision),
// Zod-validieren, Konservativ-Prinzip anwenden. Kennt weder Supabase noch
// Storage -- Persistenz (Teil 3) ist PR 2 (siehe
// docs/decisions/2026-07-12_kundenprofil-ki-befuellung.md, Abschnitt
// "Vorgehen"). Analog zu klassifiziereNachricht (packages/classifier/src/classify.ts).

import type { LLMProvider, TokenVerbrauch } from '@konsole/llm';
import { wendeKonservativesPrinzipAn } from './konservativ.js';
import { buildProfilExtraktionsPrompt } from './prompt.js';
import { ProfilExtraktionsVorschlagSchema, type ProfilExtraktionsVorschlag } from './schema.js';
import type { ProfilExtraktionsQuelle } from './types.js';

// Opus-Klasse, weil Extraktions-Fehler sich laut Auftrag durch alle
// späteren Handler-Outputs ziehen -- gleiche Begründung wie
// DEFAULT_MODELL_W2_DRAFT (packages/handlers/src/w2/draft.ts).
export const DEFAULT_MODELL_PROFIL_EXTRAKTION =
  process.env.ANTHROPIC_MODEL_PROFIL_EXTRAKTION ?? 'claude-opus-4-5-20250929';

// Über dem AGENTS.md-§7.3-Minimum (8000): ein Extraktions-Output befüllt
// potenziell neun Listen-Kategorien gleichzeitig, mehr Ausgabe-Volumen als
// ein einzelner Klassifikations-Call.
export const DEFAULT_MAX_TOKENS_PROFIL_EXTRAKTION = 12000;

export interface ProfilExtraktionsOptionen {
  model?: string;
  maxTokens?: number;
}

export type ProfilExtraktionsResultat =
  | {
      status: 'erfolg';
      vorschlag: ProfilExtraktionsVorschlag;
      verworfeneKennzahlen: number;
      tokenVerbrauch: TokenVerbrauch;
      modell: string;
    }
  | {
      status: 'fehlgeschlagen';
      fehler: string;
      rohtext?: string;
      /**
       * Nur gesetzt, wenn tatsächlich eine LLM-Antwort empfangen wurde (JSON-
       * Parse- oder Zod-Validierungsfehler), nicht bei einem fehlgeschlagenen
       * Aufruf selbst. Teil 3 (Persistenz, PR 2) braucht das, um auch für
       * eine fehlgeschlagene Extraktion eine korrekte llm_nutzung-Zeile zu
       * schreiben -- gleiches Prinzip wie KlassifikationsResultat.
       */
      tokenVerbrauch?: TokenVerbrauch;
      modell?: string;
    };

function extractJson(text: string): string {
  const ohneFences = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '');
  return ohneFences.trim();
}

export async function extrahiereProfilVorschlag(
  text: string,
  quelle: ProfilExtraktionsQuelle,
  bezeichnung: string,
  provider: LLMProvider,
  optionen: ProfilExtraktionsOptionen = {},
): Promise<ProfilExtraktionsResultat> {
  const { system, prompt } = buildProfilExtraktionsPrompt(text, quelle, bezeichnung);

  let completion;
  try {
    completion = await provider.strukturierteCompletion({
      system,
      prompt,
      model: optionen.model ?? DEFAULT_MODELL_PROFIL_EXTRAKTION,
      max_tokens: optionen.maxTokens ?? DEFAULT_MAX_TOKENS_PROFIL_EXTRAKTION,
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

  const geparst = ProfilExtraktionsVorschlagSchema.safeParse(roh);
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

  const { vorschlag, verworfeneKennzahlen } = wendeKonservativesPrinzipAn(geparst.data);

  return {
    status: 'erfolg',
    vorschlag,
    verworfeneKennzahlen,
    tokenVerbrauch: completion.tokenVerbrauch,
    modell: completion.modell,
  };
}
