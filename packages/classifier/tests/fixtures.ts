// Test-Fixtures: der Positiv-Beispiel-Output aus SAAS_SPEC_v1.0_CONSOLE.md
// §3.4 und die zugehörige Nachricht aus §2.5, sowie das Negativ-Beispiel aus §7.4.

import type { KlassifikationsErgebnis } from '../src/schema.js';
import type { EingehendeNachricht, KlassifikationsKontext } from '../src/types.js';

export const NACHRICHT_BAECKEREI: EingehendeNachricht = {
  vorgang_id: '01H8Z9K2M3N4P5Q6R7S8T9U0V1',
  agentur_id: 'a0000000-0000-0000-0000-000000000001',
  kunde_id: 'k0000000-0000-0000-0000-000000000001',
  kanal: 'whatsapp_audio',
  absender: {
    identifikator: '+491725553124',
    aufgeloester_name: 'Sabine Kramer',
    aufgeloeste_rolle: 'Marketing-Leitung',
  },
  eingang_at: '2026-07-09T21:14:32.000Z',
  betreff: null,
  inhalt_text:
    'Julia hallo, also kurz eine, nee zwei Sachen. Erstens für die Website die Sauerteig-Linie, brauchen wir bis Freitag einen Text, weil dann die neue Seite live geht. Und dann noch, ähm, die Süddeutsche hat sich gemeldet, ein Reporter, der macht eine Reportage über regionales Bäckerhandwerk und will vielleicht mit unserem Klaus sprechen. Was meinst du, kannst du da mal drüberschauen?',
  inhalt_originalsprache: 'de',
  anhaenge: [],
  metadaten_kanalspezifisch: { whatsapp_message_id: 'wamid.HBgL...' },
  audio_originaldauer_sekunden: 47,
  audio_transkript_qualitaet: 'gut',
};

export const KONTEXT_BAECKEREI: KlassifikationsKontext = {
  kunde_slug: 'baeckerei-hoffmann',
  kontakte: [
    { name: 'Sabine Kramer', rolle: 'Marketing-Leitung' },
    { name: 'Klaus Hoffmann', rolle: 'Geschäftsführung' },
  ],
};

export const GUTER_OUTPUT: KlassifikationsErgebnis = {
  vorgang_id: '01H8Z9K2M3N4P5Q6R7S8T9U0V1',
  sprache_eingang: 'de',
  sprache_ausgang: 'de',
  typ_primaer: 'Anfrage',
  typ_sekundaer: 'Presseanfrage',
  confidence: 78,
  sensitivity: 'normal',
  verstandener_inhalt:
    'Sabine Kramer meldet zwei Anliegen: erstens Website-Text für die Sauerteig-Linie bis Freitag, zweitens die Frage, ob Julia eine Presseanfrage der Süddeutschen mit dem CEO Klaus Hoffmann begleiten kann.',
  transkript_qualitaet: 'gut',
  kunde_slug: 'baeckerei-hoffmann',
  prioritaet: 'hoch',
  anliegen: [
    {
      anliegen_id: '01H8Z9K2M3N4P5Q6R7S8T9U0V1-01',
      beschreibung: 'Website-Text für die Sauerteig-Linie',
      prioritaet: 'mittel',
      frist_erschlossen: '2026-07-12',
      frist_annahme: '"bis Freitag" bezogen auf laufende Woche',
      backend_handler_vorschlag: 'W1_pressemitteilung_drafter',
      backend_handler_input: {
        briefing_stichworte: ['Sauerteig-Linie', 'neue Website-Sektion'],
        zielgruppe_vermutet: 'Website-Besucher, Endkunden',
        tonalitaet_vermutet: 'warm-handwerklich',
      },
    },
    {
      anliegen_id: '01H8Z9K2M3N4P5Q6R7S8T9U0V1-02',
      beschreibung: 'Presseanfrage Süddeutsche Zeitung, Reportage regionales Bäckerhandwerk, mit CEO Klaus Hoffmann',
      prioritaet: 'hoch',
      frist_erschlossen: null,
      frist_annahme: null,
      backend_handler_vorschlag: 'W2_presseanfragen_drafter',
      backend_handler_input: {
        medium_name: 'Süddeutsche Zeitung',
        journalist_name: null,
        thema_beschreibung: 'Reportage regionales Bäckerhandwerk',
        sprecher_vorgeschlagen: 'Klaus Hoffmann',
        sprecher_rolle: 'CEO',
      },
    },
  ],
  felder: {
    absender_name: 'Sabine Kramer',
    absender_rolle: 'Marketing-Leitung',
    erwaehnte_personen: ['Julia', 'Klaus'],
  },
  erschlossen: [
    'Klaus verweist auf den CEO Klaus Hoffmann (aus Kontaktdatenbank)',
    'Julia ist die zuständige Beraterin (aus Kontaktdatenbank)',
  ],
  annahmen: [
    'Freitag ist der 12. Juli 2026, in der laufenden Kalenderwoche',
    'Die Zustimmung des CEO Klaus Hoffmann für ein Interview wird von Sabine geklärt, nicht von der Agentur',
  ],
  missing_mandatory: [],
  rueckfragen: [],
  rueckfrage_nachricht: null,
  antwort_nachricht:
    'Hallo Sabine, danke für deine Sprachnotiz. Wir haben zwei Anliegen notiert: erstens den Website-Text für die Sauerteig-Linie bis Freitag, 12. Juli, und zweitens die Presseanfrage der Süddeutschen für die Reportage über regionales Bäckerhandwerk. Julia meldet sich am Vormittag persönlich bei dir, um die Presseanfrage kurz einzuordnen. Der erste Website-Text-Entwurf kommt bis morgen Nachmittag zu dir zurück.',
  routing: {
    rolle: 'senior_beraterin',
    person_slug: 'julia_schmidt',
    verteiler: ['julia_schmidt'],
  },
  backend_calls_geplant: [
    { handler: 'W1_pressemitteilung_drafter', anliegen_id: '01H8Z9K2M3N4P5Q6R7S8T9U0V1-01' },
    { handler: 'W2_presseanfragen_drafter', anliegen_id: '01H8Z9K2M3N4P5Q6R7S8T9U0V1-02' },
  ],
  audit_summary:
    'Vorgang klassifiziert, zwei Anliegen getrennt, an Julia Schmidt geroutet, W1 und W2 aufgerufen, neutrale Bestätigung an Absenderin gesendet.',
  zusammenfassung: 'Zwei Anliegen von Sabine Kramer, Bäckerei Hoffmann: Website-Text bis Freitag plus Süddeutsche-Presseanfrage.',
};

