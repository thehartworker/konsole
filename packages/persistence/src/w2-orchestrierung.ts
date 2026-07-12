// Orchestriert W2 (Presseanfragen-Drafter) mit der Persistenz-Schicht: ruft
// packages/handlers/src/w2 auf (reine Business-Logik, kein Supabase-Wissen,
// siehe docs/decisions/2026-07-12_w2-presseanfragen-drafter.md "Zu 2") und
// schreibt danach für JEDEN tatsächlichen LLM-Aufruf (Draft-Versuch(e) plus
// Review-Pass(es)) eine eigene llm_nutzung-Zeile mit
// handler_slug = "W2_presseanfragen_drafter" -- granularer als bei der
// Klassifikation (dort ein Aufruf), weil W2 laut Spec bis zu 3 Retries plus
// Review-Aufrufe macht und jeder Aufruf einzeln abgerechnet wird.
//
// W2Input trägt (anders als EingehendeNachricht in Teil 1) keine kunde_id/
// vorgang_id (UUID) -- nur kunde_kontext.kunde_slug. Diese Funktion bekommt
// beide deshalb als zusätzliche Parameter (siehe Decision, "Zu 2").

import { presseanfragenDrafter } from '@konsole/handlers/w2';
import type { W2Deps, W2HandlerResultat, W2Input } from '@konsole/handlers/w2';
import type { KlassifikationsRepository } from './types.js';

export const LLM_NUTZUNG_HANDLER_SLUG_W2 = 'W2_presseanfragen_drafter';

export interface FuehreW2AusUndErfasseNutzungEingabe {
  input: W2Input;
  kundeId: string;
  vorgangId: string | null;
  deps: W2Deps;
  repo: Pick<KlassifikationsRepository, 'kundeLaden' | 'llmNutzungSchreiben'>;
}

export async function fuehreW2AusUndErfasseNutzung(
  eingabe: FuehreW2AusUndErfasseNutzungEingabe,
): Promise<W2HandlerResultat> {
  const { input, kundeId, vorgangId, deps, repo } = eingabe;

  const kunde = await repo.kundeLaden(kundeId);
  if (!kunde) {
    throw new Error(`fuehreW2AusUndErfasseNutzung: kunde ${kundeId} existiert nicht oder ist gelöscht.`);
  }

  const resultat = await presseanfragenDrafter(input, deps);

  // Jeder LLM-Aufruf wurde bereits abgerechnet, unabhängig davon, ob der
  // Handler-Lauf am Ende erfolgreich war oder scheiterte (gleiche Logik wie
  // Aufgabe B in orchestrierung.ts: "der Provider hat die Antwort bereits
  // geliefert und abgerechnet").
  for (const aufruf of resultat.llmAufrufe) {
    await repo.llmNutzungSchreiben({
      agentur_id: kunde.agentur_id,
      kunde_id: kundeId,
      vorgang_id: vorgangId,
      handler_slug: LLM_NUTZUNG_HANDLER_SLUG_W2,
      input_tokens: aufruf.tokens_input,
      output_tokens: aufruf.tokens_output,
      modell: aufruf.modell,
    });
  }

  return resultat;
}
