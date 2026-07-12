import { describe, expect, it } from 'vitest';
import { ProfilExtraktionsVorschlagSchema } from '../src/schema.js';
import { SCHLECHTER_OUTPUT, VOLLSTAENDIGER_OUTPUT } from './fixtures.js';

describe('ProfilExtraktionsVorschlagSchema', () => {
  it('akzeptiert einen vollständigen, gültigen Vorschlag', () => {
    const ergebnis = ProfilExtraktionsVorschlagSchema.safeParse(VOLLSTAENDIGER_OUTPUT);
    expect(ergebnis.success).toBe(true);
  });

  it('akzeptiert einen Vorschlag, in dem alle Felder null/leer sind (kein Zwang zur Befüllung)', () => {
    const leer = {
      fakten: { rechtsform: null, sitz: null, geschaeftsbeschreibung: null },
      stimme: { grundton: null, anrede_konvention: null, gendering_konvention: null, zielsprache_absender_texte: null },
      strategie: { positionierung: null, usp: null },
      boilerplate: [],
      kennzahlen: [],
      sprecher: [],
      kernbotschaften: [],
      themen: [],
      grenzen: [],
      medien_kontext: [],
      unklare_hinweise: [],
    };
    const ergebnis = ProfilExtraktionsVorschlagSchema.safeParse(leer);
    expect(ergebnis.success).toBe(true);
  });

  it('lehnt einen ungültigen grundton-Enum-Wert ab', () => {
    const ergebnis = ProfilExtraktionsVorschlagSchema.safeParse(SCHLECHTER_OUTPUT);
    expect(ergebnis.success).toBe(false);
  });

  it('lehnt eine Kennzahl ohne bezeichnung/wert ab (Pflichtfelder, unabhängig von Stichtag/Quelle)', () => {
    const vorschlag = {
      ...VOLLSTAENDIGER_OUTPUT,
      kennzahlen: [{ bezeichnung: '', wert: '128', stichtag: '2025-12-31', quelle: 'Jahresabschluss' }],
    };
    const ergebnis = ProfilExtraktionsVorschlagSchema.safeParse(vorschlag);
    expect(ergebnis.success).toBe(false);
  });

  it('akzeptiert eine Kennzahl mit null bei Stichtag/Quelle (Zod-Ebene erlaubt das bewusst, Konservativ-Filterung passiert separat)', () => {
    const vorschlag = {
      ...VOLLSTAENDIGER_OUTPUT,
      kennzahlen: [{ bezeichnung: 'Umsatz', wert: '10 Mio.', stichtag: null, quelle: null }],
    };
    const ergebnis = ProfilExtraktionsVorschlagSchema.safeParse(vorschlag);
    expect(ergebnis.success).toBe(true);
  });

  it('lehnt einen ungültigen kunden_grenzen_typ ab', () => {
    const vorschlag = {
      ...VOLLSTAENDIGER_OUTPUT,
      grenzen: [{ typ: 'komplett_erfundener_typ', inhalt: 'x', textart_geltungsbereich: null }],
    };
    const ergebnis = ProfilExtraktionsVorschlagSchema.safeParse(vorschlag);
    expect(ergebnis.success).toBe(false);
  });

  it('hat kein ist_deterministisch_erzwungen-Feld im Grenzen-Schema (KI darf das Flag nicht selbst setzen)', () => {
    const vorschlag = {
      ...VOLLSTAENDIGER_OUTPUT,
      grenzen: [{ typ: 'verbotene_aussage', inhalt: 'x', textart_geltungsbereich: null, ist_deterministisch_erzwungen: true }],
    };
    const geparst = ProfilExtraktionsVorschlagSchema.parse(vorschlag);
    // Zod-Objekte ohne .strict() ignorieren unbekannte Felder -- das
    // durchgeschmuggelte ist_deterministisch_erzwungen darf im geparsten
    // Ergebnis nicht auftauchen.
    expect(geparst.grenzen[0]).not.toHaveProperty('ist_deterministisch_erzwungen');
  });
});
