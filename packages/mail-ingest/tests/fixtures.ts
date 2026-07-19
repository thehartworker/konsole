import type { ImapNachricht, KundenMailAnbindung } from '../src/types.js';

export function baueImapNachricht(overrides: Partial<ImapNachricht> = {}): ImapNachricht {
  return {
    uid: 1,
    messageId: '<abc123@absender.example>',
    von: 'kunde@kunde-a1.example',
    an: ['mensch-betrieb+neurabin-pharma@intake.example.de'],
    cc: [],
    bcc: [],
    betreff: 'Testbetreff',
    textBody: 'Testinhalt.',
    htmlBody: null,
    datum: '2026-07-19T09:00:00.000Z',
    anhaenge: [],
    ...overrides,
  };
}

export function baueAnbindung(overrides: Partial<KundenMailAnbindung> = {}): KundenMailAnbindung {
  return {
    id: 'anbindung-1',
    kundeId: 'kunde-1',
    agenturId: 'agentur-1',
    anbindungsTyp: 'weiterleitung',
    konsolenAdresse: 'mensch-betrieb+neurabin-pharma@intake.example.de',
    aktiv: true,
    ...overrides,
  };
}
