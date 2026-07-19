// Minimaler, schema-gültiger KlassifikationsErgebnis-Fixture für die
// End-to-End-Tests von verarbeiteNachricht (Issue #52, Aufgabe C). Struktur
// übernommen aus packages/classifier/tests/fixtures.ts (GUTER_OUTPUT),
// reduziert auf ein Anliegen. vorgang_id hier ist irrelevant für den
// Persistenz-Pfad (orchestrierung.ts nutzt die vorgang_id aus der
// EingehendeNachricht, nicht aus diesem Ergebnis-Objekt).

import type { KlassifikationsErgebnis } from '@konsole/classifier';

export const MAIL_KLASSIFIKATIONS_ERGEBNIS: KlassifikationsErgebnis = {
  vorgang_id: 'irrelevant-fuer-diesen-test',
  sprache_eingang: 'de',
  sprache_ausgang: 'de',
  typ_primaer: 'Anfrage',
  typ_sekundaer: 'Presseanfrage',
  confidence: 80,
  sensitivity: 'normal',
  verstandener_inhalt: 'Presseanfrage per E-Mail.',
  transkript_qualitaet: 'n/a',
  kunde_slug: 'kunde-a1-test',
  prioritaet: 'mittel',
  anliegen: [
    {
      anliegen_id: 'anliegen-mail-01',
      beschreibung: 'Presseanfrage per E-Mail',
      prioritaet: 'mittel',
      frist_erschlossen: null,
      frist_annahme: null,
      backend_handler_vorschlag: 'W2_presseanfragen_drafter',
      backend_handler_input: {
        medium_name: null,
        journalist_name: null,
        thema_beschreibung: 'Presseanfrage per E-Mail',
        sprecher_vorgeschlagen: null,
        sprecher_rolle: null,
      },
    },
  ],
  felder: { absender_name: null, absender_rolle: null, erwaehnte_personen: [] },
  erschlossen: [],
  annahmen: [],
  missing_mandatory: [],
  rueckfragen: [],
  rueckfrage_nachricht: null,
  antwort_nachricht: 'Vielen Dank für Ihre Nachricht, wir melden uns zeitnah.',
  routing: { rolle: 'senior_beraterin', person_slug: 'julia_schmidt', verteiler: ['julia_schmidt'] },
  backend_calls_geplant: [{ handler: 'W2_presseanfragen_drafter', anliegen_id: 'anliegen-mail-01' }],
  audit_summary: 'Vorgang klassifiziert, ein Anliegen, an Julia Schmidt geroutet.',
  zusammenfassung: 'Presseanfrage per E-Mail.',
};
