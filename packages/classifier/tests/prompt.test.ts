import { describe, expect, it } from 'vitest';
import { buildKlassifikationsPrompt } from '../src/prompt.js';
import { KONTEXT_BAECKEREI, NACHRICHT_BAECKEREI } from './fixtures.js';

describe('buildKlassifikationsPrompt', () => {
  it('enthält den kunde_slug aus dem Kontext im User-Prompt', () => {
    const { prompt } = buildKlassifikationsPrompt(NACHRICHT_BAECKEREI, KONTEXT_BAECKEREI);
    expect(prompt).toContain('baeckerei-hoffmann');
  });

  it('enthält den Nachrichten-Inhalt im User-Prompt', () => {
    const { prompt } = buildKlassifikationsPrompt(NACHRICHT_BAECKEREI, KONTEXT_BAECKEREI);
    expect(prompt).toContain('Sauerteig-Linie');
  });

  it('nennt die Eskalations-Hardrule im System-Prompt', () => {
    const { system } = buildKlassifikationsPrompt(NACHRICHT_BAECKEREI, KONTEXT_BAECKEREI);
    expect(system).toContain('unantastbar');
    expect(system).toMatch(/Freigabe.*Issue.*Krise/);
  });

  it('fordert echte Umlaute statt Ersatzformen im System-Prompt', () => {
    const { system } = buildKlassifikationsPrompt(NACHRICHT_BAECKEREI, KONTEXT_BAECKEREI);
    expect(system).toContain('ae/oe/ue/ss');
  });
});
