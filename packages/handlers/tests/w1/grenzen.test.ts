import { describe, expect, it } from 'vitest';
import { pruefeDeterministischeGrenzen } from '../../src/w1/grenzen.js';
import type { Pruefregel } from '../../src/w2/regel-engine/types.js';
import { GUTER_DRAFT } from './fixtures.js';

function grenzeVerboteneAussage(phrase: string): Pruefregel {
  return {
    id: 'grenze-1',
    handler_slug: 'W1_pressemitteilung_drafter',
    typ: 'code_baustein',
    baustein_name: 'kundengrenze_verbotene_aussage',
    parameter: { phrase },
    prompt_text: null,
    aktiv: true,
    reihenfolge: 0,
  };
}

function grenzePflichtbaustein(text: string): Pruefregel {
  return {
    id: 'grenze-2',
    handler_slug: 'W1_pressemitteilung_drafter',
    typ: 'code_baustein',
    baustein_name: 'kundengrenze_pflichtbaustein',
    parameter: { text },
    prompt_text: null,
    aktiv: true,
    reihenfolge: 0,
  };
}

describe('pruefeDeterministischeGrenzen', () => {
  it('keine Grenzen: immer bestanden', () => {
    const ergebnis = pruefeDeterministischeGrenzen(GUTER_DRAFT, []);
    expect(ergebnis.bestanden).toBe(true);
    expect(ergebnis.verstoesse).toHaveLength(0);
  });

  it('verbotene Aussage im Draft-Text (case-insensitiv) -> Verstoß', () => {
    const grenze = grenzeVerboteneAussage('Verantwortung für die Umwelt');
    const ergebnis = pruefeDeterministischeGrenzen(GUTER_DRAFT, [grenze]);

    expect(ergebnis.bestanden).toBe(false);
    expect(ergebnis.verstoesse).toHaveLength(1);
    expect(ergebnis.verstoesse[0]?.baustein_name).toBe('kundengrenze_verbotene_aussage');
  });

  it('verbotene Aussage NICHT im Draft-Text -> kein Verstoß', () => {
    const grenze = grenzeVerboteneAussage('Ein Satz, der garantiert nicht vorkommt');
    const ergebnis = pruefeDeterministischeGrenzen(GUTER_DRAFT, [grenze]);

    expect(ergebnis.bestanden).toBe(true);
  });

  it('fehlender Pflichtbaustein -> Verstoß', () => {
    const grenze = grenzePflichtbaustein('Pflichthinweis gemäß Heilmittelwerbegesetz');
    const ergebnis = pruefeDeterministischeGrenzen(GUTER_DRAFT, [grenze]);

    expect(ergebnis.bestanden).toBe(false);
    expect(ergebnis.verstoesse[0]?.baustein_name).toBe('kundengrenze_pflichtbaustein');
  });

  it('vorhandener Pflichtbaustein -> kein Verstoß', () => {
    const grenze = grenzePflichtbaustein('Kommunikationsabteilung');
    const ergebnis = pruefeDeterministischeGrenzen(GUTER_DRAFT, [grenze]);

    expect(ergebnis.bestanden).toBe(true);
  });

  it('unbekannter Baustein-Name: fail-closed als Verstoß gewertet', () => {
    const grenze: Pruefregel = {
      id: 'grenze-3',
      handler_slug: 'W1_pressemitteilung_drafter',
      typ: 'code_baustein',
      baustein_name: 'unbekannter_baustein',
      parameter: {},
      prompt_text: null,
      aktiv: true,
      reihenfolge: 0,
    };

    const ergebnis = pruefeDeterministischeGrenzen(GUTER_DRAFT, [grenze]);

    expect(ergebnis.bestanden).toBe(false);
    expect(ergebnis.verstoesse[0]?.begruendung).toContain('Unbekannter Grenz-Baustein');
  });

  it('Pflichtbaustein wird nur markiert, nicht automatisch in den Draft eingefügt', () => {
    const grenze = grenzePflichtbaustein('Pflichthinweis gemäß Heilmittelwerbegesetz');
    pruefeDeterministischeGrenzen(GUTER_DRAFT, [grenze]);

    // Der übergebene Draft bleibt unverändert (keine Mutation, kein Rückgabewert mit ergänztem Text).
    expect(GUTER_DRAFT.boilerplate).not.toContain('Heilmittelwerbegesetz');
  });
});
