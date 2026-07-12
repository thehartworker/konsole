import { describe, expect, it } from 'vitest';
import { BAUSTEIN_NAMEN, BAUSTEIN_REGISTRY, type BausteinKontext } from '../../../src/w2/regel-engine/bausteine.js';
import { GUTER_DRAFT, SCHLECHTER_DRAFT } from '../fixtures.js';

const KONTEXT_MIT_SPRACHREGELUNG: BausteinKontext = { sprachregelungVorhanden: true, fristAt: null };
const KONTEXT_OHNE_SPRACHREGELUNG: BausteinKontext = { sprachregelungVorhanden: false, fristAt: null };

describe('BAUSTEIN_REGISTRY', () => {
  it('kennt genau die 8 dokumentierten Code-Bausteine', () => {
    expect(BAUSTEIN_NAMEN.sort()).toEqual(
      [
        'action_items_nur_in_open_questions',
        'background_mit_quellenangabe',
        'deadline_schlusssatz_bei_frist',
        'keine_agentur_vermittlungs_bezug',
        'keine_prozess_erklaerungen',
        'keine_tier_nennung',
        'reactive_statement_nur_bei_sprachregelung',
        'was_wir_tun_zielsprache',
      ].sort(),
    );
  });

  it('was_wir_tun_zielsprache: guter (deutscher) Draft besteht', () => {
    const ergebnis = BAUSTEIN_REGISTRY.was_wir_tun_zielsprache(GUTER_DRAFT, KONTEXT_MIT_SPRACHREGELUNG, { sprache: 'de' });
    expect(ergebnis.bestanden).toBe(true);
  });

  it('was_wir_tun_zielsprache: englischer Text in what_were_doing fällt durch', () => {
    const englischerDraft = { ...GUTER_DRAFT, what_were_doing: 'We are preparing a written response for this journalist.' };
    const ergebnis = BAUSTEIN_REGISTRY.was_wir_tun_zielsprache(englischerDraft, KONTEXT_MIT_SPRACHREGELUNG, { sprache: 'de' });
    expect(ergebnis.bestanden).toBe(false);
  });

  it('reactive_statement_nur_bei_sprachregelung: null ist ok ohne Sprachregelung', () => {
    const ergebnis = BAUSTEIN_REGISTRY.reactive_statement_nur_bei_sprachregelung(
      { ...GUTER_DRAFT, reactive_statement: null },
      KONTEXT_OHNE_SPRACHREGELUNG,
      {},
    );
    expect(ergebnis.bestanden).toBe(true);
  });

  it('reactive_statement_nur_bei_sprachregelung: befülltes Feld ohne Sprachregelung ist ein Verstoß', () => {
    const ergebnis = BAUSTEIN_REGISTRY.reactive_statement_nur_bei_sprachregelung(
      GUTER_DRAFT,
      KONTEXT_OHNE_SPRACHREGELUNG,
      {},
    );
    expect(ergebnis.bestanden).toBe(false);
  });

  it('keine_tier_nennung: guter Draft besteht, schlechter Draft (Tier-1) fällt durch', () => {
    expect(BAUSTEIN_REGISTRY.keine_tier_nennung(GUTER_DRAFT, KONTEXT_MIT_SPRACHREGELUNG, {}).bestanden).toBe(true);
    expect(BAUSTEIN_REGISTRY.keine_tier_nennung(SCHLECHTER_DRAFT, KONTEXT_MIT_SPRACHREGELUNG, {}).bestanden).toBe(false);
  });

  it('keine_agentur_vermittlungs_bezug: erkennt "unsere Agentur hat weitergeleitet"', () => {
    expect(
      BAUSTEIN_REGISTRY.keine_agentur_vermittlungs_bezug(SCHLECHTER_DRAFT, KONTEXT_MIT_SPRACHREGELUNG, {}).bestanden,
    ).toBe(false);
    expect(
      BAUSTEIN_REGISTRY.keine_agentur_vermittlungs_bezug(GUTER_DRAFT, KONTEXT_MIT_SPRACHREGELUNG, {}).bestanden,
    ).toBe(true);
  });

  it('keine_prozess_erklaerungen: erkennt Freigabeprozess-Erklärungen', () => {
    const draft = { ...GUTER_DRAFT, what_were_doing: 'Das muss noch intern geprüft werden, bevor wir antworten.' };
    expect(BAUSTEIN_REGISTRY.keine_prozess_erklaerungen(draft, KONTEXT_MIT_SPRACHREGELUNG, {}).bestanden).toBe(false);
    expect(BAUSTEIN_REGISTRY.keine_prozess_erklaerungen(GUTER_DRAFT, KONTEXT_MIT_SPRACHREGELUNG, {}).bestanden).toBe(true);
  });

  it('action_items_nur_in_open_questions: TODO außerhalb open_questions ist ein Verstoß', () => {
    expect(
      BAUSTEIN_REGISTRY.action_items_nur_in_open_questions(SCHLECHTER_DRAFT, KONTEXT_MIT_SPRACHREGELUNG, {}).bestanden,
    ).toBe(false);
    expect(
      BAUSTEIN_REGISTRY.action_items_nur_in_open_questions(GUTER_DRAFT, KONTEXT_MIT_SPRACHREGELUNG, {}).bestanden,
    ).toBe(true);
  });

  it('background_mit_quellenangabe: fehlende Quelle ist ein Verstoß', () => {
    expect(BAUSTEIN_REGISTRY.background_mit_quellenangabe(SCHLECHTER_DRAFT, KONTEXT_MIT_SPRACHREGELUNG, {}).bestanden).toBe(
      false,
    );
    expect(BAUSTEIN_REGISTRY.background_mit_quellenangabe(GUTER_DRAFT, KONTEXT_MIT_SPRACHREGELUNG, {}).bestanden).toBe(
      true,
    );
  });

  it('deadline_schlusssatz_bei_frist: ohne frist_at immer bestanden', () => {
    const ergebnis = BAUSTEIN_REGISTRY.deadline_schlusssatz_bei_frist(SCHLECHTER_DRAFT, { sprachregelungVorhanden: true, fristAt: null }, {});
    expect(ergebnis.bestanden).toBe(true);
  });

  it('deadline_schlusssatz_bei_frist: mit frist_at fehlt der standardisierte Hinweis im schlechten Draft', () => {
    const kontext: BausteinKontext = { sprachregelungVorhanden: true, fristAt: '2026-07-15T15:00:00.000Z' };
    expect(BAUSTEIN_REGISTRY.deadline_schlusssatz_bei_frist(SCHLECHTER_DRAFT, kontext, {}).bestanden).toBe(false);
    expect(BAUSTEIN_REGISTRY.deadline_schlusssatz_bei_frist(GUTER_DRAFT, kontext, {}).bestanden).toBe(true);
  });
});
