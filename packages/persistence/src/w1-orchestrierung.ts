// Orchestriert einen W1-Handler-Lauf: lädt die deterministisch erzwungenen
// kunden_grenzen für (kunde_id, W1_HANDLER_SLUG) sowie kunde_kontext aus dem
// Kundenprofil statt aus dem Aufrufer-Input (analog w2-orchestrierung.ts),
// ruft @konsole/handlers/w1 auf, schreibt PRO TATSÄCHLICHEM LLM-Aufruf
// (Drafter-Pass, Kritiker-Pass) eine eigene llm_nutzung-Zeile, auch wenn der
// Handler-Lauf am Ende scheitert -- gleiche Begründung wie
// w2-orchestrierung.ts: der Call wurde bereits abgerechnet, bevor ein
// Zod-Fehler oder Draft-Fehlschlag erkannt wurde. Siehe
// docs/decisions/2026-07-13_w1-pressemitteilung-drafter.md.

import { fuehreW1Aus, W1_HANDLER_SLUG } from '@konsole/handlers';
import type { W1BriefingInput, W1HandlerOptionen, W1Input, W1KontextQuellenProvider, W1Output } from '@konsole/handlers';
import type { LLMProvider } from '@konsole/llm';
import type { KlassifikationsRepository } from './types.js';
import type { KundenProfilRepository } from './kundenprofil.js';

export interface FuehreW1AusEingabe {
  kundeId: string;
  vorgangId: string | null;
  briefing: W1BriefingInput;
  provider: LLMProvider;
  repo: KlassifikationsRepository;
  kundenProfilRepo: KundenProfilRepository;
  /** Override für Tests, sonst wird kundenProfilRepo.w1KontextQuellenProviderErstellen() verwendet. */
  kontextProvider?: W1KontextQuellenProvider;
  optionen?: W1HandlerOptionen;
}

export type FuehreW1AusResultat =
  | { status: 'erfolg'; output: W1Output }
  | { status: 'fehlgeschlagen'; fehler: string };

export async function fuehreW1AusUndProtokolliere(
  eingabe: FuehreW1AusEingabe,
): Promise<FuehreW1AusResultat> {
  const { kundeId, vorgangId, briefing, provider, repo, kundenProfilRepo, kontextProvider, optionen } = eingabe;

  const kunde = await repo.kundeLaden(kundeId);
  if (!kunde) {
    throw new Error(`fuehreW1AusUndProtokolliere: kunde ${kundeId} existiert nicht oder ist gelöscht.`);
  }

  const [deterministischeGrenzen, kunde_kontext] = await Promise.all([
    kundenProfilRepo.deterministischeGrenzenAlsPruefregeln(kundeId, W1_HANDLER_SLUG),
    kundenProfilRepo.w1KontextLaden(kundeId),
  ]);

  const input: W1Input = { briefing, kunde_kontext };
  const kontextQuellenProvider = kontextProvider ?? kundenProfilRepo.w1KontextQuellenProviderErstellen(kundeId);

  const resultat = await fuehreW1Aus(input, deterministischeGrenzen, provider, optionen, kontextQuellenProvider);

  for (const aufruf of resultat.llmAufrufe) {
    await repo.llmNutzungSchreiben({
      agentur_id: kunde.agentur_id,
      kunde_id: kundeId,
      vorgang_id: vorgangId,
      handler_slug: W1_HANDLER_SLUG,
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
