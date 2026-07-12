import type { KlassifikationsErgebnis } from '@konsole/classifier';
import type { EingehendeNachricht, KlassifikationsKontext } from '@konsole/classifier';
import type { FakeNutzerEintrag } from '../src/testing/index.js';
import type { KundeStammdaten } from '../src/types.js';

export const AGENTUR_A_ID = 'a0000000-0000-0000-0000-000000000001';
export const KUNDE_A1_ID = 'a0000000-0000-0000-0000-000000000011';
export const VORGANG_ID = 'a0000000-0000-0000-0000-000000001001';

export const KUNDE_A1_STUFE1: KundeStammdaten = {
  id: KUNDE_A1_ID,
  agentur_id: AGENTUR_A_ID,
  autonomie_level: 1,
};

export const KUNDE_A1_STUFE2: KundeStammdaten = {
  id: KUNDE_A1_ID,
  agentur_id: AGENTUR_A_ID,
  autonomie_level: 2,
};

export const NUTZER_JULIA: FakeNutzerEintrag = {
  id: 'a0000000-0000-0000-0000-000000000103',
  name: 'Julia Schmidt',
  agentur_id: AGENTUR_A_ID,
};

export const NACHRICHT_BAECKEREI: EingehendeNachricht = {
  vorgang_id: VORGANG_ID,
  agentur_id: AGENTUR_A_ID,
  kunde_id: KUNDE_A1_ID,
  kanal: 'email',
  absender: {
    identifikator: 'sabine@baeckerei-hoffmann.example',
    aufgeloester_name: 'Sabine Kramer',
    aufgeloeste_rolle: 'Marketing-Leitung',
  },
  eingang_at: '2026-07-09T21:14:32.000Z',
  betreff: 'Website-Text und Presseanfrage',
  inhalt_text: 'Zwei Sachen: Website-Text bis Freitag, und die Süddeutsche hat sich gemeldet.',
  anhaenge: [],
  metadaten_kanalspezifisch: {},
};

export const KONTEXT_BAECKEREI: KlassifikationsKontext = {
  kunde_slug: 'baeckerei-hoffmann',
};

export const ERGEBNIS_ZWEI_ANLIEGEN: KlassifikationsErgebnis = {
  vorgang_id: VORGANG_ID,
  sprache_eingang: 'de',
  sprache_ausgang: 'de',
  typ_primaer: 'Anfrage',
  typ_sekundaer: 'Presseanfrage',
  confidence: 78,
  sensitivity: 'normal',
  verstandener_inhalt: 'Website-Text und Presseanfrage.',
  transkript_qualitaet: null,
  kunde_slug: 'baeckerei-hoffmann',
  prioritaet: 'hoch',
  anliegen: [
    {
      anliegen_id: `${VORGANG_ID}-01`,
      beschreibung: 'Website-Text für die Sauerteig-Linie',
      prioritaet: 'mittel',
      frist_erschlossen: '2026-07-12',
      frist_annahme: '"bis Freitag" bezogen auf laufende Woche',
      backend_handler_vorschlag: 'W1_pressemitteilung_drafter',
      backend_handler_input: { briefing_stichworte: ['Sauerteig-Linie'] },
    },
    {
      anliegen_id: `${VORGANG_ID}-02`,
      beschreibung: 'Presseanfrage Süddeutsche Zeitung',
      prioritaet: 'hoch',
      frist_erschlossen: null,
      frist_annahme: null,
      backend_handler_vorschlag: 'W2_presseanfragen_drafter',
      backend_handler_input: { medium_name: 'Süddeutsche Zeitung' },
    },
  ],
  felder: {
    absender_name: 'Sabine Kramer',
    absender_rolle: 'Marketing-Leitung',
    erwaehnte_personen: ['Julia'],
  },
  erschlossen: [],
  annahmen: ['Freitag ist der 12. Juli 2026'],
  missing_mandatory: [],
  rueckfragen: [],
  rueckfrage_nachricht: null,
  antwort_nachricht: 'Hallo Sabine, danke für deine Nachricht. Wir melden uns dazu.',
  routing: {
    rolle: 'senior_beraterin',
    person_slug: 'julia_schmidt',
    verteiler: ['julia_schmidt'],
  },
  backend_calls_geplant: [
    { handler: 'W1_pressemitteilung_drafter', anliegen_id: `${VORGANG_ID}-01` },
    { handler: 'W2_presseanfragen_drafter', anliegen_id: `${VORGANG_ID}-02` },
  ],
  audit_summary: 'Vorgang klassifiziert, zwei Anliegen getrennt, an Julia Schmidt geroutet.',
  zusammenfassung: 'Website-Text bis Freitag plus Süddeutsche-Presseanfrage.',
};
