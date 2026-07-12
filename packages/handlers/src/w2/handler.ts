// W2-Handler-Orchestrierung: Stage 1 (Kontext) -> Stage 2 (Draft) -> Stage 3
// (Regel-Engine, mit Retry-Schleife über einen korrigierenden Prompt) ->
// Stage 4 (Export) -> Zod-validierter W2Output. Shadow-Mode strukturell
// erzwungen (siehe docs/decisions/2026-07-12_w2-presseanfragen-drafter.md,
// "Shadow-Mode-Durchsetzung"): diese Funktion ruft ausschließlich
// LLMProvider.strukturierteCompletion() auf, kein Versand- oder
// Handler-Trigger-Code-Pfad existiert.
//
// Retry-Interpretation ("max. 3 Retries"): 3 Versuche INSGESAMT, siehe
// Design-Decision, Abschnitt "Retry-Interpretation".

import type { LLMProvider, TokenVerbrauch } from '@konsole/llm';
import { erzeugeCommsPlanDraft, type CommsPlanDraftOptionen } from './draft.js';
import { sammleKontext } from './kontext.js';
import { formatiereExport } from './export.js';
import { fuehreRegelEngineAus, type PruefungLlmOptionen } from './regel-engine/pruefung.js';
import type { PruefungsErgebnis, Pruefregel } from './regel-engine/types.js';
import { W2OutputSchema, type CommsPlanDraft, type W2Output } from './schema.js';
import type { W2GesammelterKontext, W2Input, W2KontextQuellenProvider } from './types.js';

const MAX_VERSUCHE_DEFAULT = 3;
const FREIGABE_GRUND = 'Standard: jeder Comms Plan muss vor Kunden-Weiterleitung Beraterin-freigegeben werden.';

export interface W2HandlerOptionen {
  maxVersuche?: number;
  draftOptionen?: CommsPlanDraftOptionen;
  reviewOptionen?: PruefungLlmOptionen;
}

export interface W2LlmAufruf {
  zweck: 'draft' | 'review';
  versuch: number;
  tokenVerbrauch: TokenVerbrauch;
  modell: string;
}

export type W2HandlerResultat =
  | { status: 'erfolg'; output: W2Output; llmAufrufe: W2LlmAufruf[] }
  | { status: 'fehlgeschlagen'; fehler: string; llmAufrufe: W2LlmAufruf[] };

function formatiereKorrekturHinweis(ergebnis: PruefungsErgebnis): string {
  return ergebnis.verstoesse
    .map((v) => `- [${v.quelle}${v.baustein_name ? `:${v.baustein_name}` : ''}] ${v.begruendung}`)
    .join('\n');
}

function quellenListe(kontext: W2GesammelterKontext): string[] {
  return [kontext.sprachregelungen, kontext.ssot, kontext.externes_wissen, kontext.praezedenzen, kontext.journalisten_profil]
    .filter((quelle) => quelle.verfuegbar)
    .map((quelle) => quelle.name);
}

export async function fuehreW2Aus(
  input: W2Input,
  regeln: Pruefregel[],
  provider: LLMProvider,
  optionen: W2HandlerOptionen = {},
  kontextProvider?: W2KontextQuellenProvider,
): Promise<W2HandlerResultat> {
  const maxVersuche = optionen.maxVersuche ?? MAX_VERSUCHE_DEFAULT;
  const gesammelterKontext = await sammleKontext(input, kontextProvider);
  const llmAufrufe: W2LlmAufruf[] = [];

  const bausteinKontext = {
    sprachregelungVorhanden: gesammelterKontext.sprachregelungen.verfuegbar,
    fristAt: input.anfrage.frist_at,
  };

  let draft: CommsPlanDraft | null = null;
  let letzterDraftFehler: string | null = null;
  let korrekturHinweis: string | undefined;
  let pruefungsErgebnis: PruefungsErgebnis = { bestanden: false, verstoesse: [] };
  let versuche = 0;

  for (let versuch = 1; versuch <= maxVersuche; versuch += 1) {
    versuche = versuch;

    const draftResultat = await erzeugeCommsPlanDraft(
      input,
      gesammelterKontext,
      provider,
      optionen.draftOptionen,
      korrekturHinweis,
    );

    if (draftResultat.tokenVerbrauch) {
      llmAufrufe.push({
        zweck: 'draft',
        versuch,
        tokenVerbrauch: draftResultat.tokenVerbrauch,
        modell: draftResultat.modell ?? 'unbekannt',
      });
    }

    if (draftResultat.status === 'fehlgeschlagen') {
      letzterDraftFehler = draftResultat.fehler;
      draft = null;
      continue;
    }

    draft = draftResultat.draft;

    const reviewResultat = await fuehreRegelEngineAus(
      draft,
      regeln,
      bausteinKontext,
      provider,
      optionen.reviewOptionen,
    );

    if (reviewResultat.tokenVerbrauch && reviewResultat.modell) {
      llmAufrufe.push({
        zweck: 'review',
        versuch,
        tokenVerbrauch: reviewResultat.tokenVerbrauch,
        modell: reviewResultat.modell,
      });
    }

    pruefungsErgebnis = reviewResultat.ergebnis;

    if (pruefungsErgebnis.bestanden) {
      break;
    }

    korrekturHinweis = formatiereKorrekturHinweis(pruefungsErgebnis);
  }

  if (!draft) {
    return {
      status: 'fehlgeschlagen',
      fehler: letzterDraftFehler ?? 'Comms-Plan-Draft konnte in keinem Versuch erzeugt werden.',
      llmAufrufe,
    };
  }

  // Fallback (WORKFLOW_HANDLERS_v1.0.md "W2"): nach ausgeschöpften Versuchen
  // geht der letzte Draft MIT den offenen Findings raus, die Beraterin zieht
  // manuell nach -- kein Fehlschlag des gesamten Handler-Laufs.
  const exportVorbereitung = formatiereExport(input, draft);

  const outputEntwurf = {
    comms_plan: draft,
    export_vorbereitung: exportVorbereitung,
    benoetigt_menschliche_freigabe: true as const,
    freigabe_grund: FREIGABE_GRUND,
    pruefung: {
      bestanden: pruefungsErgebnis.bestanden,
      versuche,
      verstoesse: pruefungsErgebnis.verstoesse,
    },
    hinweise: gesammelterKontext.hinweise,
    audit_metadaten: {
      verwendete_quellen: quellenListe(gesammelterKontext),
      modell: llmAufrufe.at(-1)?.modell ?? 'unbekannt',
      tokens_input: llmAufrufe.reduce((summe, aufruf) => summe + aufruf.tokenVerbrauch.input_tokens, 0),
      tokens_output: llmAufrufe.reduce((summe, aufruf) => summe + aufruf.tokenVerbrauch.output_tokens, 0),
    },
  };

  const geparst = W2OutputSchema.safeParse(outputEntwurf);
  if (!geparst.success) {
    const details = geparst.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    return {
      status: 'fehlgeschlagen',
      fehler: `Zod-Validierung des W2Output fehlgeschlagen: ${details}`,
      llmAufrufe,
    };
  }

  return { status: 'erfolg', output: geparst.data, llmAufrufe };
}
