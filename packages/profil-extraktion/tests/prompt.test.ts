import { describe, expect, it } from 'vitest';
import { buildProfilExtraktionsPrompt } from '../src/prompt.js';

describe('buildProfilExtraktionsPrompt', () => {
  it('enthält die Konservativ-Anweisung im System-Prompt', () => {
    const { system } = buildProfilExtraktionsPrompt('irgendein Text', 'dokument-upload', 'test.pdf');
    expect(system).toContain('KONSERVATIV-PRINZIP');
    expect(system).toContain('IMMER besser als ein erfundener');
  });

  it('nennt die Kennzahlen-Regel (Stichtag und Quelle, kein Raten) explizit', () => {
    const { system } = buildProfilExtraktionsPrompt('irgendein Text', 'dokument-upload', 'test.pdf');
    expect(system.toLowerCase()).toContain('stichtag');
    expect(system).toContain('rate niemals einen plausibel klingenden Wert');
  });

  it('nimmt den beschafften Text unverändert in den User-Prompt auf', () => {
    const { prompt } = buildProfilExtraktionsPrompt('Ein ganz bestimmter Beispieltext.', 'website-scraping', 'https://kunde.example/');
    expect(prompt).toContain('Ein ganz bestimmter Beispieltext.');
    expect(prompt).toContain('https://kunde.example/');
  });

  it('beschreibt die Quelle unterschiedlich für dokument-upload und website-scraping', () => {
    const dokument = buildProfilExtraktionsPrompt('x', 'dokument-upload', 'a.pdf');
    const website = buildProfilExtraktionsPrompt('x', 'website-scraping', 'https://kunde.example/');
    expect(dokument.prompt).toContain('hochgeladenes Dokument');
    expect(website.prompt).toContain('Kunden-Website');
  });
});
