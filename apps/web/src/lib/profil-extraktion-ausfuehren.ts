// Dünner, testbarer Wrapper um extrahiereProfilVorschlag (Issue #50,
// Aufgabe D). Macht den eigentlichen LLM-Call und protokolliert llm_nutzung
// (ein Eintrag PRO tatsächlichem Call, auch bei Fehlschlag -- gleiches
// Prinzip wie packages/persistence/src/profil-extraktion-orchestrierung.ts),
// gibt aber -- anders als die dortigen verarbeite*UndPersistiereProfil-
// Funktionen -- KEINE Persistenz der Vorschläge weiter. Die passiert erst
// bei "Übernehmen" pro einzelnem Vorschlag (actions.ts,
// uebernehmeVorschlagAction), siehe
// docs/decisions/2026-07-17_konsole-block3-profil-editor.md, Abschnitt 3.
//
// Bewusst als eigene, reine(re) Funktion statt direkt in actions.ts, damit
// sie ohne echten Supabase-Client testbar ist (FakeKlassifikationsRepository
// + Fake-LLM-Provider), gleiches Muster wie src/lib/pressemitteilung-bearbeiten.ts.

import type { LLMProvider } from "@konsole/llm";
import type { KlassifikationsRepository } from "@konsole/persistence";
import {
  extrahiereProfilVorschlag,
  type ProfilExtraktionsOptionen,
  type ProfilExtraktionsQuelle,
  type ProfilExtraktionsVorschlag,
} from "@konsole/profil-extraktion";

const LLM_NUTZUNG_HANDLER_SLUG_PROFIL_EXTRAKTION = "profil_extraktion";

export type ProfilExtraktionAusfuehrenResultat =
  | { status: "erfolg"; vorschlag: ProfilExtraktionsVorschlag; verworfeneKennzahlen: number }
  | { status: "fehler"; meldung: string };

export interface ProfilExtraktionAusfuehrenEingabe {
  kundeId: string;
  quelle: ProfilExtraktionsQuelle;
  text: string;
  bezeichnung: string;
  provider: LLMProvider;
  repo: KlassifikationsRepository;
  optionen?: ProfilExtraktionsOptionen;
}

export async function fuehreProfilExtraktionAus(
  eingabe: ProfilExtraktionAusfuehrenEingabe,
): Promise<ProfilExtraktionAusfuehrenResultat> {
  const { kundeId, quelle, text, bezeichnung, provider, repo, optionen } = eingabe;

  const kunde = await repo.kundeLaden(kundeId);
  if (!kunde) {
    return { status: "fehler", meldung: "Kunde nicht gefunden oder keine Berechtigung." };
  }

  let resultat;
  try {
    resultat = await extrahiereProfilVorschlag(text, quelle, bezeichnung, provider, optionen);
  } catch (fehler) {
    return { status: "fehler", meldung: fehler instanceof Error ? fehler.message : String(fehler) };
  }

  if (resultat.tokenVerbrauch) {
    await repo.llmNutzungSchreiben({
      agentur_id: kunde.agentur_id,
      kunde_id: kundeId,
      vorgang_id: null,
      handler_slug: LLM_NUTZUNG_HANDLER_SLUG_PROFIL_EXTRAKTION,
      input_tokens: resultat.tokenVerbrauch.input_tokens,
      output_tokens: resultat.tokenVerbrauch.output_tokens,
      modell: resultat.modell ?? optionen?.model ?? "unbekannt",
    });
  }

  if (resultat.status === "fehlgeschlagen") {
    return { status: "fehler", meldung: resultat.fehler };
  }

  return { status: "erfolg", vorschlag: resultat.vorschlag, verworfeneKennzahlen: resultat.verworfeneKennzahlen };
}
