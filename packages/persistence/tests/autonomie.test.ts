import { describe, expect, it } from 'vitest';
import { autonomieErlaubtAutomatischenVersand } from '../src/autonomie.js';

describe('autonomieErlaubtAutomatischenVersand', () => {
  it('blockiert automatischen Versand bei Stufe 1 (Shadow-Mode, Default)', () => {
    expect(autonomieErlaubtAutomatischenVersand(1)).toBe(false);
  });

  it('erlaubt automatischen Versand ab Stufe 2', () => {
    expect(autonomieErlaubtAutomatischenVersand(2)).toBe(true);
  });

  it('erlaubt automatischen Versand bei Stufe 3', () => {
    expect(autonomieErlaubtAutomatischenVersand(3)).toBe(true);
  });
});