// Aus §7.4, absichtlich mit den dort kommentierten Failure-Modi. Als
// unknown getippt, weil es das Schema bewusst verletzt (nur ein Anliegen
// statt der erwarteten Struktur, Ersatz-Umlaute, verbotene Phrasen).
export const SCHLECHTER_OUTPUT: unknown = {
  vorgang_id: '01H8Z9K2M3N4P5Q6R7S8T9U0V1',
  sprache_eingang: 'de',
  sprache_ausgang: 'de',
  typ_primaer: 'Sonstiges',
  typ_sekundaer: null,
  confidence: 45,
  sensitivity: 'normal',
  verstandener_inhalt: 'Es wurden verschiedene Anliegen erwähnt.',
  transkript_qualitaet: 'gut',
  kunde_slug: 'baeckerei-hoffmann',
  prioritaet: 'mittel',
  anliegen: [
    {
      anliegen_id: '01H8Z9K2M3N4P5Q6R7S8T9U0V1-01',
      beschreibung: 'Text für Website',
      prioritaet: 'mittel',
      frist_erschlossen: null,
      frist_annahme: null,
      backend_handler_vorschlag: null,
      backend_handler_input: {},
    },
  ],
  felder: { absender_name: 'Sabine Kramer', absender_rolle: null, erwaehnte_personen: [] },
  erschlossen: [],
  annahmen: [],
  missing_mandatory: [],
  rueckfragen: ['Bis wann brauchen Sie den Website-Text?', 'Möchten Sie ein Interview vermitteln?'],
  rueckfrage_nachricht: null,
  antwort_nachricht:
    'Liebe Sabine, ich freue mich sehr über deine Nachricht! In der heutigen schnelllebigen Zeit ist es wichtig, dass wir dich schnell unterstützen. Koennten Sie uns mitteilen, bis wann Sie den Website-Text benoetigen und ob Sie ein Interview mit dem CEO wuenschen? Ich wuerde mich freuen, von Ihnen zu hoeren.',
  routing: { rolle: 'senior_beraterin', person_slug: 'julia_schmidt', verteiler: ['julia_schmidt'] },
  backend_calls_geplant: [],
  audit_summary: 'Vorgang klassifiziert.',
  zusammenfassung: 'Verschiedene Anliegen.',
};
