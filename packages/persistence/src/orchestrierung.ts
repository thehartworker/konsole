// Orchestriert den vollständigen Teil-2-Ablauf: klassifikation_status
// queued -> in_progress -> done/failed, LLM-Aufruf über packages/classifier,
// llm_nutzung-Zeile für JEDEN LLM-Call (Aufgabe B, auch bei Zod-/JSON-
// Fehlschlägen, siehe packages/classifier/src/classify.ts), Persistenz bei
// Erfolg über persistiere-klassifikation.ts.
//
// Voraussetzung: die vorgaenge-Zeile mit den rohen Ingest-Feldern (kanal,
// absender, inhalt_text, ...) existiert bereits mit klassifikation_status =
// 'queued' (Picking-Query, §12.1 aus docs/decisions/2026-07-10_datenmodell.md).
// Das Anlegen dieser Zeile beim Nachrichten-Empfang ist Ingest-Scope, nicht
// Teil dieses Pakets (siehe "Grenze Klassifikation/Handler-Auslösung" in
// docs/decisions/2026-07-12_klassifikations-layer.md).

import { klassifiziereNachricht } from '@konsole/classifier';
import type { EingehendeNachricht, KlassifikationsKontext, KlassifikationsOptionen } from '@konsole/classifier';
import type { LLMProvider } from '@konsole/llm';
import { persistiereErfolgreicheKlassifikation } from './persistiere-klassifikation.js';
import type { KlassifikationsRepository, PersistiereKlassifikationResultat } from './types.js';

const LLM_NUTZUNG_HANDLER_SLUG_KLASSIFIKATION = 'klassifikation';

export interface KlassifiziereUndPersistiereEingabe {
  nachricht: EingehendeNachricht;
  kontext: KlassifikationsKontext;
  provider: LLMProvider;
  repo: KlassifikationsRepository;
  optionen?: KlassifikationsOptionen;
}

export async function klassifiziereUndPersistiere(
  eingabe: KlassifiziereUndPersistiereEingabe,
): Promise<PersistiereKlassifikationResultat> {
  const { nachricht, kontext, provider, repo, optionen } = eingabe;
  const vorgangId = nachricht.vorgang_id;
  const kundeId = nachricht.kunde_id;

  const kunde = await repo.kundeLaden(kundeId);
  if (!kunde) {
    throw new Error(`klassifiziereUndPersistiere: kunde ${kundeId} existiert nicht oder ist gelöscht.`);
  }

  await repo.vorgangStatusSetzen(vorgangId, 'in_progress', {
    klassifikation_gestartet_at: new Date().toISOString(),
  });

  const resultat = await klassifiziereNachricht(nachricht, kontext, provider, optionen);

  // Aufgabe B: JEDER LLM-Call bekommt eine llm_nutzung-Zeile, auch wenn die
  // Klassifikation danach an Zod oder am JSON-Parsing scheitert -- der
  // Provider hat die Antwort bereits geliefert und abgerechnet (siehe
  // packages/classifier/src/classify.ts, tokenVerbrauch ist dort nur bei
  // einem reinen Aufruf-Fehler ohne Response undefined).
  if (resultat.tokenVerbrauch) {
    await repo.llmNutzungSchreiben({
      agentur_id: kunde.agentur_id,
      kunde_id: kundeId,
      vorgang_id: vorgangId,
      handler_slug: LLM_NUTZUNG_HANDLER_SLUG_KLASSIFIKATION,
      input_tokens: resultat.tokenVerbrauch.input_tokens,
      output_tokens: resultat.tokenVerbrauch.output_tokens,
      modell: resultat.modell ?? optionen?.model ?? 'unbekannt',
    });
  }

  if (resultat.status === 'fehlgeschlagen') {
    await repo.vorgangStatusSetzen(vorgangId, 'failed', {
      klassifikation_beendet_at: new Date().toISOString(),
    });
    return { status: 'failed', vorgangId, fehler: resultat.fehler };
  }

  return persistiereErfolgreicheKlassifikation({ vorgangId, kundeId, ergebnis: resultat.ergebnis }, repo);
}
