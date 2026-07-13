// Stage 1: Kontext-Sammlung. Vier-Quellen-Interface aus WORKFLOW_HANDLERS_v1.0.md
// "W1" (Kunden-SSOT, Sektor-Corpus, Client-Final-Präzedenzen, Diskurs-
// Snapshot), v1 mit dem umgesetzt, was tatsächlich angebunden ist -- siehe
// docs/decisions/2026-07-13_w1-pressemitteilung-drafter.md, Abschnitt 6.
// Kennt keine Datenbank -- W1KontextQuellenProvider ist injizierbar,
// LeererW1KontextQuellenProvider ist der v1-Default ohne produktiven
// Datenbestand.

import type {
  W1GesammelterKontext,
  W1Input,
  W1KontextQuellenProvider,
  W1PraezedenzEintrag,
  W1SprecherEintrag,
} from './types.js';

/** briefing.laenge_ziel kennt drei Stufen, kunden_boilerplate.typ nur zwei -- siehe Decision, Abschnitt 6. */
function boilerplateTypFuerLaenge(laengeZiel: W1Input['briefing']['laenge_ziel']): 'kurz' | 'lang' {
  return laengeZiel === 'kurz' ? 'kurz' : 'lang';
}

/** v1: keine Multi-Sprache (siehe Spec "v1-Umfang"), fest auf Deutsch. */
const V1_SPRACHE = 'de';

export class LeererW1KontextQuellenProvider implements W1KontextQuellenProvider {
  async praezedenzenLaden(): Promise<W1PraezedenzEintrag[]> {
    return [];
  }

  async boilerplateLaden(): Promise<string | null> {
    return null;
  }

  async sprecherLaden(): Promise<W1SprecherEintrag | null> {
    return null;
  }
}

export async function sammleKontext(
  input: W1Input,
  provider: W1KontextQuellenProvider = new LeererW1KontextQuellenProvider(),
): Promise<W1GesammelterKontext> {
  const hinweise: string[] = [];
  const { briefing, kunde_kontext } = input;

  const tonalitaetVorhanden = kunde_kontext.tonalitaet.grundton !== null;
  if (!tonalitaetVorhanden) {
    hinweise.push('Keine Tonalität im Kundenprofil hinterlegt, Draft nutzt einen neutralen Standard-Ton.');
  }

  const praezedenzen = await provider.praezedenzenLaden(kunde_kontext.kunde_slug, briefing.anlass);
  if (praezedenzen.length === 0) {
    hinweise.push('Kunden-Präzedenzen fehlen, Draft wird generischer, Empfehlung: Kunden-SSOT aufsetzen.');
  }

  const boilerplateTyp = boilerplateTypFuerLaenge(briefing.laenge_ziel);
  const boilerplate = await provider.boilerplateLaden(kunde_kontext.kunde_slug, boilerplateTyp, V1_SPRACHE);
  if (boilerplate === null) {
    hinweise.push(`Keine passende Boilerplate im Profil hinterlegt (Typ: ${boilerplateTyp}, Sprache: ${V1_SPRACHE}).`);
  }

  let sprecher: W1SprecherEintrag | null = null;
  if (briefing.zitat_sprecher) {
    const gefunden = await provider.sprecherLaden(kunde_kontext.kunde_slug, briefing.zitat_sprecher);
    if (!gefunden) {
      hinweise.push(`Sprecher "${briefing.zitat_sprecher}" nicht im Kundenprofil hinterlegt, kein Zitat im Draft.`);
    } else if (!gefunden.zitat_freigabe) {
      hinweise.push(`Zitat-Freigabe für Sprecher "${briefing.zitat_sprecher}" fehlt, kein Zitat im Draft.`);
    } else {
      sprecher = gefunden;
    }
  }

  return {
    tonalitaet: {
      name: 'tonalitaet',
      verfuegbar: tonalitaetVorhanden,
      daten: tonalitaetVorhanden ? kunde_kontext.tonalitaet : null,
    },
    praezedenzen: {
      name: 'praezedenzen',
      verfuegbar: praezedenzen.length > 0,
      daten: praezedenzen.length > 0 ? praezedenzen : null,
    },
    boilerplate: { name: 'boilerplate', verfuegbar: boilerplate !== null, daten: boilerplate },
    sprecher: { name: 'sprecher', verfuegbar: sprecher !== null, daten: sprecher },
    sektor_corpus: { name: 'sektor_corpus', verfuegbar: false, daten: null }, // v1-Stub
    diskurs_snapshot: { name: 'diskurs_snapshot', verfuegbar: false, daten: null }, // v1-Stub
    hinweise,
  };
}
