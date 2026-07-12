import { describe, expect, it } from 'vitest';
import { wendeKonservativesPrinzipAn } from '../src/konservativ.js';
import { OUTPUT_MIT_UNBELEGTER_KENNZAHL, VOLLSTAENDIGER_OUTPUT } from './fixtures.js';

describe('wendeKonservativesPrinzipAn', () => {
  it('lässt einen vollständig belegten Vorschlag unverändert', () => {
    const ergebnis = wendeKonservativesPrinzipAn(VOLLSTAENDIGER_OUTPUT);
    expect(ergebnis.vorschlag).toEqual(VOLLSTAENDIGER_OUTPUT);
    expect(ergebnis.verworfeneKennzahlen).toBe(0);
  });

  it('verwirft eine Kennzahl ohne Stichtag UND Quelle, behält belegte Kennzahlen', () => {
    const ergebnis = wendeKonservativesPrinzipAn(OUTPUT_MIT_UNBELEGTER_KENNZAHL);
    expect(ergebnis.vorschlag.kennzahlen).toEqual([
      { bezeichnung: 'Mitarbeitende', wert: '128', stichtag: '2025-12-31', quelle: 'Jahresabschluss 2025' },
    ]);
    expect(ergebnis.verworfeneKennzahlen).toBe(1);
  });

  it('verwirft eine Kennzahl mit Stichtag aber OHNE Quelle', () => {
    const vorschlag = {
      ...VOLLSTAENDIGER_OUTPUT,
      kennzahlen: [{ bezeichnung: 'Umsatz', wert: '10 Mio.', stichtag: '2025-12-31', quelle: null }],
    };
    const ergebnis = wendeKonservativesPrinzipAn(vorschlag);
    expect(ergebnis.vorschlag.kennzahlen).toEqual([]);
    expect(ergebnis.verworfeneKennzahlen).toBe(1);
  });

  it('verwirft eine Kennzahl mit Quelle aber OHNE Stichtag', () => {
    const vorschlag = {
      ...VOLLSTAENDIGER_OUTPUT,
      kennzahlen: [{ bezeichnung: 'Umsatz', wert: '10 Mio.', stichtag: null, quelle: 'Investor Relations' }],
    };
    const ergebnis = wendeKonservativesPrinzipAn(vorschlag);
    expect(ergebnis.vorschlag.kennzahlen).toEqual([]);
    expect(ergebnis.verworfeneKennzahlen).toBe(1);
  });

  it('verwirft eine Kennzahl mit leerem String statt null bei Stichtag/Quelle (kein Umgehungsweg über Leerstring)', () => {
    const vorschlag = {
      ...VOLLSTAENDIGER_OUTPUT,
      kennzahlen: [{ bezeichnung: 'Umsatz', wert: '10 Mio.', stichtag: '   ', quelle: 'Investor Relations' }],
    };
    const ergebnis = wendeKonservativesPrinzipAn(vorschlag);
    expect(ergebnis.vorschlag.kennzahlen).toEqual([]);
  });

  it('lässt andere Kategorien (sprecher, grenzen) beim Kennzahlen-Filtern unangetastet', () => {
    const ergebnis = wendeKonservativesPrinzipAn(OUTPUT_MIT_UNBELEGTER_KENNZAHL);
    expect(ergebnis.vorschlag.sprecher).toEqual(VOLLSTAENDIGER_OUTPUT.sprecher);
    expect(ergebnis.vorschlag.grenzen).toEqual(VOLLSTAENDIGER_OUTPUT.grenzen);
  });
});
