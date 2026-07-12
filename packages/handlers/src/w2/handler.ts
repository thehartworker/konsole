// Top-Level-Orchestrierung für W2 (Stages 1-4 plus 19-Punkte-Check-Retry-
// Schleife). Shadow-Mode (WORKFLOW_HANDLERS_v1.0.md "W2", "Output und
// Freigabe"): diese Funktion löst NICHTS aus und versendet NICHTS. Sie gibt
// einen Plan zurück, der auf Beraterin-Freigabe wartet
// (benoetigt_menschliche_freigabe = true, immer). Es gibt hier strukturell
// keinen Code-Pfad, der einen Versand oder einen weiteren Handler aufruft --
// analog zur Shadow-Mode-Durchsetzung in packages/classifier (siehe
// docs/decisions/2026-07-12_klassifikations-layer.md).

import type { LLMProvider } from '@konsole/llm';
import { erzeugeCommsPlanDraft, DEFAULT_MODELL_W2_DRAFT } from './draft.js';
import { formatiereFuerExport } from './export.js';
import {
  sammleW2Kontext,
  verwendeteQuellenAusKontext,
  V1_STUB_KONTEXT_QUELLEN_PROVIDER,
  type W2KontextQuellenProvider,
} from './kontext.js';
import { fuehreCodeChecksAus, fuehreReviewPromptAus, DEFAULT_MODELL_W2_REVIEW } from './pruefung.js';
import { W2OutputSchema, type CommsPlanLlmAusgabe } from './schema.js';
import { W2_FREIGABE_GRUND } from './types.js';
import type { PruefungsVerstoss, W2HandlerResultat, W2Input, W2LlmAufrufProtokoll } from './types.js';

// WORKFLOW_HANDLERS_v1.0.md "W2", Failure-Fallbacks: "nach 3 Retries fehlschlägt".
export const MAX_PRUEFUNGS_RETRIES = 3;

export interface W2Deps {
  llmProvider: LLMProvider;
  kontextQuellen?: W2KontextQuellenProvider;
  draftModel?: string;
  draftMaxTokens?: number;
  reviewModel?: string;
  reviewMaxTokens?: number;
}

function summiereTokens(llmAufrufe: W2LlmAufrufProtokoll[]): { input: number; output: number } {
  return llmAufrufe.reduce(
    (summe, aufruf) => ({
      input: summe.input + aufruf.tokens_input,
      output: summe.output + aufruf.tokens_output,
    }),
    { input: 0, output: 0 },
  );
}

