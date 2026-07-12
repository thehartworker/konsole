// Stage 1: Kontext-Sammlung. Fünf-Quellen-Interface aus WORKFLOW_HANDLERS_v1.0.md
// "W2", v1 mit dem umgesetzt, was tatsächlich angebunden ist (siehe
// docs/decisions/2026-07-12_w2-presseanfragen-drafter.md, "Zu 4"). Kennt keine
// Datenbank -- W2KontextQuellenProvider ist injizierbar, LeererW2KontextQuellenProvider
// ist der v1-Default ohne produktiven Datenbestand.

import type {
  W2GesammelterKontext,
  W2Input,
  W2KontextQuellenProvider,
  PraezedenzEintrag,
  SprachregelungsEintrag,
} from './types.js';

export class LeererW2KontextQuellenProvider implements W2KontextQuellenProvider {
  async sprachregelungenLaden(): Promise<SprachregelungsEintrag[]> {
    return [];
  }

  async praezedenzenLaden(): Promise<PraezedenzEintrag[]> {
    return [];
  }
}

export async function sammleKontext(
  input: W2Input,
  provider: W2KontextQuellenProvider = new LeererW2KontextQuellenProvider(),
): Promise<W2GesammelterKontext> {
  const hinweise: string[] = [];

  const sprachregelungen = await provider.sprachregelungenLaden(
    input.kunde_kontext.sprachregelungen_slug,
    input.anfrage.thema_beschreibung,
  );
  if (sprachregelungen.length === 0) {
    hinweise.push(
      'Keine Sprachregelungen hinterlegt: reactive_statement bleibt leer (Fallback laut WORKFLOW_HANDLERS_v1.0.md W2).',
    );
  }

  const praezedenzen = await provider.praezedenzenLaden(
    input.kunde_kontext.kunde_slug,
    input.anfrage.thema_beschreibung,
  );
  if (praezedenzen.length === 0) {
    hinweise.push('Keine Client-Final-Präzedenzen hinterlegt, Draft wird generischer. Onboarding empfohlen.');
  }

  return {
    sprachregelungen: {
      name: 'sprachregelungen',
      verfuegbar: sprachregelungen.length > 0,
      daten: sprachregelungen.length > 0 ? sprachregelungen : null,
    },
    ssot: { name: 'ssot', verfuegbar: false, daten: null }, // v1-Stub
    externes_wissen: {
      name: 'externes_wissen',
      verfuegbar: input.kunde_kontext.thema_positionierung !== null,
      daten: input.kunde_kontext.thema_positionierung,
    },
    praezedenzen: {
      name: 'praezedenzen',
      verfuegbar: praezedenzen.length > 0,
      daten: praezedenzen.length > 0 ? praezedenzen : null,
    },
    journalisten_profil: { name: 'journalisten_profil', verfuegbar: false, daten: null }, // v1-Stub
    hinweise,
  };
}
