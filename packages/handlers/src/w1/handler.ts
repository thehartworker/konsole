// W1-Handler-Orchestrierung: Stage 1 (Kontext) -> Stage 2 (Draft) ->
// Zitat-Freigabe-Erzwingung -> Stage 3 (Kritiker) -> deterministische
// Grenz-Prüfung -> Zod-validierter W1Output. Kein Retry-Loop, anders als
// W2 (siehe docs/decisions/2026-07-13_w1-pressemitteilung-drafter.md,
// Abschnitt 3: "der Kritiker findet und meldet, der Mensch entscheidet").
// Shadow-Mode strukturell erzwungen: diese Funktion ruft ausschließlich
// LLMProvider.strukturierteCompletion() auf, kein Versand- oder
// Handler-Trigger-Code-Pfad existiert.

import type { LLMProvider, TokenVerbrauch } from '@konsole/llm';
import { erzeugePressemitteilungDraft, type PressemitteilungDraftOptionen } from './draft.js';
import { pruefeDeterministischeGrenzen } from './grenzen.js';
import { sammleKontext } from './kontext.js';
import { erzeugeKritikerBefund, type KritikerOptionen } from './kritiker.js';
import { W1OutputSchema, type PressemitteilungDraft, type W1Output } from './schema.js';
import type { W1GesammelterKontext, W1Input, W1KontextQuellenProvider } from './types.js';
import type { Pruefregel } from '../w2/regel-engine/types.js';

export const W1_HANDLER_SLUG = 'W1_pressemitteilung_drafter';

const FREIGABE_GRUND = 'Standard: jede Pressemitteilung muss vor Versand redaktionell freigegeben werden.';

const VORSCHLAEGE_FUER_NAECHSTE_SCHRITTE = [
  'Freigabe durch Beraterin',
  'Kunde-Freigabe einholen',
  'Sperrfrist prüfen',
  'Versandliste konfigurieren',
];

export interface W1HandlerOptionen {
  draftOptionen?: PressemitteilungDraftOptionen;
  kritikerOptionen?: KritikerOptionen;
}

export interface W1LlmAufruf {
  zweck: 'draft' | 'kritiker';
  tokenVerbrauch: TokenVerbrauch;
  modell: string;
}

export type W1HandlerResultat =
  | { status: 'erfolg'; output: W1Output; llmAufrufe: W1LlmAufruf[] }
  | { status: 'fehlgeschlagen'; fehler: string; llmAufrufe: W1LlmAufruf[] };

function quellenListe(kontext: W1GesammelterKontext): string[] {
  return [kontext.tonalitaet, kontext.boilerplate, kontext.praezedenzen, kontext.sprecher, kontext.sektor_corpus, kontext.diskurs_snapshot]
    .filter((quelle) => quelle.verfuegbar)
    .map((quelle) => quelle.name);
}

/**
 * Zitat-Freigabe-Erzwingung (Code-Ebene, Sicherheitsnetz hinter der
 * Prompt-Anweisung): ist ein Zitat generiert, obwohl Stage 1 keinen
 * freigegebenen Sprecher geliefert hat, wird das Zitat deterministisch
 * entfernt statt dem LLM-Prompt-Gehorsam vertraut. Siehe Decision,
 * Abschnitt 5.
 */
function erzwingeZitatFreigabe(
  draft: PressemitteilungDraft,
  kontext: W1GesammelterKontext,
): { draft: PressemitteilungDraft; hinweis: string | null } {
  if (draft.zitat === null || kontext.sprecher.verfuegbar) {
    return { draft, hinweis: null };
  }
  return {
    draft: { ...draft, zitat: null },
    hinweis: 'Zitat entfernt: Sprecher-Freigabe fehlt oder Sprecher nicht im Kundenprofil gefunden.',
  };
}

