// Stage 3: Kritiker-Pass. Opus-Klasse laut WORKFLOW_HANDLERS_v1.0.md "W1" /
// AGENTS.md §7.2, Rolle "kritischer Wirtschaftsredakteur". Anders als bei
// W2s Regel-Engine (packages/handlers/src/w2/regel-engine/pruefung.ts) gibt
// es hier keine kundenkonfigurierbaren Regeln und keinen Retry-Loop -- der
// Kritiker findet und meldet, der Mensch entscheidet, siehe
// docs/decisions/2026-07-13_w1-pressemitteilung-drafter.md, Abschnitt 3.

import type { LLMProvider, TokenVerbrauch } from '@konsole/llm';
import { extractJson } from '../w2/draft.js';
import { KritikerFindingSchema, type KritikerFinding, type PressemitteilungDraft } from './schema.js';

export const DEFAULT_MODELL_W1_KRITIKER = process.env.ANTHROPIC_MODEL_W1_KRITIKER ?? 'claude-opus-4-5-20250929';
export const DEFAULT_MAX_TOKENS_W1_KRITIKER = 8000; // AGENTS.md §7.3: nie unter 8000

export interface KritikerOptionen {
  model?: string;
  maxTokens?: number;
}

export type KritikerResultat =
  | { status: 'erfolg'; findings: KritikerFinding[]; tokenVerbrauch: TokenVerbrauch; modell: string }
  | { status: 'fehlgeschlagen'; fehler: string; tokenVerbrauch?: TokenVerbrauch; modell?: string };

const AUSGABE_SCHEMA_BESCHREIBUNG = `{
  "kritiker_findings": [{
    "schweregrad": "niedrig" | "mittel" | "hoch",
    "finding": string (Deutsch, konkret, welche Stelle/welches Problem),
    "empfehlung": string (Deutsch, was die Beraterin konkret tun sollte)
  }]
}`;

function buildKritikerSystemPrompt(): string {
  return [
    'Du bist der Kritiker-Pass (Stage 3) des W1-Pressemitteilungs-Drafters einer Intake-Konsole für PR-Agenturen im DACH-Raum, Rolle "kritischer Wirtschaftsredakteur".',
    'Prüfe den folgenden Pressemitteilungs-Entwurf redaktionell-kritisch. Antworte ausschließlich mit einem JSON-Objekt, keine Erklärung, kein Markdown, keine Code-Fences.',
    '',
    'Prüfpunkte:',
    '- Ist die Headline nichtssagend oder austauschbar?',
    '- Ist die Nachricht wirklich neu, oder wird etwas Bekanntes nur neu verpackt?',
    '- Enthält der Text unbelegte Behauptungen?',
    '- Wirkt das Zitat (falls vorhanden) authentisch, oder gestellt/floskelhaft?',
    '- Sind genannte Zahlen belastbar bzw. nachvollziehbar hergeleitet?',
    '- Ist der Aufbau insgesamt redaktionell verwertbar (Struktur, Länge, roter Faden)?',
    '',
    'Melde jeden gefundenen Punkt als eigenes Finding mit Schweregrad ("niedrig", "mittel" oder "hoch"). Wenn nichts zu beanstanden ist: leeres Array.',
    'Antworte ausschließlich mit einem JSON-Objekt exakt nach diesem Schema:',
    AUSGABE_SCHEMA_BESCHREIBUNG,
  ].join('\n');
}

function buildKritikerUserPrompt(pressemitteilung: PressemitteilungDraft): string {
  return ['Pressemitteilungs-Entwurf (JSON):', JSON.stringify(pressemitteilung, null, 2)].join('\n');
}

export async function erzeugeKritikerBefund(
  pressemitteilung: PressemitteilungDraft,
  provider: LLMProvider,
  optionen: KritikerOptionen = {},
): Promise<KritikerResultat> {
  const system = buildKritikerSystemPrompt();
  const prompt = buildKritikerUserPrompt(pressemitteilung);

  let completion;
  try {
    completion = await provider.strukturierteCompletion({
      system,
      prompt,
      model: optionen.model ?? DEFAULT_MODELL_W1_KRITIKER,
      max_tokens: optionen.maxTokens ?? DEFAULT_MAX_TOKENS_W1_KRITIKER,
    });
  } catch (fehler) {
    return {
      status: 'fehlgeschlagen',
      fehler: `Kritiker-Pass-Aufruf fehlgeschlagen: ${fehler instanceof Error ? fehler.message : String(fehler)}`,
    };
  }

  let roh: unknown;
  try {
    roh = JSON.parse(extractJson(completion.text));
  } catch {
    return {
      status: 'fehlgeschlagen',
      fehler: 'Kritiker-Pass-Antwort ist kein valides JSON.',
      tokenVerbrauch: completion.tokenVerbrauch,
      modell: completion.modell,
    };
  }

  const geparst = KritikerFindingSchema.array().safeParse((roh as { kritiker_findings?: unknown })?.kritiker_findings);
  if (!geparst.success) {
    const details = geparst.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    return {
      status: 'fehlgeschlagen',
      fehler: `Zod-Validierung des Kritiker-Befunds fehlgeschlagen: ${details}`,
      tokenVerbrauch: completion.tokenVerbrauch,
      modell: completion.modell,
    };
  }

  return {
    status: 'erfolg',
    findings: geparst.data,
    tokenVerbrauch: completion.tokenVerbrauch,
    modell: completion.modell,
  };
}
