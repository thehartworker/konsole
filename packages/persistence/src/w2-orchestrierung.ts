// Orchestriert einen W2-Handler-Lauf: lädt aktive pruefregeln für
// (kunde_id, W2_HANDLER_SLUG), lädt kunde_kontext aus dem Kundenprofil statt
// aus dem Aufrufer-Input (Issue #35, siehe docs/decisions/2026-07-12_kundenprofil.md,
// Abschnitt "Handler-Anbindung"), ruft @konsole/handlers/w2 auf, schreibt PRO
// TATSÄCHLICHEM LLM-Aufruf (jeder Draft-Versuch, jeder Review-Pass) eine
// eigene llm_nutzung-Zeile (Issue #32), auch wenn der Handler-Lauf am Ende
// scheitert -- gleiche Begründung wie orchestrierung.ts für die
// Klassifikation: der Call wurde bereits abgerechnet, bevor der Zod-Fehler
// oder Draft-Fehlschlag erkannt wurde.

import { fuehreW2Aus, W2_HANDLER_SLUG } from '@konsole/handlers';
import type { W2AnfrageInput, W2HandlerOptionen, W2Input, W2KontextQuellenProvider, W2Output } from '@konsole/handlers';
import type { LLMProvider } from '@konsole/llm';
import type { KlassifikationsRepository } from './types.js';
import type { PruefregelnRepository } from './pruefregeln.js';
import type { KundenProfilRepository } from './kundenprofil.js';

export interface FuehreW2AusEingabe {
  kundeId: string;
  vorgangId: string | null;
  anfrage: W2AnfrageInput;
  provider: LLMProvider;
  repo: KlassifikationsRepository;
  pruefregelnRepo: PruefregelnRepository;
  kundenProfilRepo: KundenProfilRepository;
  /** Override für Tests, sonst wird kundenProfilRepo.w2KontextQuellenProviderErstellen() verwendet. */
  kontextProvider?: W2KontextQuellenProvider;
  optionen?: W2HandlerOptionen;
}

export type FuehreW2AusResultat =
  | { status: 'erfolg'; output: W2Output }
  | { status: 'fehlgeschlagen'; fehler: string };

export async function fuehreW2AusUndProtokolliere(
  eingabe: FuehreW2AusEingabe,
): Promise<FuehreW2AusResultat> {
  const { kundeId, vorgangId, anfrage, provider, repo, pruefregelnRepo, kundenProfilRepo, kontextProvider, optionen } = eingabe;

  const kunde = await repo.kundeLaden(kundeId);
  if (!kunde) {
    throw new Error(`fuehreW2AusUndProtokolliere: kunde ${kundeId} existiert nicht oder ist gelöscht.`);
  }

  const [regeln, deterministischeGrenzen, kunde_kontext] = await Promise.all([
    pruefregelnRepo.aktivePruefregelnLaden(kundeId, W2_HANDLER_SLUG),
    kundenProfilRepo.deterministischeGrenzenAlsPruefregeln(kundeId, W2_HANDLER_SLUG),
    kundenProfilRepo.w2KontextLaden(kundeId),
  ]);

  const input: W2Input = { anfrage, kunde_kontext };
  const alleRegeln = [...regeln, ...deterministischeGrenzen];
  const kontextQuellenProvider = kontextProvider ?? kundenProfilRepo.w2KontextQuellenProviderErstellen(kundeId);

  const resultat = await fuehreW2Aus(input, alleRegeln, provider, optionen, kontextQuellenProvider);

  for (const aufruf of resultat.llmAufrufe) {
    await repo.llmNutzungSchreiben({
      agentur_id: kunde.agentur_id,
      kunde_id: kundeId,
      vorgang_id: vorgangId,
      handler_slug: W2_HANDLER_SLUG,
      input_tokens: aufruf.tokenVerbrauch.input_tokens,
      output_tokens: aufruf.tokenVerbrauch.output_tokens,
      modell: aufruf.modell,
    });
  }

  if (resultat.status === 'fehlgeschlagen') {
    return { status: 'fehlgeschlagen', fehler: resultat.fehler };
  }

  return { status: 'erfolg', output: resultat.output };
}
