// Stage 3: wendet die aktiven Pruefregeln eines Kunden auf einen
// Comms-Plan-Draft an. code_baustein-Regeln laufen über BAUSTEIN_REGISTRY,
// llm_prompt-Regeln laufen gebündelt in EINEM Review-Pass (Sonnet-Klasse) --
// siehe docs/decisions/2026-07-12_w2-presseanfragen-drafter.md, Abschnitt
// "Zu 3" für die Begründung, warum ein Bündel-Call statt eines Calls pro Regel.

import { z } from 'zod';
import type { LLMProvider, TokenVerbrauch } from '@konsole/llm';
import { extractJson } from '../draft.js';
import type { CommsPlanDraft } from '../schema.js';
import { BAUSTEIN_REGISTRY, type BausteinKontext } from './bausteine.js';
import type { PruefungsErgebnis, Pruefregel, RegelVerstoss } from './types.js';

export const DEFAULT_MODELL_W2_REVIEW = process.env.ANTHROPIC_MODEL_W2_REVIEW ?? 'claude-sonnet-4-5-20250929';
export const DEFAULT_MAX_TOKENS_W2_REVIEW = 8000; // AGENTS.md §7.3: nie unter 8000

export interface PruefungLlmOptionen {
  model?: string;
  maxTokens?: number;
}

export interface PruefungLaufResultat {
  ergebnis: PruefungsErgebnis;
  tokenVerbrauch?: TokenVerbrauch;
  modell?: string;
}

const ReviewBefundSchema = z.object({
  verstoesse: z.array(
    z.object({
      regel_index: z.number().int().min(0),
      begruendung: z.string().min(1),
    }),
  ),
});

function buildReviewPrompt(draft: CommsPlanDraft, llmRegeln: Pruefregel[]): { system: string; prompt: string } {
  const system = [
    'Du bist der Review-Pass des W2-Presseanfragen-Drafters einer Intake-Konsole für PR-Agenturen im DACH-Raum.',
    'Prüfe den folgenden Comms-Plan-Entwurf gegen die unten nummerierte Liste von Regeln. Antworte ausschließlich mit einem JSON-Objekt, keine Erklärung, kein Markdown.',
    'Format: {"verstoesse": [{"regel_index": number (0-basiert, Index in der Regel-Liste unten), "begruendung": string (Deutsch, konkret)}]}',
    'Wenn keine Regel verletzt ist: {"verstoesse": []}',
  ].join('\n');

  const regelListe = llmRegeln.map((regel, index) => `${index}. ${regel.prompt_text ?? ''}`).join('\n');

  const prompt = [
    'Regeln:',
    regelListe,
    '',
    'Comms-Plan-Entwurf (JSON):',
    JSON.stringify(draft, null, 2),
  ].join('\n');

  return { system, prompt };
}

export async function fuehreRegelEngineAus(
  draft: CommsPlanDraft,
  regeln: Pruefregel[],
  kontext: BausteinKontext,
  provider: LLMProvider,
  optionen: PruefungLlmOptionen = {},
): Promise<PruefungLaufResultat> {
  const aktive = regeln.filter((regel) => regel.aktiv).sort((a, b) => a.reihenfolge - b.reihenfolge);
  const codeRegeln = aktive.filter((regel) => regel.typ === 'code_baustein');
  const llmRegeln = aktive.filter((regel) => regel.typ === 'llm_prompt');

  const verstoesse: RegelVerstoss[] = [];

  for (const regel of codeRegeln) {
    const bausteinName = regel.baustein_name;
    if (!bausteinName) continue; // durch DB-CHECK-Constraint ausgeschlossen, defensiv trotzdem übersprungen
    const fn = BAUSTEIN_REGISTRY[bausteinName];
    if (!fn) {
      // fail-closed: ein unbekannter Baustein-Name (Tippfehler, noch nicht
      // implementierter Baustein) zählt als Verstoß statt stillschweigend
      // übersprungen zu werden (siehe Design-Decision, "Zu 3").
      verstoesse.push({
        regel_id: regel.id,
        baustein_name: bausteinName,
        quelle: 'code',
        begruendung: `Unbekannter Baustein "${bausteinName}" in der Registry, Regel wird fail-closed als Verstoß gewertet.`,
      });
      continue;
    }
    const bausteinErgebnis = fn(draft, kontext, regel.parameter);
    if (!bausteinErgebnis.bestanden) {
      verstoesse.push({
        regel_id: regel.id,
        baustein_name: bausteinName,
        quelle: 'code',
        begruendung: bausteinErgebnis.begruendung,
      });
    }
  }

  let tokenVerbrauch: TokenVerbrauch | undefined;
  let modell: string | undefined;

  if (llmRegeln.length > 0) {
    const { system, prompt } = buildReviewPrompt(draft, llmRegeln);

    let completion;
    try {
      completion = await provider.strukturierteCompletion({
        system,
        prompt,
        model: optionen.model ?? DEFAULT_MODELL_W2_REVIEW,
        max_tokens: optionen.maxTokens ?? DEFAULT_MAX_TOKENS_W2_REVIEW,
      });
    } catch (fehler) {
      verstoesse.push({
        regel_id: null,
        baustein_name: null,
        quelle: 'llm',
        begruendung: `Review-Pass-Aufruf fehlgeschlagen: ${fehler instanceof Error ? fehler.message : String(fehler)}`,
      });
      return { ergebnis: { bestanden: verstoesse.length === 0, verstoesse }, tokenVerbrauch, modell };
    }

    tokenVerbrauch = completion.tokenVerbrauch;
    modell = completion.modell;

    let geparst;
    try {
      geparst = ReviewBefundSchema.safeParse(JSON.parse(extractJson(completion.text)));
    } catch {
      geparst = undefined;
    }

    if (geparst?.success) {
      for (const befund of geparst.data.verstoesse) {
        const regel = llmRegeln[befund.regel_index];
        if (!regel) continue;
        verstoesse.push({ regel_id: regel.id, baustein_name: null, quelle: 'llm', begruendung: befund.begruendung });
      }
    } else {
      verstoesse.push({
        regel_id: null,
        baustein_name: null,
        quelle: 'llm',
        begruendung: 'Review-Pass lieferte kein valides/strukturiertes JSON, Findings konnten nicht ausgewertet werden.',
      });
    }
  }

  return { ergebnis: { bestanden: verstoesse.length === 0, verstoesse }, tokenVerbrauch, modell };
}
