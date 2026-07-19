import { describe, expect, it } from 'vitest';
import { baueHealthPayload } from '../src/health-server.js';
import type { VerbindungsStatus } from '../src/verbindung.js';

describe('baueHealthPayload', () => {
  it('liefert status ok, die Anzahl aktiver Verbindungen und null, wenn noch keine Mail einging', () => {
    const verbindungen: VerbindungsStatus[] = [
      { bezeichnung: 'konsolen-postfach', letzteMailAt: null },
      { bezeichnung: 'kunde-1', letzteMailAt: null },
    ];

    expect(baueHealthPayload(verbindungen)).toEqual({ status: 'ok', verbindungen_aktiv: 2, letzte_mail_at: null });
  });

  it('liefert den spätesten letzte_mail_at-Wert über alle Verbindungen', () => {
    const verbindungen: VerbindungsStatus[] = [
      { bezeichnung: 'a', letzteMailAt: '2026-07-19T08:00:00.000Z' },
      { bezeichnung: 'b', letzteMailAt: '2026-07-19T10:00:00.000Z' },
      { bezeichnung: 'c', letzteMailAt: null },
    ];

    expect(baueHealthPayload(verbindungen).letzte_mail_at).toBe('2026-07-19T10:00:00.000Z');
  });

  it('liefert verbindungen_aktiv 0 ohne Fehler, wenn keine Verbindung läuft', () => {
    expect(baueHealthPayload([])).toEqual({ status: 'ok', verbindungen_aktiv: 0, letzte_mail_at: null });
  });
});
