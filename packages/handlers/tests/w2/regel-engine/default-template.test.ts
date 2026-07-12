import { describe, expect, it } from 'vitest';
import { BAUSTEIN_NAMEN } from '../../../src/w2/regel-engine/bausteine.js';
import { W2_DEFAULT_PRUEFREGELN, W2_HANDLER_SLUG } from '../../../src/w2/regel-engine/default-template.js';

describe('W2_DEFAULT_PRUEFREGELN', () => {
  it('enthält genau 12 Regeln (8 Code-Bausteine + 4 LLM-Prompt-Regeln)', () => {
    expect(W2_DEFAULT_PRUEFREGELN).toHaveLength(12);
    expect(W2_DEFAULT_PRUEFREGELN.filter((r) => r.typ === 'code_baustein')).toHaveLength(8);
    expect(W2_DEFAULT_PRUEFREGELN.filter((r) => r.typ === 'llm_prompt')).toHaveLength(4);
  });

  it('jede code_baustein-Regel referenziert einen tatsächlich existierenden Baustein', () => {
    for (const regel of W2_DEFAULT_PRUEFREGELN.filter((r) => r.typ === 'code_baustein')) {
      expect(regel.baustein_name).not.toBeNull();
      expect(BAUSTEIN_NAMEN).toContain(regel.baustein_name);
      expect(regel.prompt_text).toBeNull();
    }
  });

  it('jede llm_prompt-Regel hat einen nicht-leeren prompt_text und keinen baustein_name', () => {
    for (const regel of W2_DEFAULT_PRUEFREGELN.filter((r) => r.typ === 'llm_prompt')) {
      expect(regel.prompt_text).toBeTruthy();
      expect(regel.baustein_name).toBeNull();
    }
  });

  it('alle Regeln sind aktiv und gehören zu W2_presseanfragen_drafter', () => {
    for (const regel of W2_DEFAULT_PRUEFREGELN) {
      expect(regel.aktiv).toBe(true);
      expect(regel.handler_slug).toBe(W2_HANDLER_SLUG);
    }
  });

  it('reihenfolge ist 1..12, eindeutig', () => {
    const reihenfolgen = W2_DEFAULT_PRUEFREGELN.map((r) => r.reihenfolge).sort((a, b) => a - b);
    expect(reihenfolgen).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});
