import { describe, expect, it } from 'vitest';
import { erfordertEskalation, erzwingeEskalationsHardrule, neutraleEmpfangsbestaetigung } from '../src/eskalation.js';
import { GUTER_OUTPUT } from './fixtures.js';

describe('erfordertEskalation', () => {
  it('ist true bei sensitivity != normal', () => {
    expect(erfordertEskalation({ sensitivity: 'vertraulich', typ_primaer: 'Anfrage' })).toBe(true);
  });

  it('ist true bei typ_primaer = Krise', () => {
    expect(erfordertEskalation({ sensitivity: 'normal', typ_primaer: 'Krise' })).toBe(true);
  });

  it('ist true bei typ_primaer = Issue', () => {
    expect(erfordertEskalation({ sensitivity: 'normal', typ_primaer: 'Issue' })).toBe(true);
  });

  it('ist true bei typ_primaer = Freigabe', () => {
    expect(erfordertEskalation({ sensitivity: 'normal', typ_primaer: 'Freigabe' })).toBe(true);
  });

  it('ist false bei normal/Anfrage', () => {
    expect(erfordertEskalation({ sensitivity: 'normal', typ_primaer: 'Anfrage' })).toBe(false);
  });
});

describe('erzwingeEskalationsHardrule', () => {
  it('lässt ein unkritisches Ergebnis unverändert', () => {
    const ergebnis = erzwingeEskalationsHardrule(GUTER_OUTPUT);
    expect(ergebnis).toEqual(GUTER_OUTPUT);
  });

  it('leert rueckfragen und rueckfrage_nachricht bei sensitivem Ergebnis', () => {
    const sensitiv = {
      ...GUTER_OUTPUT,
      sensitivity: 'vertraulich' as const,
      rueckfragen: ['Wer ist der Ansprechpartner?'],
      rueckfrage_nachricht: 'Kurze Frage.',
    };
    const ergebnis = erzwingeEskalationsHardrule(sensitiv);
    expect(ergebnis.rueckfragen).toEqual([]);
    expect(ergebnis.rueckfrage_nachricht).toBeNull();
  });

  it('ersetzt antwort_nachricht durch die neutrale Vorlage bei sensitivem Ergebnis', () => {
    const sensitiv = { ...GUTER_OUTPUT, sensitivity: 'krise' as const };
    const ergebnis = erzwingeEskalationsHardrule(sensitiv);
    expect(ergebnis.antwort_nachricht).toContain('ist angekommen und liegt bei');
    expect(ergebnis.antwort_nachricht).not.toBe(GUTER_OUTPUT.antwort_nachricht);
  });

  it('erzwingt die neutrale Antwort auch bei typ_primaer = Issue trotz sensitivity normal', () => {
    const issue = { ...GUTER_OUTPUT, typ_primaer: 'Issue' as const };
    const ergebnis = erzwingeEskalationsHardrule(issue);
    expect(ergebnis.rueckfragen).toEqual([]);
    expect(ergebnis.antwort_nachricht).toContain('Sie meldet sich schnellstmöglich.');
  });
});

describe('neutraleEmpfangsbestaetigung', () => {
  it('nutzt den Absender-Namen in der Anrede, falls bekannt', () => {
    expect(neutraleEmpfangsbestaetigung('Sabine', 'Julia')).toBe(
      'Hallo Sabine, deine Nachricht ist angekommen und liegt bei Julia. Sie meldet sich schnellstmöglich.',
    );
  });

  it('fällt auf eine generische Anrede zurück, falls kein Name bekannt ist', () => {
    expect(neutraleEmpfangsbestaetigung(null, 'Julia')).toBe(
      'Hallo, deine Nachricht ist angekommen und liegt bei Julia. Sie meldet sich schnellstmöglich.',
    );
  });
});