export async function presseanfragenDrafter(input: W2Input, deps: W2Deps): Promise<W2HandlerResultat> {
  const gestartetMs = Date.now();
  const kontext = await sammleW2Kontext(input, deps.kontextQuellen ?? V1_STUB_KONTEXT_QUELLEN_PROVIDER);

  const llmAufrufe: W2LlmAufrufProtokoll[] = [];
  let commsPlanEntwurf: CommsPlanLlmAusgabe | undefined;
  let verstoesse: PruefungsVerstoss[] = [];
  let tatsaechlicheVersuche = 0;
  let draftModell = deps.draftModel ?? DEFAULT_MODELL_W2_DRAFT;

  const maxVersuche = MAX_PRUEFUNGS_RETRIES + 1;

  for (let versuchIndex = 0; versuchIndex < maxVersuche; versuchIndex += 1) {
    tatsaechlicheVersuche = versuchIndex + 1;

    const korrektur =
      versuchIndex > 0 && commsPlanEntwurf
        ? { vorherigeVerstoesse: verstoesse, vorherigerDraft: commsPlanEntwurf }
        : undefined;

    const draftResultat = await erzeugeCommsPlanDraft(
      input,
      kontext,
      deps.llmProvider,
      { model: deps.draftModel, maxTokens: deps.draftMaxTokens },
      korrektur,
    );

    if (draftResultat.tokenVerbrauch) {
      llmAufrufe.push({
        zweck: 'w2_draft',
        versuch: tatsaechlicheVersuche,
        modell: draftResultat.modell ?? draftModell,
        tokens_input: draftResultat.tokenVerbrauch.input_tokens,
        tokens_output: draftResultat.tokenVerbrauch.output_tokens,
      });
    }

    if (draftResultat.status === 'fehlgeschlagen') {
      // Kein Draft-Fallback in der Spec vorgesehen (anders als beim
      // Kritiker-/Review-Pass): ohne einen validen Draft gibt es keinen Plan,
      // der "mit Findings" rausgehen könnte. Der Aufrufer (Persistenz-/
      // Konsolen-Schicht) entscheidet, wie ein gescheiterter Handler-Lauf
      // weiterbehandelt wird (Retry auf höherer Ebene, Fehler an Beraterin).
      // Wie bei klassifiziereNachricht() (packages/classifier/src/classify.ts)
      // wird trotzdem NICHT geworfen, sondern ein Fehlschlags-Resultat
      // inklusive der bereits abgerechneten llmAufrufe zurückgegeben, damit
      // die Persistenz-Schicht auch für einen gescheiterten Lauf eine
      // korrekte llm_nutzung-Zeile schreiben kann.
      return { status: 'fehlgeschlagen', fehler: draftResultat.fehler, llmAufrufe };
    }

    draftModell = draftResultat.modell;
    commsPlanEntwurf = draftResultat.commsPlanEntwurf;

    const codeCheckVerstoesse = fuehreCodeChecksAus(commsPlanEntwurf, input, kontext);

    const reviewResultat = await fuehreReviewPromptAus(commsPlanEntwurf, deps.llmProvider, {
      model: deps.reviewModel,
      maxTokens: deps.reviewMaxTokens,
    });

    let reviewVerstoesse: PruefungsVerstoss[] = [];
    if (reviewResultat.status === 'erfolg') {
      llmAufrufe.push({
        zweck: 'w2_review',
        versuch: tatsaechlicheVersuche,
        modell: reviewResultat.modell,
        tokens_input: reviewResultat.tokenVerbrauch.input_tokens,
        tokens_output: reviewResultat.tokenVerbrauch.output_tokens,
      });
      reviewVerstoesse = reviewResultat.verstoesse;
    } else if (reviewResultat.tokenVerbrauch) {
      // Review-Pass selbst fehlgeschlagen (z. B. Timeout/Zod-Fehler): Draft
      // geht mit den Code-Check-Findings weiter, kein Blocker (analog zu W1s
      // "Kritiker-Pass fehlschlägt"-Fallback, WORKFLOW_HANDLERS_v1.0.md "W1").
      llmAufrufe.push({
        zweck: 'w2_review',
        versuch: tatsaechlicheVersuche,
        modell: reviewResultat.modell ?? DEFAULT_MODELL_W2_REVIEW,
        tokens_input: reviewResultat.tokenVerbrauch.input_tokens,
        tokens_output: reviewResultat.tokenVerbrauch.output_tokens,
      });
    }

    verstoesse = [...codeCheckVerstoesse, ...reviewVerstoesse];

    if (verstoesse.length === 0) break;
  }

  if (!commsPlanEntwurf) {
    // Strukturell unerreichbar: die Schleife gibt bei jedem Draft-Fehlschlag
    // sofort zurück (siehe oben), tatsächlich unerreichbar bleibt es nur,
    // wenn maxVersuche <= 0 wäre. Bewusst als definiertes Fehlschlags-
    // Resultat statt stillem Fallback.
    return { status: 'fehlgeschlagen', fehler: 'Kein Comms-Plan-Entwurf erzeugt.', llmAufrufe };
  }

  // Fallback-Hinweise aus Stage 1 (fehlende Quellen) werden erst NACH dem
  // 19-Punkte-Check angehängt: es sind deterministisch injizierte
  // Verwaltungs-Hinweise, keine vom Modell zu verantwortende Aussage, eine
  // erneute Prüfung/ein Retry deswegen wäre unnötig (siehe Decision, "Wo die
  // Fallback-Hinweise landen").
  const commsPlan = {
    ...commsPlanEntwurf,
    key_messages: [] as string[],
    open_questions: [...commsPlanEntwurf.open_questions, ...kontext.warnHinweise],
  };

  const exportVorbereitung = formatiereFuerExport(input, commsPlan);
  const tokenSumme = summiereTokens(llmAufrufe);

  const output = W2OutputSchema.parse({
    comms_plan: commsPlan,
    export_vorbereitung: exportVorbereitung,
    benoetigt_menschliche_freigabe: true,
    freigabe_grund: W2_FREIGABE_GRUND,
    pruefung: {
      verstoesse,
      versuche: tatsaechlicheVersuche,
      alle_regeln_bestanden: verstoesse.length === 0,
    },
    audit_metadaten: {
      verwendete_quellen: verwendeteQuellenAusKontext(kontext),
      modell: draftModell,
      dauer_ms: Date.now() - gestartetMs,
      tokens_input: tokenSumme.input,
      tokens_output: tokenSumme.output,
    },
  });

  return { status: 'erfolg', output, llmAufrufe };
}