export async function fuehreW1Aus(
  input: W1Input,
  deterministischeGrenzen: Pruefregel[],
  provider: LLMProvider,
  optionen: W1HandlerOptionen = {},
  kontextProvider?: W1KontextQuellenProvider,
): Promise<W1HandlerResultat> {
  const start = Date.now();
  const gesammelterKontext = await sammleKontext(input, kontextProvider);
  const llmAufrufe: W1LlmAufruf[] = [];
  const hinweise: string[] = [...gesammelterKontext.hinweise];

  const draftResultat = await erzeugePressemitteilungDraft(input, gesammelterKontext, provider, optionen.draftOptionen);

  if (draftResultat.tokenVerbrauch) {
    llmAufrufe.push({ zweck: 'draft', tokenVerbrauch: draftResultat.tokenVerbrauch, modell: draftResultat.modell ?? 'unbekannt' });
  }

  if (draftResultat.status === 'fehlgeschlagen') {
    return { status: 'fehlgeschlagen', fehler: draftResultat.fehler, llmAufrufe };
  }

  const { draft: zitatGeprueft, hinweis: zitatHinweis } = erzwingeZitatFreigabe(draftResultat.draft, gesammelterKontext);
  if (zitatHinweis) hinweise.push(zitatHinweis);

  let kritikerFindings: W1Output['kritiker_findings'] = [];
  const kritikerResultat = await erzeugeKritikerBefund(zitatGeprueft, provider, optionen.kritikerOptionen);

  if (kritikerResultat.tokenVerbrauch) {
    llmAufrufe.push({ zweck: 'kritiker', tokenVerbrauch: kritikerResultat.tokenVerbrauch, modell: kritikerResultat.modell ?? 'unbekannt' });
  }

  if (kritikerResultat.status === 'erfolg') {
    kritikerFindings = kritikerResultat.findings;
  } else {
    // Fallback (WORKFLOW_HANDLERS_v1.0.md "W1"): Kritiker-Pass-Ausfall
    // (z. B. LLM-Timeout) lässt den Gesamtlauf NICHT scheitern, der Draft
    // geht ohne kritiker_findings raus, mit Vermerk.
    hinweise.push(`Kritiker-Prüfung nicht möglich: ${kritikerResultat.fehler}`);
  }

  const grenzPruefungErgebnis = pruefeDeterministischeGrenzen(zitatGeprueft, deterministischeGrenzen);

  const ueberarbeitungsbeduerftig =
    kritikerFindings.some((finding) => finding.schweregrad === 'hoch') || !grenzPruefungErgebnis.bestanden;

  const outputEntwurf = {
    pressemitteilung: zitatGeprueft,
    kritiker_findings: kritikerFindings,
    grenz_pruefung_ergebnis: grenzPruefungErgebnis,
    ueberarbeitungsbeduerftig,
    benoetigt_menschliche_freigabe: true as const,
    freigabe_grund: FREIGABE_GRUND,
    vorschlaege_fuer_naechste_schritte: [...VORSCHLAEGE_FUER_NAECHSTE_SCHRITTE],
    hinweise,
    audit_metadaten: {
      verwendete_quellen: quellenListe(gesammelterKontext),
      modell: llmAufrufe.at(-1)?.modell ?? 'unbekannt',
      dauer_ms: Date.now() - start,
      tokens_input: llmAufrufe.reduce((summe, aufruf) => summe + aufruf.tokenVerbrauch.input_tokens, 0),
      tokens_output: llmAufrufe.reduce((summe, aufruf) => summe + aufruf.tokenVerbrauch.output_tokens, 0),
    },
  };

  const geparst = W1OutputSchema.safeParse(outputEntwurf);
  if (!geparst.success) {
    const details = geparst.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    return {
      status: 'fehlgeschlagen',
      fehler: `Zod-Validierung des W1Output fehlgeschlagen: ${details}`,
      llmAufrufe,
    };
  }

  return { status: 'erfolg', output: geparst.data, llmAufrufe };
}
